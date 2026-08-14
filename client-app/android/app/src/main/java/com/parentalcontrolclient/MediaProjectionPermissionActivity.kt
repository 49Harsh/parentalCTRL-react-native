package com.parentalcontrolclient

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Bundle
import androidx.core.content.ContextCompat

class MediaProjectionPermissionActivity : Activity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    
    // Request screen capture intent
    val manager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as? MediaProjectionManager
    if (manager != null) {
      try {
        startActivityForResult(manager.createScreenCaptureIntent(), SCREEN_CAPTURE_REQUEST)
      } catch (e: Exception) {
        e.printStackTrace()
        finish()
      }
    } else {
      finish()
    }
  }

  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode == SCREEN_CAPTURE_REQUEST) {
      if (resultCode == RESULT_OK && data != null) {
        val serviceIntent = Intent(this, MediaProjectionService::class.java).apply {
          putExtra("resultCode", resultCode)
          putExtra("data", data)
        }
        try {
          ContextCompat.startForegroundService(this, serviceIntent)
          pendingPromise?.resolve(true)
        } catch (e: Exception) {
          e.printStackTrace()
          pendingPromise?.reject("SERVICE_ERROR", e.message ?: "Failed to start MediaProjectionService")
        }
      } else {
        pendingPromise?.reject("CAPTURE_DENIED", "Screen-sharing permission was not granted")
      }
      pendingPromise = null
    }
    finish()
  }

  companion object {
    private const val SCREEN_CAPTURE_REQUEST = 9408
    var pendingPromise: com.facebook.react.bridge.Promise? = null

    fun launch(context: Context, promise: com.facebook.react.bridge.Promise?) {
      pendingPromise = promise
      val intent = Intent(context, MediaProjectionPermissionActivity::class.java).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION)
      }
      context.startActivity(intent)
    }
  }
}
