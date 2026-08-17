package com.parentalcontrolclient

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val isRelevant = intent.action == Intent.ACTION_BOOT_COMPLETED ||
      intent.action == Intent.ACTION_MY_PACKAGE_REPLACED
    if (!isRelevant) return
    val enabled = context.getSharedPreferences("family_guard", Context.MODE_PRIVATE)
      .getBoolean("monitoring_service_enabled", false)
    if (enabled) {
      ContextCompat.startForegroundService(context, Intent(context, MonitoringService::class.java))
    }
  }
}
