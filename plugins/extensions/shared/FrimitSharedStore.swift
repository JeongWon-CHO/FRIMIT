import Foundation

/// 호스트 앱과 DeviceActivity extension이 **App Group을 통해 공유하는** 저장소.
///
/// 이 파일은 config plugin이 각 extension 타깃 폴더로 복사한다. extension은
/// 호스트 앱의 CocoaPods 타깃을 링크할 수 없어서 모듈 코드를 그대로 쓸 수 없기
/// 때문이다. 키 이름이 양쪽에서 정확히 같아야 하므로 여기서 한 곳에 모아 둔다.
///
/// ⚠️ 이 파일을 고치면 modules/screen-time/ios/FrimitUsageBridge.swift 의
/// 키 정의도 함께 고쳐야 한다.
enum FrimitSharedStore {
  static let appGroupInfoPlistKey = "FrimitAppGroupIdentifier"

  static var defaults: UserDefaults {
    if let identifier = Bundle.main.object(forInfoDictionaryKey: appGroupInfoPlistKey) as? String,
       let suite = UserDefaults(suiteName: identifier) {
      return suite
    }
    return .standard
  }

  // MARK: - Keys

  /// Monitor extension이 임계값 콜백으로 알아낸 "적어도 이만큼은 썼다"는 값(초).
  static func thresholdSecondsKey(_ groupId: String) -> String {
    "frimit.usage.threshold.\(groupId)"
  }

  /// Report extension이 계산한 정밀 합계(초).
  static func reportSecondsKey(_ groupId: String) -> String {
    "frimit.usage.report.\(groupId)"
  }

  /// 위 값이 마지막으로 갱신된 시각 (epoch ms).
  static func updatedAtKey(_ groupId: String) -> String {
    "frimit.usage.updatedAt.\(groupId)"
  }

  /// 현재 집계 구간의 시작 (epoch ms). 구간이 바뀌면 누적값을 0으로 되돌린다.
  static func periodStartKey(_ groupId: String) -> String {
    "frimit.usage.periodStart.\(groupId)"
  }

  /// 지금 Report extension이 어느 그룹을 계산 중인지.
  ///
  /// report extension은 호스트가 넘긴 필터만 받고 "어느 그룹인지"는 모른다.
  /// 호스트가 뷰를 띄우기 직전에 여기 적어 두고, extension이 되읽는다.
  /// 한 번에 하나의 report만 렌더링하므로 단일 값으로 충분하다.
  static let pendingReportGroupIdKey = "frimit.usage.pendingReportGroup"

  static func pendingReportGroupId() -> String? {
    defaults.string(forKey: pendingReportGroupIdKey)
  }

  static func setPendingReportGroupId(_ groupId: String?) {
    if let groupId {
      defaults.set(groupId, forKey: pendingReportGroupIdKey)
    } else {
      defaults.removeObject(forKey: pendingReportGroupIdKey)
    }
  }

  /// Report extension이 **실행됐다는 사실 자체**를 남기는 키.
  ///
  /// 계측을 위해 존재한다. 정밀값이 0으로 나올 때 "extension이 아예 안 돌았다"와
  /// "돌았는데 0을 계산했다"를 구분할 방법이 없으면 원인을 좁힐 수 없다.
  static let reportRunAtKey = "frimit.usage.reportRunAt"
  static let reportRawSecondsKey = "frimit.usage.reportRawSeconds"

  /// Report extension이 계산한 정밀 합계를 기록한다.
  ///
  /// 채택되는 값은 뒷걸음질치지 않지만, 실행 흔적과 원시값은 **0이어도 무조건** 남긴다.
  static func recordReportSeconds(groupId: String, seconds: Int) {
    let now = Date().timeIntervalSince1970 * 1000

    // 계측: 실행 사실과 방금 계산한 값을 그대로 남긴다.
    defaults.set(now, forKey: reportRunAtKey)
    defaults.set(seconds, forKey: reportRawSecondsKey)

    let current = defaults.integer(forKey: reportSecondsKey(groupId))
    guard seconds > current else { return }

    defaults.set(seconds, forKey: reportSecondsKey(groupId))
    defaults.set(now, forKey: updatedAtKey(groupId))
  }

  // MARK: - DeviceActivity 이름 규약

  /// DeviceActivityName은 그룹당 하나. `frimit.<groupId>` 형태.
  static func activityName(for groupId: String) -> String {
    "frimit.\(groupId)"
  }

  static func groupId(fromActivityName name: String) -> String? {
    guard name.hasPrefix("frimit.") else { return nil }
    return String(name.dropFirst("frimit.".count))
  }

  /// 이벤트 이름에 임계값(분)을 인코딩한다. `threshold.<minutes>` 형태.
  ///
  /// DeviceActivity는 "몇 분이 지났는지"를 콜백에 알려주지 않고 어떤 이벤트가
  /// 발화했는지만 알려주기 때문에, 이름에 숫자를 심어 두고 되읽는다.
  static func eventName(minutes: Int) -> String {
    "threshold.\(minutes)"
  }

  static func minutes(fromEventName name: String) -> Int? {
    guard name.hasPrefix("threshold.") else { return nil }
    return Int(name.dropFirst("threshold.".count))
  }

  // MARK: - 임계값 기록

  /// 임계값 콜백이 도착했을 때 호출한다.
  ///
  /// 누적값은 절대 줄어들지 않는다 (서버 계약과 동일한 규칙). 늦게 도착한
  /// 콜백이 앞선 값을 덮어써서 사용량이 뒷걸음질치는 일을 막는다.
  static func recordThreshold(groupId: String, minutes: Int) {
    let seconds = minutes * 60
    let current = defaults.integer(forKey: thresholdSecondsKey(groupId))
    guard seconds > current else { return }

    defaults.set(seconds, forKey: thresholdSecondsKey(groupId))
    defaults.set(Date().timeIntervalSince1970 * 1000, forKey: updatedAtKey(groupId))
  }

  /// 새 집계 구간(다음 오전 6시)이 시작될 때 누적값을 되돌린다.
  static func resetInterval(groupId: String, periodStartMs: Double) {
    defaults.set(0, forKey: thresholdSecondsKey(groupId))
    defaults.set(0, forKey: reportSecondsKey(groupId))
    defaults.set(periodStartMs, forKey: periodStartKey(groupId))
    defaults.set(Date().timeIntervalSince1970 * 1000, forKey: updatedAtKey(groupId))
  }
}
