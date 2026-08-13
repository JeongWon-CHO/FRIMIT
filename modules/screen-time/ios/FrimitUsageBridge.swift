import Foundation

/// 호스트 앱 쪽에서 extension이 써 놓은 사용량을 읽는 창구.
///
/// ⚠️ 키 정의는 plugins/extensions/shared/FrimitSharedStore.swift 와 **정확히 같아야** 한다.
/// extension은 CocoaPods로 링크된 이 모듈을 쓸 수 없어서 코드를 공유하지 못하고,
/// 대신 App Group UserDefaults의 키 이름을 규약으로 삼는다.
enum FrimitUsageBridge {
  private static var defaults: UserDefaults { FrimitStore.defaults }

  private static func thresholdSecondsKey(_ groupId: String) -> String {
    "frimit.usage.threshold.\(groupId)"
  }

  private static func reportSecondsKey(_ groupId: String) -> String {
    "frimit.usage.report.\(groupId)"
  }

  private static func updatedAtKey(_ groupId: String) -> String {
    "frimit.usage.updatedAt.\(groupId)"
  }

  private static func periodStartKey(_ groupId: String) -> String {
    "frimit.usage.periodStart.\(groupId)"
  }

  static func activityName(for groupId: String) -> String {
    "frimit.\(groupId)"
  }

  static func eventName(minutes: Int) -> String {
    "threshold.\(minutes)"
  }

  /// 지금까지 확인된 누적 사용 초.
  ///
  /// Monitor가 준 계단값과 Report가 준 정밀값 중 **큰 쪽**을 채택한다.
  /// 둘은 서로를 대체하는 게 아니라 보완한다 — Monitor는 백그라운드에서만 갱신되고
  /// Report는 앱이 열려 있을 때만 갱신되므로, 어느 쪽이 최신인지는 상황에 따라 다르다.
  /// 누적값이 줄어들지 않아야 한다는 규칙은 양쪽 모두에 적용된다.
  static func cumulativeSeconds(groupId: String) -> Int {
    let threshold = defaults.integer(forKey: thresholdSecondsKey(groupId))
    let report = defaults.integer(forKey: reportSecondsKey(groupId))
    return max(threshold, report)
  }

  /// Report extension이 마지막으로 적어 둔 정밀 합계. 갱신 여부 확인에 쓴다.
  static func reportSeconds(groupId: String) -> Int {
    defaults.integer(forKey: reportSecondsKey(groupId))
  }

  // MARK: - 계측
  //
  // 정밀값이 0으로 나올 때 원인을 좁히기 위한 값들.
  // extension이 돌기만 하면 결과가 0이어도 흔적이 남는다.

  private static let reportRunAtKey = "frimit.usage.reportRunAt"
  private static let reportRawSecondsKey = "frimit.usage.reportRawSeconds"

  /// Report extension이 마지막으로 실행된 시각 (epoch ms). 한 번도 안 돌았으면 nil.
  static func reportLastRunAt() -> Double? {
    defaults.double(forKey: reportRunAtKey).takeIfNonZero()
  }

  /// 그때 계산해 낸 값 (0이어도 그대로).
  static func reportLastRawSeconds() -> Int {
    defaults.integer(forKey: reportRawSecondsKey)
  }

  /// 임계값 기반 값만 따로. 스파이크에서 두 경로를 비교할 때 쓴다.
  static func thresholdSeconds(groupId: String) -> Int {
    defaults.integer(forKey: thresholdSecondsKey(groupId))
  }

  static func lastUpdatedAt(groupId: String) -> Double? {
    defaults.double(forKey: updatedAtKey(groupId)).takeIfNonZero()
  }

  static func periodStartMs(groupId: String) -> Double? {
    defaults.double(forKey: periodStartKey(groupId)).takeIfNonZero()
  }

  static func setPeriodStart(groupId: String, periodStartMs: Double) {
    let previous = self.periodStartMs(groupId: groupId)
    guard previous != periodStartMs else { return }

    // 구간이 바뀌면 누적값을 처음부터 다시 센다.
    defaults.set(0, forKey: thresholdSecondsKey(groupId))
    defaults.set(0, forKey: reportSecondsKey(groupId))
    defaults.set(periodStartMs, forKey: periodStartKey(groupId))
  }

  static func clear(groupId: String) {
    defaults.removeObject(forKey: thresholdSecondsKey(groupId))
    defaults.removeObject(forKey: reportSecondsKey(groupId))
    defaults.removeObject(forKey: updatedAtKey(groupId))
    defaults.removeObject(forKey: periodStartKey(groupId))
  }
}

private extension Double {
  func takeIfNonZero() -> Double? {
    self == 0 ? nil : self
  }
}
