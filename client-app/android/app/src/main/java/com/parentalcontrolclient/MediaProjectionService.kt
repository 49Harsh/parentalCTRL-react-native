package com.parentalcontrolclient

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat

class MediaProjectionService : Service() {
  override fun onCreate() {
    super.onCreate()
    val channel = NotificationChannel(CHANNEL_ID, "Screen sharing", NotificationManager.IMPORTANCE_LOW)
    channel.description = "Shown while the device screen is being shared"
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    val notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("Screen sharing is active")
      .setContentText("Open FamilyGuard to stop sharing")
      .setOngoing(true)
      .build()
    try {
      if (android.os.Build.VERSION.SDK_INT >= 34) {
        startForeground(
          NOTIFICATION_ID,
          notification,
          android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
        )
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (e: Exception) {
      try {
        startForeground(NOTIFICATION_ID, notification)
      } catch (ex: Exception) {
        ex.printStackTrace()
      }
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_NOT_STICKY
  override fun onBind(intent: Intent?): IBinder? = null

  companion object {
    const val CHANNEL_ID = "family_screen_sharing"
    const val NOTIFICATION_ID = 1408
  }
}
