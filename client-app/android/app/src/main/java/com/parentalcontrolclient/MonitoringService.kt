package com.parentalcontrolclient

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.facebook.react.HeadlessJsTaskService

class MonitoringService : Service() {
  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      try {
        stopForeground(STOP_FOREGROUND_REMOVE)
      } catch (e: Exception) {
        e.printStackTrace()
      }
      stopSelf()
      return START_NOT_STICKY
    }

    createNotificationChannel()
    val notificationIntent = Intent(this, MainActivity::class.java)
    val pendingIntent = PendingIntent.getActivity(
      this,
      0,
      notificationIntent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

    val notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("FamilyGuard is active")
      .setContentText("Monitoring & Remote Control active")
      .setOngoing(true)
      .setContentIntent(pendingIntent)
      .setPriority(NotificationCompat.PRIORITY_MIN)
      .setVisibility(NotificationCompat.VISIBILITY_SECRET)
      .build()

    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val serviceTypes = android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or
            android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
        startForeground(NOTIFICATION_ID, notification, serviceTypes)
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

    try {
      val headlessIntent = Intent(applicationContext, BackgroundSyncHeadlessService::class.java)
      applicationContext.startService(headlessIntent)
      HeadlessJsTaskService.acquireWakeLockNow(applicationContext)
    } catch (e: Exception) {
      e.printStackTrace()
    }

    return START_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    try {
      val restartServiceIntent = Intent(applicationContext, this.javaClass).apply {
        setPackage(packageName)
        action = ACTION_START
      }
      val restartServicePendingIntent = android.app.PendingIntent.getService(
        applicationContext,
        1,
        restartServiceIntent,
        android.app.PendingIntent.FLAG_ONE_SHOT or android.app.PendingIntent.FLAG_IMMUTABLE
      )
      val alarmService = applicationContext.getSystemService(android.content.Context.ALARM_SERVICE) as? android.app.AlarmManager
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

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "FamilyGuard Monitoring",
        NotificationManager.IMPORTANCE_MIN
      ).apply {
        description = "Shows when FamilyGuard monitoring is active"
        setShowBadge(false)
        setSound(null, null)
      }
      val manager = getSystemService(NotificationManager::class.java)
      manager?.createNotificationChannel(channel)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  companion object {
    const val CHANNEL_ID = "family_monitoring"
    const val NOTIFICATION_ID = 1407
    const val ACTION_START = "com.parentalcontrolclient.action.START_MONITORING"
    const val ACTION_STOP = "com.parentalcontrolclient.action.STOP_MONITORING"
  }
}
