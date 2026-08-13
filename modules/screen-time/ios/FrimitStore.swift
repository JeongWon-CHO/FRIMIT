import FamilyControls
import Foundation

/// 기기 안에만 머무는 데이터의 보관소.
///
/// 선택한 앱·카테고리 토큰은 여기(App Group UserDefaults)까지만 존재하고
/// JavaScript나 서버로는 절대 나가지 않는다. App Group을 쓰는 이유는
/// DeviceActivity extension이 같은 저장소를 읽고 써야 하기 때문이다.
enum FrimitStore {
  /// config plugin이 호스트 앱과 extension의 Info.plist에 함께 주입하는 키.
  static let appGroupInfoPlistKey = "FrimitAppGroupIdentifier"

  static var appGroupIdentifier: String? {
    Bundle.main.object(forInfoDictionaryKey: appGroupInfoPlistKey) as? String
  }

  /// App Group이 아직 설정되지 않았으면 표준 저장소로 폴백한다.
  /// 이 경우 extension과 데이터를 공유하지 못하므로 스파이크에서 반드시 확인할 것.
  static var defaults: UserDefaults {
    if let identifier = appGroupIdentifier, let suite = UserDefaults(suiteName: identifier) {
      return suite
    }
    return .standard
  }

  static var isAppGroupConfigured: Bool {
    guard let identifier = appGroupIdentifier else { return false }
    return UserDefaults(suiteName: identifier) != nil
  }

  // MARK: - Keys

  private static let knownGroupsKey = "frimit.groups"

  private static func selectionKey(_ groupId: String) -> String {
    "frimit.selection.\(groupId)"
  }

  private static func selectionUpdatedAtKey(_ groupId: String) -> String {
    "frimit.selection.updatedAt.\(groupId)"
  }

  private static func sequenceKey(_ groupId: String) -> String {
    "frimit.sequence.\(groupId)"
  }

  // MARK: - Sequence

  /// 같은 (기기, 그룹, 구간) 안에서 단조 증가하는 순번을 하나 소비한다.
  /// 서버는 이 값으로 중복 업로드를 멱등 처리한다.
  static func nextSequence(groupId: String) -> Int {
    let next = defaults.integer(forKey: sequenceKey(groupId)) + 1
    defaults.set(next, forKey: sequenceKey(groupId))
    return next
  }

  // MARK: - Known groups

  /// 선택이 저장된 그룹 목록. 전체 스냅샷을 한 번에 읽을 때 사용한다.
  static func knownGroupIds() -> [String] {
    defaults.stringArray(forKey: knownGroupsKey) ?? []
  }

  private static func rememberGroup(_ groupId: String) {
    var ids = knownGroupIds()
    guard !ids.contains(groupId) else { return }
    ids.append(groupId)
    defaults.set(ids, forKey: knownGroupsKey)
  }

  private static func forgetGroup(_ groupId: String) {
    let ids = knownGroupIds().filter { $0 != groupId }
    defaults.set(ids, forKey: knownGroupsKey)
  }

  // MARK: - Selection

  static func saveSelection(_ selection: FamilyActivitySelection, groupId: String) throws {
    let data = try JSONEncoder().encode(selection)
    defaults.set(data, forKey: selectionKey(groupId))
    defaults.set(Date().timeIntervalSince1970 * 1000, forKey: selectionUpdatedAtKey(groupId))
    rememberGroup(groupId)
  }

  static func loadSelection(groupId: String) -> FamilyActivitySelection? {
    guard let data = defaults.data(forKey: selectionKey(groupId)) else { return nil }
    return try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
  }

  /// 마지막 선택 변경 시각 (epoch ms). 선택한 적이 없으면 nil.
  static func selectionUpdatedAt(groupId: String) -> Double? {
    let value = defaults.double(forKey: selectionUpdatedAtKey(groupId))
    return value == 0 ? nil : value
  }

  static func clearSelection(groupId: String) {
    defaults.removeObject(forKey: selectionKey(groupId))
    defaults.removeObject(forKey: selectionUpdatedAtKey(groupId))
    defaults.removeObject(forKey: sequenceKey(groupId))
    forgetGroup(groupId)
  }

  /// JavaScript로 나가도 되는 유일한 형태 — 개수와 변경 시각뿐.
  static func selectionSummary(groupId: String) -> [String: Any?] {
    let count = loadSelection(groupId: groupId)?.frimitTotalCount ?? 0
    return [
      "groupId": groupId,
      "selectionCount": count,
      // 한 번도 선택하지 않았으면 JS에서 null로 받는다.
      "updatedAt": selectionUpdatedAt(groupId: groupId),
    ]
  }
}

extension FamilyActivitySelection {
  /// 선택한 앱 + 카테고리 + 웹도메인의 총 개수.
  var frimitTotalCount: Int {
    applicationTokens.count + categoryTokens.count + webDomainTokens.count
  }
}
