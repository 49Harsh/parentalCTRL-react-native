package com.parentalcontrolclient

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import com.facebook.react.bridge.Promise
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {
  private var screenCapturePromise: Promise? = null

  fun requestScreenCapture(promise: Promise) {
    if (screenCapturePromise != null) {
      promise.reject("CAPTURE_PENDING", "A screen-sharing request is already open")
      return
    }
    screenCapturePromise = promise
    val manager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    startActivityForResult(manager.createScreenCaptureIntent(), SCREEN_CAPTURE_REQUEST)
  }

  @Deprecated("Deprecated in Android API; retained for React Native activity result integration")
  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode != SCREEN_CAPTURE_REQUEST) return
    val promise = screenCapturePromise
    screenCapturePromise = null
    if (resultCode == Activity.RESULT_OK && data != null) {
      val serviceIntent = Intent(this, MediaProjectionService::class.java).apply {
        putExtra("resultCode", resultCode)
        putExtra("data", data)
      }
      startForegroundService(serviceIntent)
      promise?.resolve(true)
    } else {
      promise?.reject("CAPTURE_DENIED", "Screen-sharing permission was not granted")
    }
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "ParentalControlClient"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  companion object {
    private const val SCREEN_CAPTURE_REQUEST = 9407
  }
}
