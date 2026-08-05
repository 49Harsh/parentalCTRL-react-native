package com.parentalcontrolclient

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

class NotificationMonitorService : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification) {
    if (sbn.packageName == packageName || !isCollectionEnabled()) return

    val extras = sbn.notification.extras
    val title = redact(extras.getCharSequence(Notification.EXTRA_TITLE)?.toString())
    val text = redact(extras.getCharSequence(Notification.EXTRA_TEXT)?.toString())
    val event = listOf(
      sbn.packageName,
      sbn.postTime.toString(),
      sbn.notification.category.orEmpty(),
      title,
      text,
    ).joinToString("\t")

    val prefs = getSharedPreferences(PREFS, MODE_PRIVATE)
    val queue = prefs.getStringSet(QUEUE, emptySet()).orEmpty().toMutableList()
    queue.add(event.take(1200))
    prefs.edit().putStringSet(QUEUE, queue.takeLast(50).toSet()).apply()
  }

  private fun isCollectionEnabled(): Boolean = getSharedPreferences(PREFS, MODE_PRIVATE)
    .getBoolean(COLLECTION_ENABLED, true)

  private fun redact(value: String?): String {
    val clean = value.orEmpty().replace(Regex("\\s+"), " ").trim().take(240)
    if (clean.contains(Regex("(?i)\\b(otp|verification code|password|cvv|pin)\\b"))) {
      return "[sensitive notification hidden]"
    }
    return clean.replace(Regex("\\b\\d{4,8}\\b"), "••••")
  }

  companion object {
    const val PREFS = "family_guard_notifications"
    const val QUEUE = "pending_notification_events"
    const val COLLECTION_ENABLED = "notification_collection_enabled"
  }
}
