package com.frimit.screentime

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class FrimitScreenTimeModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val store: FrimitStore
    get() = FrimitStore(context)

  override fun definition() = ModuleDefinition {
    Name("FrimitScreenTime")

    Events("onUsageUpdate", "onPermissionChange")

    Property("isSupported") { true }

    Function("getPermissionState") {
      FrimitPermission.currentState(context)
    }

    AsyncFunction("requestPermissionAsync") {
      // Usage Access는 시스템 설정 화면에서만 켤 수 있고 결과를 돌려주지 않는다.
      // 화면을 열어 준 뒤 현재 상태를 그대로 반환하고, 실제 확인은 앱 복귀 시 다시 한다.
      FrimitPermission.openSettings(context)
      FrimitPermission.currentState(context)
    }

    /**
     * Android에는 iOS의 FamilyActivityPicker에 해당하는 시스템 UI가 없다.
     * 앱 목록을 JS로 넘겨 우리 화면에서 고르게 하고, 고른 결과만 다시 네이티브에 저장한다.
     * 이 목록은 선택 화면에서만 쓰이며 사용량 스냅샷에는 절대 포함되지 않는다.
     */
    AsyncFunction("getSelectableAppsAsync") {
      val packageManager = context.packageManager
      val launcherIntent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)

      packageManager.queryIntentActivities(launcherIntent, 0)
        .asSequence()
        .mapNotNull { it.activityInfo?.applicationInfo }
        .filter { it.packageName != context.packageName }
        .distinctBy { it.packageName }
        .map { info ->
          mapOf(
            "packageName" to info.packageName,
            "label" to packageManager.getApplicationLabel(info).toString()
          )
        }
        .sortedBy { it["label"]?.lowercase() }
        .toList()
    }

    Function("setSelection") { groupId: String, packageNames: List<String> ->
      store.saveSelection(groupId, packageNames.toSet())
      selectionSummary(groupId)
    }

    Function("getSelectionSummary") { groupId: String ->
      selectionSummary(groupId)
    }

    Function("clearSelection") { groupId: String ->
      store.clearSelection(groupId)
    }

    AsyncFunction("startTrackingAsync") { groupId: String,
                                          periodStartMs: Double,
                                          periodEndMs: Double,
                                          timeZoneIdentifier: String ->
      // Android는 구간을 절대 시각으로 직접 계산하므로 시간대 식별자가 필요 없다.
      // iOS는 매일 반복되는 스케줄을 "그룹 시간대의 몇 시 몇 분"으로 등록해야 해서
      // 이 인자를 쓴다. 계약을 하나로 유지하려고 양쪽 다 받는다.
      store.setPeriod(groupId, periodStartMs.toLong(), periodEndMs.toLong())
    }

    AsyncFunction("stopTrackingAsync") { groupId: String ->
      // 선택은 남기고 집계만 멈춘다. 다음 오전 6시에 다시 startTracking으로 재개한다.
      store.setPeriod(groupId, 0L, 0L)
    }

    AsyncFunction("getSnapshotAsync") { groupId: String ->
      snapshot(groupId)
    }

    AsyncFunction("getAllSnapshotsAsync") {
      store.knownGroupIds().mapNotNull { snapshot(it) }
    }
  }

  private fun selectionSummary(groupId: String): Map<String, Any?> {
    val current = store
    return mapOf(
      "groupId" to groupId,
      "selectionCount" to current.loadSelection(groupId).size,
      "updatedAt" to current.selectionUpdatedAt(groupId)?.toDouble()
    )
  }

  private fun snapshot(groupId: String): Map<String, Any?>? {
    val current = store
    val periodStart = current.periodStart(groupId) ?: return null
    val packages = current.loadSelection(groupId)
    if (packages.isEmpty()) return null

    val collectedAt = System.currentTimeMillis()
    // 구간 끝을 넘겨서는 세지 않는다. 앱이 닫힌 채 오전 6시를 지났다면 여기 남아
    // 있는 구간은 아직 어제 것이고, 지금까지 세면 어제 칸에 오늘이 섞인다.
    //
    // 끝이 없는 경우는 이 필드가 생기기 전 빌드가 남긴 값뿐이다. 그때도 "지금까지"로
    // 두면 안 된다 — 고친 빌드를 깔아도 다음 경계에서 같은 오염이 딱 한 번 더
    // 재현된다. 24시간으로 갈음한다. 서머타임이 있는 시간대에서는 한 시간 어긋날 수
    // 있지만, 다음 경계에서 TypeScript가 정확한 끝으로 다시 무장하므로 한 번뿐이다.
    val fallbackEnd = periodStart + 24 * 60 * 60 * 1000L
    val windowEnd = (current.periodEnd(groupId) ?: fallbackEnd).coerceAtMost(collectedAt)
    val seconds = FrimitUsage.foregroundSeconds(context, packages, periodStart, windowEnd)

    return mapOf(
      "groupId" to groupId,
      "periodStartMs" to periodStart.toDouble(),
      "cumulativeSeconds" to seconds.toDouble(),
      "collectedAtMs" to collectedAt.toDouble(),
      "permissionState" to FrimitPermission.currentState(context),
      "source" to "android-usage-stats",
      "sequence" to current.nextSequence(groupId).toDouble()
    )
  }
}
