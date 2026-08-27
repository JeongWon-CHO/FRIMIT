import FamilyControls
import Foundation
import ManagedSettings

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
  ///
  /// iOS의 누적 사용량은 전부 이 값에서 나온다. 정밀 합계를 계산하던 Report
  /// extension(전략 A)은 실기기에서 끝내 실행되지 않아 2026-08-13에 폐기했다.
  static func thresholdSecondsKey(_ groupId: String) -> String {
    "frimit.usage.threshold.\(groupId)"
  }

  /// 위 값이 마지막으로 갱신된 시각 (epoch ms).
  static func updatedAtKey(_ groupId: String) -> String {
    "frimit.usage.updatedAt.\(groupId)"
  }

  /// 현재 집계 구간의 시작 (epoch ms). 구간이 바뀌면 누적값을 0으로 되돌린다.
  static func periodStartKey(_ groupId: String) -> String {
    "frimit.usage.periodStart.\(groupId)"
  }

  /// 차단선. **내 누적**이 이 초를 넘으면 그룹의 선택 앱을 잠근다.
  ///
  /// 값이 없으면 차단하지 않는다. 서버만이 공동 풀의 잔여를 알기 때문에, 호스트
  /// 앱이 동기화할 때마다 `내 누적 + 그룹 잔여`로 다시 적어 준다. 여기(extension)는
  /// 그 값을 읽기만 한다.
  static func shieldAtKey(_ groupId: String) -> String {
    "frimit.shield.at.\(groupId)"
  }

  /// 그룹별 추적 대상. 호스트 앱의 `FrimitStore`가 쓰고 여기서는 차단용으로 읽는다.
  static func selectionKey(_ groupId: String) -> String {
    "frimit.selection.\(groupId)"
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
    defaults.set(periodStartMs, forKey: periodStartKey(groupId))
    defaults.set(Date().timeIntervalSince1970 * 1000, forKey: updatedAtKey(groupId))
  }

  // MARK: - 차단 (ManagedSettings)

  /// 차단선. 아직 서버 값을 받지 못했으면 nil이고, 그때는 차단하지 않는다.
  ///
  /// `integer(forKey:)`를 쓰지 않는 이유: 값이 없을 때도 0을 돌려주는데, 0은
  /// "잔여가 0이라 지금 당장 잠가야 한다"는 뜻이라 구분이 되지 않는다.
  static func shieldAtSeconds(groupId: String) -> Int? {
    defaults.object(forKey: shieldAtKey(groupId)) as? Int
  }

  /// 서버가 알려준 잔여를 차단선으로 옮겨 적고 즉시 판정한다.
  ///
  /// 호스트 앱의 `FrimitShield.setBudget`과 같은 일을 한다. 알림 extension이
  /// 호스트를 거치지 않고 잠글 수 있어야 해서 여기에도 둔다.
  @discardableResult
  static func setShieldBudget(groupId: String, remainingSeconds: Int) -> Bool {
    let used = defaults.integer(forKey: thresholdSecondsKey(groupId))
    defaults.set(max(0, used + remainingSeconds), forKey: shieldAtKey(groupId))
    return evaluateShield(groupId: groupId)
  }

  /// 차단선을 지우고 잠금도 푼다. 새 구간이 시작될 때 부른다.
  static func clearShieldBudget(groupId: String) {
    defaults.removeObject(forKey: shieldAtKey(groupId))
    setShield(groupId: groupId, on: false)
  }

  static func loadSelection(groupId: String) -> FamilyActivitySelection? {
    guard let data = defaults.data(forKey: selectionKey(groupId)) else { return nil }
    return try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
  }

  /// 그룹마다 store를 따로 둔다.
  ///
  /// 하나로 합치면 A 그룹의 한도가 다 차서 잠글 때 B 그룹의 선택까지 덮어쓰게 된다.
  /// 따로 두면 iOS가 알아서 합집합으로 적용한다 — 어느 한 그룹에서라도 잠긴 앱은
  /// 잠긴 상태가 된다. 이름 있는 store는 앱과 extension이 함께 본다.
  static func shieldStore(groupId: String) -> ManagedSettingsStore {
    ManagedSettingsStore(named: ManagedSettingsStore.Name("frimit.\(groupId)"))
  }

  /// 지금 누적값을 차단선과 견주어 잠그거나 푼다. 잠근 상태면 true.
  @discardableResult
  static func evaluateShield(groupId: String) -> Bool {
    guard let limit = shieldAtSeconds(groupId: groupId) else {
      setShield(groupId: groupId, on: false)
      return false
    }

    let used = defaults.integer(forKey: thresholdSecondsKey(groupId))
    let shouldShield = used >= limit
    setShield(groupId: groupId, on: shouldShield)
    return shouldShield
  }

  /// 이 그룹이 고른 대상을 잠그거나 푼다.
  ///
  /// 빈 컬렉션이 아니라 `nil`로 지워야 한다. 빈 값을 넣으면 "아무것도 아닌 것을
  /// 잠근" 설정이 남아 시스템의 차단 목록에 계속 실린다.
  static func setShield(groupId: String, on: Bool) {
    let store = shieldStore(groupId: groupId)

    guard on, let selection = loadSelection(groupId: groupId) else {
      store.shield.applications = nil
      store.shield.applicationCategories = nil
      store.shield.webDomains = nil
      return
    }

    store.shield.applications =
      selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
    store.shield.applicationCategories =
      selection.categoryTokens.isEmpty ? nil : .specific(selection.categoryTokens)
    store.shield.webDomains =
      selection.webDomainTokens.isEmpty ? nil : selection.webDomainTokens
  }
}
