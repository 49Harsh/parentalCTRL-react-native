package com.parentalcontrolclient

import android.app.Activity
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ParentalControlModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "ParentalControl"

  @ReactMethod
  fun getSetupStatus(promise: Promise) {
    val notificationManager = reactContext.getSystemService(NotificationManager::class.java)
    val powerManager = reactContext.getSystemService(PowerManager::class.java)
    val prefs = reactContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val enabledListeners = NotificationManagerCompat.getEnabledListenerPackages(reactContext)
    val result = com.facebook.react.bridge.Arguments.createMap().apply {
      putBoolean("notificationAccess", enabledListeners.contains(reactContext.packageName))
      putBoolean("batteryOptimized", !powerManager.isIgnoringBatteryOptimizations(reactContext.packageName))
      putBoolean("monitoringServiceEnabled", prefs.getBoolean(MONITORING_ENABLED, false))
      putBoolean("notificationsEnabled", notificationManager.areNotificationsEnabled())
    }
    promise.resolve(result)
  }

  @ReactMethod
  fun openNotificationAccessSettings(promise: Promise) = openSettings(
    Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS),
    promise,
  )

  @ReactMethod
  fun openBatteryOptimizationSettings(promise: Promise) = openSettings(
    Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS),
    promise,
  )

  @ReactMethod
  fun startMonitoringService(promise: Promise) {
    reactContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit().putBoolean(MONITORING_ENABLED, true).apply()
    ContextCompat.startForegroundService(
      reactContext,
      Intent(reactContext, MonitoringService::class.java).setAction(MonitoringService.ACTION_START),
    )
    promise.resolve(true)
  }

  @ReactMethod
  fun stopMonitoringService(promise: Promise) {
    reactContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit().putBoolean(MONITORING_ENABLED, false).apply()
    reactContext.startService(
      Intent(reactContext, MonitoringService::class.java).setAction(MonitoringService.ACTION_STOP),
    )
    promise.resolve(true)
  }

  @ReactMethod
  fun requestScreenCapture(promise: Promise) {
    val activity = reactApplicationContext.currentActivity as? MainActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "Open the app before starting screen sharing")
      return
    }
    activity.requestScreenCapture(promise)
  }

  private fun openSettings(intent: Intent, promise: Promise) {
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    reactContext.startActivity(intent)
    promise.resolve(true)
  }

  companion object {
    const val PREFS = "family_guard"
    const val MONITORING_ENABLED = "monitoring_service_enabled"
    val NOTIFICATION_COMPONENT = ComponentName(
      "com.parentalcontrolclient",
      "com.parentalcontrolclient.NotificationMonitorService",
    )
  }
}
