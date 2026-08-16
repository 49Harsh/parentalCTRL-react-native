package com.parentalcontrolclient

import android.app.Activity
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class ParentalControlModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "ParentalControl"

  @ReactMethod
  fun getSetupStatus(promise: Promise) {
    val notificationManager = reactContext.getSystemService(NotificationManager::class.java)
    val powerManager = reactContext.getSystemService(PowerManager::class.java)
    val prefs = reactContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val enabledListeners = NotificationManagerCompat.getEnabledListenerPackages(reactContext)
    val result = com.facebook.react.bridge.Arguments.createMap().apply {
      putBoolean("notificationAccess", enabledListeners.contains(reactContext.packageName))
      putBoolean("batteryOptimized", !powerManager.isIgnoringBatteryOptimizations(reactContext.packageName))
      putBoolean("monitoringServiceEnabled", prefs.getBoolean(MONITORING_ENABLED, false))
      putBoolean("notificationsEnabled", notificationManager.areNotificationsEnabled())
    }
    promise.resolve(result)
  }

  @ReactMethod
  fun isScreenCaptureActive(promise: Promise) {
    promise.resolve(MediaProjectionService.mediaProjection != null)
  }

  @ReactMethod
  fun openNotificationAccessSettings(promise: Promise) = openSettings(
    Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS),
    promise,
  )

  @ReactMethod
  fun openBatteryOptimizationSettings(promise: Promise) = openSettings(
    Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS),
    promise,
  )

  @ReactMethod
  fun startMonitoringService(promise: Promise) {
    try {
      reactContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit().putBoolean(MONITORING_ENABLED, true).apply()
      ContextCompat.startForegroundService(
        reactContext,
        Intent(reactContext, MonitoringService::class.java).setAction(MonitoringService.ACTION_START),
      )
      promise.resolve(true)
    } catch (e: Exception) {
      e.printStackTrace()
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun stopMonitoringService(promise: Promise) {
    reactContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit().putBoolean(MONITORING_ENABLED, false).apply()
    reactContext.startService(
      Intent(reactContext, MonitoringService::class.java).setAction(MonitoringService.ACTION_STOP),
    )
    promise.resolve(true)
  }

  @ReactMethod
  fun requestScreenCapture(promise: Promise) {
    if (MediaProjectionService.mediaProjection != null) {
      promise.resolve(true)
      return
    }
    val activity = reactApplicationContext.currentActivity as? MainActivity
    if (activity != null) {
      activity.requestScreenCapture(promise)
    } else {
      MediaProjectionPermissionActivity.launch(reactContext, promise)
    }
  }

  @ReactMethod
  fun isAccessibilityServiceEnabled(promise: Promise) {
    val enabled = try {
      val enabledServices = Settings.Secure.getString(
        reactContext.contentResolver,
        Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
      ) ?: ""
      enabledServices.contains(reactContext.packageName)
    } catch (e: Exception) {
      false
    }
    promise.resolve(enabled)
  }

  @ReactMethod
  fun openAccessibilitySettings(promise: Promise) = openSettings(
    Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS),
    promise,
  )

  @ReactMethod
  fun performRemoteTouch(x: Float, y: Float, promise: Promise) {
    val service = RemoteControlService.instance
    if (service == null) {
      promise.reject("SERVICE_UNAVAILABLE", "Accessibility service is not enabled")
      return
    }
    val success = service.performTouch(x, y)
    promise.resolve(success)
  }

  @ReactMethod
  fun performRemoteSwipe(
    x1: Float,
    y1: Float,
    x2: Float,
    y2: Float,
    durationMs: Int,
    promise: Promise,
  ) {
    val service = RemoteControlService.instance
    if (service == null) {
      promise.reject("SERVICE_UNAVAILABLE", "Accessibility service is not enabled")
      return
    }
    val success = service.performSwipe(x1, y1, x2, y2, durationMs.toLong())
    promise.resolve(success)
  }

  @ReactMethod
  fun performRemoteLongPress(x: Float, y: Float, durationMs: Int, promise: Promise) {
    val service = RemoteControlService.instance
    if (service == null) {
      promise.reject("SERVICE_UNAVAILABLE", "Accessibility service is not enabled")
      return
    }
    val success = service.performLongPress(x, y, durationMs.toLong())
    promise.resolve(success)
  }

  @ReactMethod
  fun performGlobalAction(action: Int, promise: Promise) {
    val service = RemoteControlService.instance
    if (service == null) {
      promise.reject("SERVICE_UNAVAILABLE", "Accessibility service is not enabled")
      return
    }
    val success = service.executeGlobalAction(action)
    promise.resolve(success)
  }

  @ReactMethod
  fun startScreenFrameStream(fps: Int, baseUrl: String, deviceId: String, token: String, promise: Promise) {
    val service = RemoteControlService.instance
    if (service == null) {
      promise.reject("SERVICE_UNAVAILABLE", "Accessibility service is not enabled")
      return
    }
    val started = service.startScreenshotStreaming(fps, baseUrl, deviceId, token)
    if (!started) {
      promise.reject("UNSUPPORTED", "Accessibility takeScreenshot requires Android 11 (API 30)+")
      return
    }
    service.frameListener = { event, _, _, _, _, _, message ->
      val params = com.facebook.react.bridge.Arguments.createMap().apply {
        putString("event", event)
        putString("message", message)
      }
      reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("ScreenFrameStream", params)
    }
    promise.resolve(true)
  }

  @ReactMethod
  fun stopScreenFrameStream(promise: Promise) {
    val service = RemoteControlService.instance
    service?.frameListener = null
    service?.stopScreenshotStreaming()
    promise.resolve(true)
  }

  @ReactMethod
  fun isScreenFrameStreaming(promise: Promise) {
    promise.resolve(RemoteControlService.instance?.isScreenshotStreaming ?: false)
  }

  override fun invalidate() {
    RemoteControlService.instance?.frameListener = null
    RemoteControlService.instance?.stopScreenshotStreaming()
    super.invalidate()
  }

  private fun openSettings(intent: Intent, promise: Promise) {
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    reactContext.startActivity(intent)
    promise.resolve(true)
  }

  companion object {
    const val PREFS = "family_guard"
    const val MONITORING_ENABLED = "monitoring_service_enabled"
    val NOTIFICATION_COMPONENT = ComponentName(
      "com.parentalcontrolclient",
      "com.parentalcontrolclient.NotificationMonitorService",
    )
  }
}
