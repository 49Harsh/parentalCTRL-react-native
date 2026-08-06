package com.parentalcontrolclient

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class BackgroundSyncHeadlessService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val extras = intent?.extras
    return HeadlessJsTaskConfig(
      "BackgroundSyncTask",
      if (extras != null) Arguments.fromBundle(extras) else Arguments.createMap(),
      5000,
      true
    )
  }
}
