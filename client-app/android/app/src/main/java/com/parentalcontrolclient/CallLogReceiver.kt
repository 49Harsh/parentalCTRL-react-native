package com.parentalcontrolclient

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.provider.CallLog
import android.telephony.TelephonyManager

class CallLogReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return
    val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE) ?: return
    if (state == TelephonyManager.EXTRA_STATE_IDLE) {
      saveLastCall(context)
    }
  }

  private fun saveLastCall(context: Context) {
    try {
      val cursor: Cursor? = context.contentResolver.query(
        CallLog.Calls.CONTENT_URI,
        arrayOf(
          CallLog.Calls.NUMBER,
          CallLog.Calls.CACHED_NAME,
          CallLog.Calls.TYPE,
          CallLog.Calls.DURATION,
          CallLog.Calls.DATE
        ),
        null, null, "${CallLog.Calls.DATE} DESC"
      )
      cursor?.use {
        if (it.moveToFirst()) {
          val number = it.getString(it.getColumnIndexOrThrow(CallLog.Calls.NUMBER)) ?: ""
          val name = it.getString(it.getColumnIndexOrThrow(CallLog.Calls.CACHED_NAME)) ?: ""
          val type = when (it.getInt(it.getColumnIndexOrThrow(CallLog.Calls.TYPE))) {
            CallLog.Calls.INCOMING_TYPE -> "incoming"
            CallLog.Calls.OUTGOING_TYPE -> "outgoing"
            CallLog.Calls.MISSED_TYPE -> "missed"
            else -> "unknown"
          }
          val duration = it.getLong(it.getColumnIndexOrThrow(CallLog.Calls.DURATION))
          val date = it.getLong(it.getColumnIndexOrThrow(CallLog.Calls.DATE))

          val entry = listOf(number, name, type, duration.toString(), date.toString()).joinToString("\t")
          val prefs = context.getSharedPreferences("family_guard_calls", Context.MODE_PRIVATE)
          val queue = prefs.getStringSet("pending_call_events", emptySet()).orEmpty().toMutableList()
          queue.add(entry.take(500))
          prefs.edit().putStringSet("pending_call_events", queue.takeLast(50).toSet()).apply()
        }
      }
    } catch (_: Exception) {}
  }
}
