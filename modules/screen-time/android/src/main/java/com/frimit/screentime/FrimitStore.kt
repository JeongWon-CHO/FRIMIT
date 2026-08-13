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
      .remove(sequenceKey(groupId))
      .apply()
    forgetGroup(groupId)
  }

  /** 집계 구간의 시작 (epoch ms). 오전 6시 경계를 넘으면 새 값으로 덮어쓴다. */
  fun periodStart(groupId: String): Long? =
    prefs.getLong(periodStartKey(groupId), 0L).takeIf { it != 0L }

  fun setPeriodStart(groupId: String, epochMs: Long) {
    val previous = periodStart(groupId)
    val editor = prefs.edit().putLong(periodStartKey(groupId), epochMs)
    // 새 구간이 시작되면 순번도 처음부터 다시 센다.
    if (previous != epochMs) {
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
