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
   *
   *
   * ## 열림/닫힘 짝짓기에서 조심할 것 셋
   *
   * 1. **닫힘 이벤트는 앱 하나를 닫을 때 두 번 온다.** `ACTIVITY_PAUSED` 다음에
   *    `ACTIVITY_STOPPED`가 뒤따른다. 짝이 없는 닫힘을 무조건 "구간 시작부터
   *    켜져 있었다"로 해석하면, 두 번째 이벤트가 매번 구간 전체를 한 번 더 더한다.
   *    실기기 1차 측정(2026-08-14)에서 1분을 쓰고 22시간 38분이 찍힌 원인이다.
   *    그래서 `startMs` 되돌림은 **이 구간에서 그 앱의 이벤트를 처음 볼 때만**
   *    적용한다. 그 뒤의 짝 없는 닫힘은 중복이므로 버린다.
   *
   * 2. **열림 이벤트가 짝 없이 반복될 수 있다.** 이미 열려 있는 것으로 아는 앱에
   *    다시 열림이 오면 시작 시각을 덮어쓰지 않는다. 덮어쓰면 그 사이 시간이 사라진다.
   *
   * 3. **포그라운드는 하나뿐이다.** 다른 앱이 올라오거나 화면이 꺼지면, 열려 있던
   *    것은 그 시점에 끝난 것이다. 닫힘 이벤트가 유실돼도 여기서 끊기므로 하나의
   *    구간이 endMs까지 무한정 자라지 않는다. 이 방어가 없으면 이벤트 하나를
   *    놓칠 때마다 몇 시간짜리 유령 사용량이 생긴다.
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
    // 이 구간에서 이벤트를 한 번이라도 본 패키지. "구간 시작 이전부터 켜져 있었다"는
    // 되돌림을 첫 이벤트에만 허용하기 위해 필요하다.
    val seen = HashSet<String>()
    var totalMs = 0L
    val event = UsageEvents.Event()

    /** `keep`을 뺀 나머지 열린 구간을 `at`에서 닫는다. */
    fun closeOthers(keep: String?, at: Long) {
      val entries = openedAt.entries.iterator()
      while (entries.hasNext()) {
        val entry = entries.next()
        if (entry.key == keep) continue
        if (at > entry.value) totalMs += at - entry.value
        entries.remove()
      }
    }

    while (events.hasNextEvent()) {
      events.getNextEvent(event)

      // 화면이 꺼지거나 잠금 화면이 올라오면 무엇을 보고 있었든 거기서 끝난다.
      // 기기에 따라 이때 ACTIVITY_PAUSED를 주지 않는 경우가 있어, 그러면 밤새
      // 앱을 켜 둔 것으로 집계된다.
      if (event.eventType == UsageEvents.Event.SCREEN_NON_INTERACTIVE ||
          event.eventType == UsageEvents.Event.KEYGUARD_SHOWN) {
        closeOthers(null, event.timeStamp)
        continue
      }

      val packageName = event.packageName ?: continue

      when (event.eventType) {
        UsageEvents.Event.ACTIVITY_RESUMED -> {
          // 추적 대상이 아닌 앱이 올라온 것도 신호다 — 보고 있던 앱은 그때 끝났다.
          closeOthers(packageName, event.timeStamp)

          if (packageName in packageNames && packageName !in openedAt) {
            openedAt[packageName] = event.timeStamp
            seen += packageName
          }
        }

        UsageEvents.Event.ACTIVITY_PAUSED, UsageEvents.Event.ACTIVITY_STOPPED -> {
          if (packageName !in packageNames) continue

          val from = when {
            // 정상적인 짝.
            openedAt.containsKey(packageName) -> openedAt.remove(packageName)!!
            // 이 구간에서 처음 보는 앱이 닫혔다 = 구간 시작 이전부터 켜져 있었다.
            packageName !in seen -> startMs
            // 이미 닫힌 뒤에 오는 중복 닫힘(PAUSED 다음의 STOPPED). 버린다.
            else -> {
              continue
            }
          }

          seen += packageName
          if (event.timeStamp > from) totalMs += event.timeStamp - from
        }
      }
    }

    // 지금도 화면에 떠 있는 앱은 구간 끝까지 누적한다.
    closeOthers(null, endMs)

    return totalMs / 1000
  }
}
