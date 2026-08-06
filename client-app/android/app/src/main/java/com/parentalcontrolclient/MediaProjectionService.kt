package com.parentalcontrolclient

import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class MediaProjectionService : Service() {
  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val resultCode = intent?.getIntExtra("resultCode", Activity.RESULT_CANCELED) ?: Activity.RESULT_CANCELED
    val data = intent?.getParcelableExtra<Intent>("data")

    if (resultCode == Activity.RESULT_OK && data != null) {
      try {
        val projectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        mediaProjection = projectionManager.getMediaProjection(resultCode, data)
      } catch (e: Exception) {
        e.printStackTrace()
      }
    }

    createNotificationChannel()
    val notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("Screen sharing is active")
      .setContentText("Parental control monitoring active")
      .setOngoing(true)
      .setPriority(NotificationCompat.PRIORITY_MIN)
      .setVisibility(NotificationCompat.VISIBILITY_SECRET)
      .build()

    try {
      if (Build.VERSION.SDK_INT >= 34) {
        startForeground(
          NOTIFICATION_ID,
          notification,
          android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
        )
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (e: Exception) {
      e.printStackTrace()
    }

    return START_STICKY
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(CHANNEL_ID, "Screen sharing", NotificationManager.IMPORTANCE_MIN).apply {
        description = "Shown while screen sharing is active"
        setShowBadge(false)
        setSound(null, null)
      }
      val manager = getSystemService(NotificationManager::class.java)
      manager?.createNotificationChannel(channel)
    }
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    try {
      val restartServiceIntent = Intent(applicationContext, this.javaClass).apply {
        setPackage(packageName)
      }
      val restartServicePendingIntent = android.app.PendingIntent.getService(
        applicationContext,
        2,
        restartServiceIntent,
        android.app.PendingIntent.FLAG_ONE_SHOT or android.app.PendingIntent.FLAG_IMMUTABLE
      )
      val alarmService = applicationContext.getSystemService(Context.ALARM_SERVICE) as? android.app.AlarmManager
      alarmService?.set(
        android.app.AlarmManager.RTC_WAKEUP,
        System.currentTimeMillis() + 1000,
        restartServicePendingIntent
      )
    } catch (e: Exception) {
      e.printStackTrace()
    }
    super.onTaskRemoved(rootIntent)
  }

  override fun onBind(intent: Intent?): IBinder? = null

  companion object {
    const val CHANNEL_ID = "family_screen_sharing"
    const val NOTIFICATION_ID = 1408
    var mediaProjection: MediaProjection? = null
  }
}
