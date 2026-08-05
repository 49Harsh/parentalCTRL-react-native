package com.parentalcontrolclient

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat

class MonitoringService : Service() {
  override fun onCreate() {
    super.onCreate()
    val channel = NotificationChannel(CHANNEL_ID, "Family monitoring", NotificationManager.IMPORTANCE_LOW)
    channel.description = "Shows when consented family monitoring is active"
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    val intent = Intent(this, MainActivity::class.java)
    val pending = PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("FamilyGuard is active")
      .setContentText("Tap to review or stop monitoring permissions")
      .setOngoing(true)
      .setContentIntent(pending)
      .build()
    startForeground(NOTIFICATION_ID, notification)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      getSharedPreferences(ParentalControlModule.PREFS, MODE_PRIVATE)
        .edit().putBoolean(ParentalControlModule.MONITORING_ENABLED, false).apply()
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }
    getSharedPreferences(ParentalControlModule.PREFS, MODE_PRIVATE)
      .edit().putBoolean(ParentalControlModule.MONITORING_ENABLED, true).apply()
    return START_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  companion object {
    const val CHANNEL_ID = "family_monitoring"
    const val NOTIFICATION_ID = 1407
    const val ACTION_START = "com.parentalcontrolclient.action.START_MONITORING"
    const val ACTION_STOP = "com.parentalcontrolclient.action.STOP_MONITORING"
  }
}
