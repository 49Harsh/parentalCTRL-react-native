package com.parentalcontrolclient

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.location.Location
import android.location.LocationManager
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import io.agora.rtc2.Constants
import io.agora.rtc2.IRtcEngineEventHandler
import io.agora.rtc2.RtcEngine
import io.agora.rtc2.RtcEngineConfig
import io.agora.rtc2.video.VideoEncoderConfiguration
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/**
 * Foreground service that keeps the child device reachable from the admin app
 * at all times — even when the app UI is closed or the device is locked.
 *
 * Responsibilities:
 * - Heartbeat polling (native OkHttp, every 3 s)
 * - Command processing (SCREEN_STREAM_START / STOP via AccessibilityService)
 * - Camera + microphone streaming via native Agora SDK (no local preview)
 * - Auto-approve LIVE_SESSION_REQUEST for AirDroid-style always-on access
 */
class MonitoringService : Service() {

  companion object {
    const val CHANNEL_ID = "family_monitoring"
    const val NOTIFICATION_ID = 1407
    const val ACTION_START = "com.parentalcontrolclient.action.START_MONITORING"
    const val ACTION_STOP = "com.parentalcontrolclient.action.STOP_MONITORING"
    const val ACTION_UPDATE_CONFIG = "com.parentalcontrolclient.action.UPDATE_CONFIG"
    private const val PREFS = "family_guard_bg"
    private const val HEARTBEAT_INTERVAL_S = 3L
    private const val SYNC_INTERVAL_S = 30L

    @Volatile
    var instance: MonitoringService? = null
      private set

    /** Set by ParentalControlModule — the Service's own context is not a ReactApplicationContext. */
    @Volatile
    var reactContext: ReactApplicationContext? = null
  }

  // ── Threading ──────────────────────────────────────────────────────────

  private val mainHandler = Handler(Looper.getMainLooper())
  private val heartbeatExecutor: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor()
  private val syncExecutor: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor()

  private val httpClient = OkHttpClient.Builder()
    .connectTimeout(10, TimeUnit.SECONDS)
    .readTimeout(10, TimeUnit.SECONDS)
    .build()

  private var heartbeatFuture: ScheduledFuture<*>? = null
  private var syncFuture: ScheduledFuture<*>? = null

  // ── Battery state ──────────────────────────────────────────────────────

  private var batteryLevel: Int = -1
  private var isCharging: Boolean = false
  private var batteryHealth: String = "unknown"
  private var batteryTemp: Float = 0f
  private var batteryVoltage: Int = 0
  private var batteryReceiver: BroadcastReceiver? = null

  // ── Location state ─────────────────────────────────────────────────────

  private var locationManager: LocationManager? = null
  private var locationListener: android.location.LocationListener? = null
  private var lastLocation: Location? = null
  private var lastLocationUploadTime: Long = 0L

  // ── Configuration (persisted in SharedPreferences) ──────────────────────

  private var baseUrl = ""
  private var deviceId = ""
  private var authToken = ""

  // ── Agora state ────────────────────────────────────────────────────────

  private var agoraEngine: RtcEngine? = null
  private var agoraEventHandler: IRtcEngineEventHandler? = null
  private var wakeLock: PowerManager.WakeLock? = null

  @Volatile
  var isAgoraStreaming = false
    private set

  @Volatile
  var statusText = "Idle"
    private set

  // ═══════════════════════════════════════════════════════════════════════
  // Service lifecycle
  // ═══════════════════════════════════════════════════════════════════════

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
    acquireWakeLock()
    registerBatteryReceiver()
    instance = this
  }

  override fun onDestroy() {
    shutdown()
    unregisterBatteryReceiver()
    stopLocationUpdates()
    releaseWakeLock()
    instance = null
    super.onDestroy()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        shutdown()
        stopSelf()
        return START_NOT_STICKY
      }
      ACTION_UPDATE_CONFIG -> {
        baseUrl = intent.getStringExtra("baseUrl") ?: ""
        deviceId = intent.getStringExtra("deviceId") ?: ""
        authToken = intent.getStringExtra("token") ?: ""
        persistConfig()
        restartHeartbeat()
        updateNotification()
      }
      else -> {
        // ACTION_START or null (e.g. BootReceiver restart)
        startForegroundNotification()
        val extraBaseUrl = intent?.getStringExtra("baseUrl")
        if (!extraBaseUrl.isNullOrEmpty()) {
          // Fresh credentials from the RN bridge — persist and use them.
          baseUrl = extraBaseUrl.trimEnd('/')
          deviceId = intent.getStringExtra("deviceId") ?: ""
          authToken = intent.getStringExtra("token") ?: ""
          persistConfig()
        } else {
          loadConfig()
        }
        startHeartbeat()
        startSyncTimer()
        startLocationUpdates()
      }
    }
    return START_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    // Restart the service if the user swipes the app from recents.
    try {
      val restartIntent = Intent(applicationContext, this.javaClass).apply {
        setPackage(packageName)
        action = ACTION_START
      }
      val pendingIntent = PendingIntent.getService(
        applicationContext, 1, restartIntent,
        PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
      )
      val alarmManager = getSystemService(Context.ALARM_SERVICE) as? AlarmManager
      alarmManager?.set(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + 1000, pendingIntent)
    } catch (_: Exception) {}
    super.onTaskRemoved(rootIntent)
  }

  override fun onBind(intent: Intent?): IBinder? = null

  // ═══════════════════════════════════════════════════════════════════════
  // Notification
  // ═══════════════════════════════════════════════════════════════════════

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "FamilyGuard Monitoring",
        NotificationManager.IMPORTANCE_MIN
      ).apply {
        description = "Shows when FamilyGuard monitoring is active"
        setShowBadge(false)
        setSound(null, null)
      }
      getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
    }
  }

  private fun startForegroundNotification() {
    val notificationIntent = Intent(this, MainActivity::class.java)
    val pendingIntent = PendingIntent.getActivity(
      this, 0, notificationIntent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
    val notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("FamilyGuard is active")
      .setContentText(statusText)
      .setOngoing(true)
      .setContentIntent(pendingIntent)
      .setPriority(NotificationCompat.PRIORITY_MIN)
      .setVisibility(NotificationCompat.VISIBILITY_SECRET)
      .build()

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        // Only declare the location FGS type when the runtime permission is held,
        // otherwise Android 14+ throws SecurityException at startForeground.
        var types = android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or
          android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
        if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) ==
          android.content.pm.PackageManager.PERMISSION_GRANTED) {
          types = types or android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
        }
        startForeground(NOTIFICATION_ID, notification, types)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (_: Exception) {
      try { startForeground(NOTIFICATION_ID, notification) } catch (_: Exception) {}
    }
  }

  private fun updateNotification() {
    try {
      val notification = NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle("FamilyGuard is active")
        .setContentText(statusText)
        .setOngoing(true)
        .setPriority(NotificationCompat.PRIORITY_MIN)
        .setVisibility(NotificationCompat.VISIBILITY_SECRET)
        .build()
      val manager = getSystemService(NotificationManager::class.java) as? NotificationManager
      manager?.notify(NOTIFICATION_ID, notification)
    } catch (_: Exception) {}
  }

  // ═══════════════════════════════════════════════════════════════════════
  // WakeLock — keeps CPU alive so heartbeat runs even in doze mode
  // ═══════════════════════════════════════════════════════════════════════

  private fun acquireWakeLock() {
    try {
      val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager
      wakeLock = pm?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "FamilyGuard:Monitoring")
      wakeLock?.acquire(12 * 60 * 60 * 1000L) // 12 hours max, re-acquired on restart
    } catch (_: Exception) {}
  }

  private fun releaseWakeLock() {
    try { wakeLock?.release() } catch (_: Exception) {}
    wakeLock = null
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Configuration
  // ═══════════════════════════════════════════════════════════════════════

  private fun loadConfig() {
    val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    baseUrl = prefs.getString("baseUrl", "") ?: ""
    deviceId = prefs.getString("deviceId", "") ?: ""
    authToken = prefs.getString("authToken", "") ?: ""
  }

  private fun persistConfig() {
    getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().apply {
      putString("baseUrl", baseUrl)
      putString("deviceId", deviceId)
      putString("authToken", authToken)
      apply()
    }
  }

  /** Called from the RN bridge to configure (or update) credentials. */
  fun updateConfig(newBaseUrl: String, newDeviceId: String, newToken: String) {
    baseUrl = newBaseUrl.trimEnd('/')
    deviceId = newDeviceId
    authToken = newToken
    persistConfig()
    restartHeartbeat()
    updateNotification()
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Heartbeat (native OkHttp — never blocked by JS thread suspension)
  // ═══════════════════════════════════════════════════════════════════════

  private fun restartHeartbeat() {
    stopHeartbeat()
    startHeartbeat()
  }

  private fun startHeartbeat() {
    if (baseUrl.isEmpty() || deviceId.isEmpty() || authToken.isEmpty()) {
      statusText = "Waiting for login…"
      updateNotification()
      return
    }
    if (heartbeatFuture != null) return

    statusText = "Active — monitoring"
    updateNotification()

    heartbeatFuture = heartbeatExecutor.scheduleAtFixedRate(
      { sendHeartbeat() },
      0,
      HEARTBEAT_INTERVAL_S,
      TimeUnit.SECONDS
    )
  }

  private fun stopHeartbeat() {
    heartbeatFuture?.cancel(false)
    heartbeatFuture = null
  }

  private fun sendHeartbeat() {
    val url = "$baseUrl/api/devices/$deviceId/heartbeat"
    val body = JSONObject().apply {
      put("appVersion", "0.0.1")
      if (batteryLevel >= 0) put("batteryLevel", batteryLevel)
      put("charging", isCharging)
      put("batteryHealth", batteryHealth)
      if (batteryTemp > 0) put("batteryTemperature", batteryTemp.toInt())
      if (batteryVoltage > 0) put("batteryVoltage", batteryVoltage)
    }
    val request = Request.Builder()
      .url(url)
      .header("Authorization", "Bearer $authToken")
      .post(body.toString().toRequestBody("application/json".toMediaType()))
      .build()

    httpClient.newCall(request).enqueue(object : Callback {
      override fun onFailure(call: Call, e: IOException) {
        // Network hiccup — next cycle will retry.
      }

      override fun onResponse(call: Call, response: Response) {
        response.use {
          if (!it.isSuccessful) {
            if (it.code == 401 || it.code == 403) {
              statusText = "Auth expired — open app to re-login"
              updateNotification()
            }
            return
          }
          try {
            val data = JSONObject(it.body?.string() ?: "{}")
            processHeartbeatResponse(data)
          } catch (_: Exception) {
            // Malformed JSON — skip this cycle.
          }
        }
      }
    })
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Command processing
  // ═══════════════════════════════════════════════════════════════════════

  private fun processHeartbeatResponse(data: JSONObject) {
    // 1. Handle pending commands — ONLY the ones this service processes.
    //    REMOTE_TOUCH / REMOTE_ACTION are left for the JS side (HomeScreen).
    val commands = data.optJSONArray("commands")
    if (commands != null) {
      for (i in 0 until commands.length()) {
        val cmd = commands.getJSONObject(i)
        val type = cmd.optString("type", "")
        val cmdId = cmd.optString("_id", "")
        if (cmd.optString("status", "") != "pending") continue

        var handled = true
        when (type) {
          "SCREEN_STREAM_START" -> handled = handleScreenStreamStart(cmd)
          "SCREEN_STREAM_STOP"  -> handleScreenStreamStop()
          "END_SESSION"         -> handleEndSession()
          else                  -> handled = false
        }
        if (handled && cmdId.isNotEmpty()) markCommandCompleted(cmdId)
      }
    }

    // 2. Handle active live session request (Agora camera + mic)
    val liveReq = data.optJSONObject("activeLiveRequest")
    if (liveReq != null && liveReq.optString("status") == "accepted") {
      if (!isAgoraStreaming) {
        handleLiveSessionRequest(liveReq)
      }
    } else if (liveReq == null && isAgoraStreaming) {
      // No active request — stop Agora.
      stopAgora()
    }
  }

  // ── Screen capture commands ────────────────────────────────────────────

  private fun handleScreenStreamStart(cmd: JSONObject): Boolean {
    val service = RemoteControlService.instance
    if (service == null) {
      // Accessibility service is disabled (a reinstall resets it) — leave the
      // command pending so it retries automatically once the user re-enables it.
      statusText = "Accessibility OFF — enable to stream screen"
      updateNotification()
      emitEvent("accessibility_off", emptyMap())
      return false
    }
    if (service.isScreenshotStreaming) return true // Already running

    val fps = try { cmd.optJSONObject("payload")?.optInt("fps", 12) ?: 12 } catch (_: Exception) { 12 }
    val started = service.startScreenshotStreaming(fps, baseUrl, deviceId, authToken)
    if (started) {
      statusText = "Screen streaming active"
      updateNotification()
      emitEvent("screen_stream_started", mapOf("fps" to fps))
    }
    return started
  }

  private fun handleScreenStreamStop() {
    RemoteControlService.instance?.stopScreenshotStreaming()
    if (!isAgoraStreaming) {
      statusText = "Active — monitoring"
    }
    updateNotification()
    emitEvent("screen_stream_stopped", emptyMap())
  }

  // ── Agora live session ────────────────────────────────────────────────

  private fun handleLiveSessionRequest(request: JSONObject) {
    val requestId = request.optString("_id", "")
    if (requestId.isEmpty()) return

    // The backend auto-approves LIVE_SESSION_REQUEST at creation time, so the
    // request arrives here with status 'accepted' already — no approve call
    // needed (the /live-session/approve endpoint only accepts 'pending'
    // requests and would 404). Go straight to joining the channel.
    fetchAgoraTokenAndStart()
  }

  private fun fetchAgoraTokenAndStart() {
    statusText = "Joining camera & mic…"
    updateNotification()

    val tokenUrl = "$baseUrl/api/stream/token/client/$deviceId"
    val req = Request.Builder()
      .url(tokenUrl)
      .header("Authorization", "Bearer $authToken")
      .get()
      .build()

    httpClient.newCall(req).enqueue(object : Callback {
      override fun onFailure(call: Call, e: IOException) {
        statusText = "Token fetch failed — will retry"
        updateNotification()
      }

      override fun onResponse(call: Call, response: Response) {
        response.use {
          if (!it.isSuccessful) return
          try {
            val data = JSONObject(it.body?.string() ?: "{}")
            if (data.optBoolean("success", false)) {
              val appId = data.getString("appId")
              val channel = data.getString("channel")
              val token = data.getString("token")
              mainHandler.post { startAgora(appId, channel, token) }
            }
          } catch (_: Exception) {
            statusText = "Token parse failed"
            updateNotification()
          }
        }
      }
    })
  }

  private fun handleEndSession() {
    stopAgora()
    RemoteControlService.instance?.stopScreenshotStreaming()
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Native Agora (camera + mic, no local preview on child screen)
  // ═══════════════════════════════════════════════════════════════════════

  private fun startAgora(appId: String, channelName: String, token: String) {
    try {
      if (agoraEngine != null) return // Already initialised

      agoraEventHandler = object : IRtcEngineEventHandler() {
        override fun onJoinChannelSuccess(channel: String?, uid: Int, elapsed: Int) {
          isAgoraStreaming = true
          statusText = "Camera & mic streaming"
          updateNotification()
          emitEvent("agora_started", emptyMap())
        }

        override fun onLeaveChannel(stats: IRtcEngineEventHandler.RtcStats?) {
          isAgoraStreaming = false
          statusText = "Active — monitoring"
          updateNotification()
          emitEvent("agora_stopped", emptyMap())
        }

        override fun onError(err: Int) {
          if (err == 1052 || err == -1052) return // Non-critical internal warning
          statusText = "Agora error $err"
          updateNotification()
          emitEvent("agora_error", mapOf("code" to err))
        }

        override fun onConnectionStateChanged(state: Int, reason: Int) {
          if (state == Constants.CONNECTION_STATE_DISCONNECTED) {
            isAgoraStreaming = false
            statusText = "Disconnected — reconnecting…"
            updateNotification()
          }
        }
      }

      val config = RtcEngineConfig()
      config.mContext = applicationContext
      config.mAppId = appId
      config.mEventHandler = agoraEventHandler

      agoraEngine = RtcEngine.create(config)
      agoraEngine?.apply {
        setChannelProfile(Constants.CHANNEL_PROFILE_LIVE_BROADCASTING)
        setClientRole(Constants.CLIENT_ROLE_BROADCASTER)
        enableVideo()
        enableAudio()
        setVideoEncoderConfiguration(
          VideoEncoderConfiguration(
            VideoEncoderConfiguration.VD_640x480,
            VideoEncoderConfiguration.FRAME_RATE.FRAME_RATE_FPS_15,
            VideoEncoderConfiguration.STANDARD_BITRATE,
            VideoEncoderConfiguration.ORIENTATION_MODE.ORIENTATION_MODE_ADAPTIVE
          )
        )
        setAudioProfile(Constants.AUDIO_PROFILE_MUSIC_STANDARD, Constants.AUDIO_SCENARIO_GAME_STREAMING)

        // startPreview captures the camera. No local SurfaceView is attached, so
        // the child does NOT see the camera feed on their screen. The video is
        // published to the Agora channel automatically.
        startPreview()
        joinChannel(token, channelName, "", 0)
      }

      statusText = "Connecting to Agora…"
      updateNotification()
    } catch (e: Exception) {
      statusText = "Agora start failed: ${e.message}"
      updateNotification()
      e.printStackTrace()
    }
  }

  private fun stopAgora() {
    try {
      agoraEngine?.leaveChannel()
      agoraEngine?.stopPreview()
      RtcEngine.destroy()
    } catch (_: Exception) {}
    agoraEngine = null
    agoraEventHandler = null
    isAgoraStreaming = false
    if (RemoteControlService.instance?.isScreenshotStreaming != true) {
      statusText = "Active — monitoring"
    }
    updateNotification()
    emitEvent("agora_stopped", emptyMap())
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════════════

  private fun markCommandCompleted(commandId: String) {
    if (commandId.isEmpty()) return
    val body = JSONObject().apply {
      put("lastCommandId", commandId)
      put("lastCommandStatus", "executed")
    }
    val req = Request.Builder()
      .url("$baseUrl/api/devices/$deviceId/heartbeat")
      .header("Authorization", "Bearer $authToken")
      .post(body.toString().toRequestBody("application/json".toMediaType()))
      .build()
    httpClient.newCall(req).enqueue(object : Callback {
      override fun onFailure(call: Call, e: IOException) {}
      override fun onResponse(call: Call, response: Response) { response.close() }
    })
  }

  /** Emit an event to the JS side (HomeScreen) for UI updates. */
  private fun emitEvent(name: String, params: Map<String, Any>) {
    val appContext = reactContext ?: return
    mainHandler.post {
      try {
        val map = Arguments.createMap().apply {
          putString("event", name)
          params.forEach { (k, v) ->
            when (v) {
              is String  -> putString(k, v)
              is Int     -> putInt(k, v)
              is Boolean -> putBoolean(k, v)
              is Double  -> putDouble(k, v)
              else       -> putString(k, v.toString())
            }
          }
        }
        appContext
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("BackgroundCommand", map)
      } catch (_: Exception) {
        // JS may not be available when the app is in background — that's fine.
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Battery monitoring
  // ═══════════════════════════════════════════════════════════════════════

  private fun registerBatteryReceiver() {
    if (batteryReceiver != null) return
    batteryReceiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) {
        val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
        batteryLevel = if (scale > 0) ((level * 100) / scale) else -1
        val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, BatteryManager.BATTERY_STATUS_UNKNOWN)
        isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL
        batteryHealth = when (intent.getIntExtra(BatteryManager.EXTRA_HEALTH, BatteryManager.BATTERY_HEALTH_UNKNOWN)) {
          BatteryManager.BATTERY_HEALTH_GOOD -> "good"
          BatteryManager.BATTERY_HEALTH_OVERHEAT -> "overheat"
          BatteryManager.BATTERY_HEALTH_DEAD -> "dead"
          BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE -> "over_voltage"
          BatteryManager.BATTERY_HEALTH_UNSPECIFIED_FAILURE -> "failure"
          else -> "unknown"
        }
        batteryTemp = intent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) / 10f
        batteryVoltage = intent.getIntExtra(BatteryManager.EXTRA_VOLTAGE, 0)
      }
    }
    registerReceiver(batteryReceiver, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
  }

  private fun unregisterBatteryReceiver() {
    try { batteryReceiver?.let { unregisterReceiver(it) } } catch (_: Exception) {}
    batteryReceiver = null
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Location tracking
  // ═══════════════════════════════════════════════════════════════════════

  @Suppress("MissingPermission")
  private fun startLocationUpdates() {
    try {
      val lm = getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return
      if (!lm.isProviderEnabled(LocationManager.GPS_PROVIDER) && !lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) return

      // Check for runtime permission on Android 6+
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        val hasPermission = checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) ==
          android.content.pm.PackageManager.PERMISSION_GRANTED
        if (!hasPermission) return
      }

      locationManager = lm
      val listener = object : android.location.LocationListener {
        override fun onLocationChanged(location: Location) {
          lastLocation = location
          uploadLocation(location)
        }
        override fun onStatusChanged(provider: String, status: Int, extras: android.os.Bundle) {}
        override fun onProviderEnabled(provider: String) {}
        override fun onProviderDisabled(provider: String) {}
      }
      locationListener = listener
      try { lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 60000L, 10f, listener, mainLooper) } catch (_: Exception) {}
      try { lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 60000L, 10f, listener, mainLooper) } catch (_: Exception) {}
    } catch (_: Exception) {}
  }

  private fun stopLocationUpdates() {
    try {
      val lm = locationManager ?: return
      locationListener?.let { lm.removeUpdates(it) }
      locationListener = null
      locationManager = null
    } catch (_: Exception) {}
  }

  private fun uploadLocation(location: Location) {
    if (baseUrl.isEmpty() || deviceId.isEmpty() || authToken.isEmpty()) return
    val now = System.currentTimeMillis()
    if (now - lastLocationUploadTime < 45000L) return // Throttle to ~every 45s
    lastLocationUploadTime = now

    val body = JSONObject().apply {
      put("latitude", location.latitude)
      put("longitude", location.longitude)
      put("accuracy", location.accuracy.toDouble())
      put("capturedAt", location.time) // epoch millis — Mongoose casts to Date
    }
    val req = Request.Builder()
      .url("$baseUrl/api/devices/$deviceId/locations")
      .header("Authorization", "Bearer $authToken")
      .post(body.toString().toRequestBody("application/json".toMediaType()))
      .build()
    httpClient.newCall(req).enqueue(object : Callback {
      override fun onFailure(call: Call, e: IOException) {}
      override fun onResponse(call: Call, response: Response) { response.close() }
    })
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Sync timer — uploads queued notifications & call logs every 30s
  // ═══════════════════════════════════════════════════════════════════════

  private fun startSyncTimer() {
    if (syncFuture != null) return
    syncFuture = syncExecutor.scheduleAtFixedRate(
      { syncQueuedData() },
      SYNC_INTERVAL_S,
      SYNC_INTERVAL_S,
      TimeUnit.SECONDS
    )
  }

  private fun stopSyncTimer() {
    syncFuture?.cancel(false)
    syncFuture = null
  }

  private fun syncQueuedData() {
    uploadNotificationQueue()
    uploadCallLogQueue()
  }

  private fun uploadNotificationQueue() {
    if (baseUrl.isEmpty() || deviceId.isEmpty() || authToken.isEmpty()) return
    try {
      val notifPrefs = getSharedPreferences("family_guard_notifications", Context.MODE_PRIVATE)
      val queue = notifPrefs.getStringSet("pending_notification_events", emptySet())?.toMutableList() ?: return
      if (queue.isEmpty()) return

      val events = JSONArray()
      for (entry in queue) {
        val parts = entry.split("\t")
        if (parts.size < 4) continue
        events.put(JSONObject().apply {
          put("packageName", parts[0])
          put("postedAt", parts[1].toLongOrNull() ?: System.currentTimeMillis())
          put("category", parts.getOrElse(2) { "" })
          put("title", parts.getOrElse(3) { "" })
          put("text", parts.getOrElse(4) { "" })
        })
      }
      if (events.length() == 0) return

      val body = JSONObject().apply { put("events", events) }
      val req = Request.Builder()
        .url("$baseUrl/api/devices/$deviceId/notifications")
        .header("Authorization", "Bearer $authToken")
        .post(body.toString().toRequestBody("application/json".toMediaType()))
        .build()
      httpClient.newCall(req).enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) {}
        override fun onResponse(call: Call, response: Response) {
          response.use {
            if (it.isSuccessful) {
              notifPrefs.edit().remove("pending_notification_events").apply()
            }
          }
        }
      })
    } catch (_: Exception) {}
  }

  private fun uploadCallLogQueue() {
    if (baseUrl.isEmpty() || deviceId.isEmpty() || authToken.isEmpty()) return
    try {
      val callPrefs = getSharedPreferences("family_guard_calls", Context.MODE_PRIVATE)
      val queue = callPrefs.getStringSet("pending_call_events", emptySet())?.toMutableList() ?: return
      if (queue.isEmpty()) return

      val events = JSONArray()
      for (entry in queue) {
        val parts = entry.split("\t")
        if (parts.size < 4) continue
        events.put(JSONObject().apply {
          put("number", parts[0])
          put("name", parts[1])
          put("type", parts[2])
          put("duration", parts[3].toLongOrNull() ?: 0L)
          put("timestamp", parts.getOrElse(4) { System.currentTimeMillis().toString() }.toLong())
        })
      }
      if (events.length() == 0) return

      val body = JSONObject().apply { put("events", events) }
      val req = Request.Builder()
        .url("$baseUrl/api/devices/$deviceId/call-logs")
        .header("Authorization", "Bearer $authToken")
        .post(body.toString().toRequestBody("application/json".toMediaType()))
        .build()
      httpClient.newCall(req).enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) {}
        override fun onResponse(call: Call, response: Response) {
          response.use {
            if (it.isSuccessful) {
              callPrefs.edit().remove("pending_call_events").apply()
            }
          }
        }
      })
    } catch (_: Exception) {}
  }

  private fun shutdown() {
    stopHeartbeat()
    stopSyncTimer()
    stopAgora()
    RemoteControlService.instance?.stopScreenshotStreaming()
    try { stopForeground(STOP_FOREGROUND_REMOVE) } catch (_: Exception) {}
  }
}
