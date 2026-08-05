package com.parentalcontrolclient

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
    val enabled = context.getSharedPreferences("family_guard", Context.MODE_PRIVATE)
      .getBoolean("monitoring_service_enabled", false)
    if (enabled) {
      ContextCompat.startForegroundService(context, Intent(context, MonitoringService::class.java))
    }
  }
}
