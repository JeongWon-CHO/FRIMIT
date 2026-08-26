import FamilyControls
import Foundation
import ManagedSettings

/// 한도를 다 쓴 그룹의 선택 앱을 잠근다.
///
/// **차단선을 정하는 곳은 서버다.** 공동 풀의 잔여는 나 혼자 알 수 없으므로,
/// 동기화가 돌아올 때마다 `내 누적 + 그룹 잔여`를 App Group에 적어 둔다. 그 뒤로는
/// 네트워크 없이도 Monitor extension이 임계값 콜백마다 그 선을 넘었는지 보고
/// 스스로 잠근다.
///
/// ⚠️ 키 이름과 잠금 규칙은 plugins/extensions/shared/FrimitSharedStore.swift 와
/// **정확히 같아야** 한다. extension은 이 모듈을 링크할 수 없어서 코드를 공유하지
/// 못하고, 대신 App Group UserDefaults의 키 이름을 규약으로 삼는다.
enum FrimitShield {
  private static var defaults: UserDefaults { FrimitStore.defaults }

  private static func shieldAtKey(_ groupId: String) -> String {
    "frimit.shield.at.\(groupId)"
  }

  private static func store(groupId: String) -> ManagedSettingsStore {
    ManagedSettingsStore(named: ManagedSettingsStore.Name("frimit.\(groupId)"))
  }

  /// 서버가 알려준 그룹 잔여 시간을 차단선으로 옮겨 적고 즉시 판정한다.
  ///
  /// 기준이 되는 "내 누적"은 기기의 계단값이다. 서버의 확정값이 아니라 이 값을
  /// 쓰는 이유는, 잠글지 말지를 판정하는 extension 역시 이 값밖에 볼 수 없기
  /// 때문이다. 두 곳이 다른 잣대를 쓰면 앱 안의 표시와 실제 잠금이 어긋난다.
  @discardableResult
  static func setBudget(groupId: String, remainingSeconds: Int) -> Bool {
    let used = FrimitUsageBridge.cumulativeSeconds(groupId: groupId)
    defaults.set(max(0, used + remainingSeconds), forKey: shieldAtKey(groupId))
    return evaluate(groupId: groupId)
  }

  /// 차단선을 지우고 잠금도 푼다. 그룹을 떠나거나 추적을 멈출 때.
  static func clearBudget(groupId: String) {
    defaults.removeObject(forKey: shieldAtKey(groupId))
    setShield(groupId: groupId, on: false)
  }

  static func shieldAtSeconds(groupId: String) -> Int? {
    defaults.object(forKey: shieldAtKey(groupId)) as? Int
  }

  /// 지금 누적값을 차단선과 견주어 잠그거나 푼다. 잠근 상태면 true.
  @discardableResult
  static func evaluate(groupId: String) -> Bool {
    guard let limit = shieldAtSeconds(groupId: groupId) else {
      setShield(groupId: groupId, on: false)
      return false
    }

    let shouldShield = FrimitUsageBridge.cumulativeSeconds(groupId: groupId) >= limit
    setShield(groupId: groupId, on: shouldShield)
    return shouldShield
  }

  /// 앱이 실제로 잠겨 있는가. 설정 화면이 상태를 그릴 때 쓴다.
  static func isShielded(groupId: String) -> Bool {
    store(groupId: groupId).shield.applications?.isEmpty == false
      || store(groupId: groupId).shield.applicationCategories != nil
      || store(groupId: groupId).shield.webDomains?.isEmpty == false
  }

  /// 이 그룹이 고른 대상을 잠그거나 푼다.
  ///
  /// 빈 컬렉션이 아니라 `nil`로 지워야 한다. 빈 값을 넣으면 "아무것도 아닌 것을
  /// 잠근" 설정이 남아 시스템의 차단 목록에 계속 실린다.
  static func setShield(groupId: String, on: Bool) {
    let store = store(groupId: groupId)

    guard on, let selection = FrimitStore.loadSelection(groupId: groupId) else {
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
