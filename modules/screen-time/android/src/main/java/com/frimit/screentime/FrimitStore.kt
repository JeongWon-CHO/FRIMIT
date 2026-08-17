package com.frimit.screentime

import android.content.Context
import android.content.SharedPreferences

/**
 * 기기 안에만 머무는 데이터의 보관소.
 *
 * 선택한 패키지명은 여기까지만 존재하고, 서버로 올라가는 스냅샷에는 합계 초만 담긴다.
 */
class FrimitStore(context: Context) {
  private val prefs: SharedPreferences =
    context.getSharedPreferences("frimit.screen-time", Context.MODE_PRIVATE)

  private fun selectionKey(groupId: String) = "frimit.selection.$groupId"
  private fun updatedAtKey(groupId: String) = "frimit.selection.updatedAt.$groupId"
  private fun periodStartKey(groupId: String) = "frimit.periodStart.$groupId"
  private fun periodEndKey(groupId: String) = "frimit.periodEnd.$groupId"
  private fun sequenceKey(groupId: String) = "frimit.sequence.$groupId"

  fun knownGroupIds(): Set<String> = prefs.getStringSet(KNOWN_GROUPS_KEY, emptySet()) ?: emptySet()

  private fun rememberGroup(groupId: String) {
    prefs.edit().putStringSet(KNOWN_GROUPS_KEY, knownGroupIds() + groupId).apply()
  }

  private fun forgetGroup(groupId: String) {
    prefs.edit().putStringSet(KNOWN_GROUPS_KEY, knownGroupIds() - groupId).apply()
  }

  fun saveSelection(groupId: String, packageNames: Set<String>) {
    prefs.edit()
      .putStringSet(selectionKey(groupId), packageNames)
      .putLong(updatedAtKey(groupId), System.currentTimeMillis())
      .apply()
    rememberGroup(groupId)
  }

  fun loadSelection(groupId: String): Set<String> =
    prefs.getStringSet(selectionKey(groupId), emptySet()) ?: emptySet()

  fun selectionUpdatedAt(groupId: String): Long? =
    prefs.getLong(updatedAtKey(groupId), 0L).takeIf { it != 0L }

  fun clearSelection(groupId: String) {
    prefs.edit()
      .remove(selectionKey(groupId))
      .remove(updatedAtKey(groupId))
      .remove(periodStartKey(groupId))
      .remove(periodEndKey(groupId))
      .remove(sequenceKey(groupId))
      .apply()
    forgetGroup(groupId)
  }

  /** 집계 구간의 시작 (epoch ms). 오전 6시 경계를 넘으면 새 값으로 덮어쓴다. */
  fun periodStart(groupId: String): Long? =
    prefs.getLong(periodStartKey(groupId), 0L).takeIf { it != 0L }

  /**
   * 집계 구간의 끝 (epoch ms) = 다음 오전 6시.
   *
   * 끝을 알아야 하는 이유는 하나다. 앱이 닫힌 채로 경계를 넘기면 다음에 열릴 때
   * 기기에 남아 있는 구간은 아직 어제 것인데, 여기서 끝을 모르면 사용량을 "지금"
   * 까지 세어 **어제 칸에 오늘 사용량이 섞인다**. 실기기 2차 측정(2026-08-17)에서
   * 08-16 칸에 08-17 오전 4시간이 들어간 원인이다.
   *
   * 끝 계산은 TypeScript(`frimit-day.ts`)에만 두고 여기서는 받은 값을 보관만 한다.
   * 서머타임이 있는 시간대에서 하루는 24시간이 아니고, 그 규칙을 네이티브 두 곳에
   * 다시 구현할 이유가 없다.
   */
  fun periodEnd(groupId: String): Long? =
    prefs.getLong(periodEndKey(groupId), 0L).takeIf { it != 0L }

  fun setPeriod(groupId: String, startMs: Long, endMs: Long) {
    val previous = periodStart(groupId)
    val editor = prefs.edit()
      .putLong(periodStartKey(groupId), startMs)
      .putLong(periodEndKey(groupId), endMs)
    // 새 구간이 시작되면 순번도 처음부터 다시 센다.
    if (previous != startMs) {
      editor.putLong(sequenceKey(groupId), 0L)
    }
    editor.apply()
    rememberGroup(groupId)
  }

  /**
   * 같은 (기기, 그룹, 구간) 안에서 단조 증가하는 순번을 하나 소비한다.
   * 서버는 이 값으로 중복 업로드를 멱등 처리한다.
   */
  fun nextSequence(groupId: String): Long {
    val next = prefs.getLong(sequenceKey(groupId), 0L) + 1
    prefs.edit().putLong(sequenceKey(groupId), next).apply()
    return next
  }

  companion object {
    private const val KNOWN_GROUPS_KEY = "frimit.groups"
  }
}
