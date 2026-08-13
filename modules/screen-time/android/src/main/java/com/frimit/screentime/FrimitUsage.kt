package com.frimit.screentime

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Process
import android.provider.Settings

/** Usage Access 권한 확인과 설정 화면 이동. */
object FrimitPermission {
  fun currentState(context: Context): String {
    val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as? AppOpsManager
      ?: return "unavailable"

    val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      appOps.unsafeCheckOpNoThrow(
        AppOpsManager.OPSTR_GET_USAGE_STATS,
        Process.myUid(),
        context.packageName
      )
    } else {
      @Suppress("DEPRECATION")
      appOps.checkOpNoThrow(
        AppOpsManager.OPSTR_GET_USAGE_STATS,
        Process.myUid(),
        context.packageName
      )
    }

    return when (mode) {
      AppOpsManager.MODE_ALLOWED -> "granted"
      // 사용자가 한 번도 설정 화면에 들어가지 않은 상태와, 들어가서 끈 상태는
      // AppOps만으로는 구분되지 않는다. 실제로 통계를 읽어보고 판단한다.
      AppOpsManager.MODE_DEFAULT -> if (canReadUsage(context)) "granted" else "notDetermined"
      else -> "denied"
    }
  }

  /** 권한 없이 queryUsageStats를 부르면 빈 목록이 돌아온다는 점을 이용한 확인. */
  private fun canReadUsage(context: Context): Boolean {
    val manager = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
      ?: return false
    val now = System.currentTimeMillis()
    val stats = manager.queryUsageStats(
      UsageStatsManager.INTERVAL_DAILY,
      now - 24 * 60 * 60 * 1000L,
      now
    )
    return !stats.isNullOrEmpty()
  }

  /**
   * Usage Access 설정 화면을 연다.
   *
   * 이 화면은 결과를 돌려주지 않으므로, 앱으로 돌아온 뒤 JS에서 권한 상태를
   * 다시 읽어야 한다 (AppState 'active' 시점에 재확인).
   */
  fun openSettings(context: Context) {
    val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    context.startActivity(intent)
  }
}

object FrimitUsage {
  /**
   * 선택한 패키지들이 `startMs`부터 `endMs`까지 포그라운드에 있던 시간의 합(초).
   *
   * `queryUsageStats`의 버킷은 임의의 시작 시각에 맞춰 잘리지 않기 때문에
   * (오전 6시 경계를 정확히 맞춰야 하는 우리 요구와 안 맞는다) 이벤트 스트림을
   * 직접 훑어 구간을 계산한다.
   */
  fun foregroundSeconds(
    context: Context,
    packageNames: Set<String>,
    startMs: Long,
    endMs: Long
  ): Long {
    if (packageNames.isEmpty() || endMs <= startMs) return 0L

    val manager = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
      ?: return 0L

    val events = manager.queryEvents(startMs, endMs)
    val openedAt = HashMap<String, Long>()
    var totalMs = 0L
    val event = UsageEvents.Event()

    while (events.hasNextEvent()) {
      events.getNextEvent(event)
      val packageName = event.packageName ?: continue
      if (packageName !in packageNames) continue

      when (event.eventType) {
        UsageEvents.Event.ACTIVITY_RESUMED -> {
          openedAt[packageName] = event.timeStamp
        }

        UsageEvents.Event.ACTIVITY_PAUSED, UsageEvents.Event.ACTIVITY_STOPPED -> {
          // 구간 시작 이전부터 켜져 있던 앱은 startMs부터 센다.
          val opened = openedAt.remove(packageName) ?: startMs
          if (event.timeStamp > opened) {
            totalMs += event.timeStamp - opened
          }
        }
      }
    }

    // 지금도 화면에 떠 있는 앱은 구간 끝까지 누적한다.
    for (opened in openedAt.values) {
      if (endMs > opened) {
        totalMs += endMs - opened
      }
    }

    return totalMs / 1000
  }
}
