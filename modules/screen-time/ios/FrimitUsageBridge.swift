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
  /// 전부 Monitor extension이 임계값 콜백으로 쌓은 계단값이다. 정밀 합계를 계산하던
  /// Report extension(전략 A)은 실기기에서 한 번도 실행되지 않아 폐기했다.
  /// 계단 해상도는 `FrimitScheduler.thresholdMinutes`가 결정한다.
  static func cumulativeSeconds(groupId: String) -> Int {
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
    defaults.set(periodStartMs, forKey: periodStartKey(groupId))
  }

  static func clear(groupId: String) {
    defaults.removeObject(forKey: thresholdSecondsKey(groupId))
    defaults.removeObject(forKey: updatedAtKey(groupId))
    defaults.removeObject(forKey: periodStartKey(groupId))
  }
}

private extension Double {
  func takeIfNonZero() -> Double? {
    self == 0 ? nil : self
  }
}
