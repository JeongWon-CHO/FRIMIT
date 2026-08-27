import FamilyControls
import ManagedSettings
import ManagedSettingsUI
import UIKit

/// 잠긴 앱을 열었을 때 뜨는 화면.
///
/// iOS 기본 화면은 "제한됨 / Instagram은(는) 제한되었기 때문에 사용할 수 없습니다"
/// 한 줄이다. 왜 막혔는지도, 누가 막았는지도, 언제 열리는지도 말하지 않는다.
/// Frimit이 막았다는 사실조차 없다.
///
/// **그룹이 여럿일 때 특히 나쁘다.** 한 사람이 최대 5개 그룹에 들어가고, 겹치는
/// 앱을 골랐다면 그중 **한 그룹의 풀만 터져도** 잠긴다(iOS는 store들의 차단을
/// 합집합으로 적용한다). 그 상태에서 기본 화면은 나머지 그룹에 시간이 남아 있는
/// 사람에게 "왜 막혔지"만 남긴다.
///
/// 그래서 여기서 하는 일은 하나다 — **범인을 이름으로 말한다.**
class FrimitShieldConfiguration: ShieldConfigurationDataSource {
  override func configuration(shielding application: Application) -> ShieldConfiguration {
    make(for: application.token.map { Self.group(shielding: $0) } ?? nil)
  }

  override func configuration(
    shielding application: Application,
    in category: ActivityCategory
  ) -> ShieldConfiguration {
    make(for: Self.group(shieldingCategory: category.token))
  }

  override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration {
    make(for: webDomain.token.map { Self.group(shielding: $0) } ?? nil)
  }

  override func configuration(
    shielding webDomain: WebDomain,
    in category: ActivityCategory
  ) -> ShieldConfiguration {
    make(for: Self.group(shieldingCategory: category.token))
  }
}

// MARK: - 범인 찾기

private extension FrimitShieldConfiguration {
  /// 이 앱을 잠근 그룹.
  ///
  /// 잠겨 있는 그룹 중에서 이 대상을 고른 그룹을 찾는다. 여럿이면 첫 번째다 —
  /// 두 그룹이 같은 앱을 동시에 잠갔다면 어느 쪽을 말해도 거짓말은 아니고,
  /// 둘 다 나열하면 화면이 "누구 때문인가"가 아니라 목록이 된다.
  static func group(shielding token: ApplicationToken) -> String? {
    owner { $0.applicationTokens.contains(token) }
  }

  static func group(shielding token: WebDomainToken) -> String? {
    owner { $0.webDomainTokens.contains(token) }
  }

  static func group(shieldingCategory token: ActivityCategoryToken?) -> String? {
    guard let token else { return nil }
    return owner { $0.categoryTokens.contains(token) }
  }

  static func owner(matching contains: (FamilyActivitySelection) -> Bool) -> String? {
    FrimitSharedStore.knownGroupIds().first { groupId in
      guard FrimitSharedStore.isShielded(groupId: groupId),
            let selection = FrimitSharedStore.loadSelection(groupId: groupId)
      else { return false }
      return contains(selection)
    }
  }
}

// MARK: - 화면

private extension FrimitShieldConfiguration {
  /// 앱의 어두운 바탕과 보라. 디자인 토큰(`constants/design-tokens`)과 같은 값이다.
  static let background = UIColor(red: 0x07 / 255, green: 0x07 / 255, blue: 0x0A / 255, alpha: 1)
  static let violet = UIColor(red: 0x7C / 255, green: 0x4D / 255, blue: 0xFF / 255, alpha: 1)

  func make(for groupId: String?) -> ShieldConfiguration {
    ShieldConfiguration(
      backgroundBlurStyle: .systemThickMaterialDark,
      backgroundColor: Self.background,
      icon: nil,
      title: Self.label(title(for: groupId), color: .white),
      subtitle: Self.label(subtitle(for: groupId), color: UIColor.white.withAlphaComponent(0.7)),
      primaryButtonLabel: Self.label("확인", color: .white),
      primaryButtonBackgroundColor: Self.violet
    )
  }

  /// 그룹 이름이 제목이다. 이 화면에서 가장 먼저 읽혀야 하는 것이 그것이다.
  ///
  /// 이름을 모르는 경우가 있다 — 그룹 목록을 한 번도 읽지 않은 채 잠겼을 때다.
  /// 그때도 최소한 누가 막았는지는 말한다.
  func title(for groupId: String?) -> String {
    groupId.flatMap { FrimitSharedStore.groupName(groupId: $0) } ?? "Frimit"
  }

  func subtitle(for groupId: String?) -> String {
    let reason = "오늘 우리 몫을 다 썼어요"

    guard let groupId, let endsAt = FrimitSharedStore.shieldEndsAt(groupId: groupId) else {
      return reason
    }

    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "ko_KR")
    formatter.dateFormat = "a h시"

    return "\(reason)\n\(formatter.string(from: endsAt))에 다시 열려요"
  }

  static func label(_ text: String, color: UIColor) -> ShieldConfiguration.Label {
    ShieldConfiguration.Label(text: text, color: color)
  }
}
