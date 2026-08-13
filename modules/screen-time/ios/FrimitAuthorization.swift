import FamilyControls
import Foundation

/// Family Controls 권한 상태를 JS 계약(`PermissionState`)으로 변환한다.
enum FrimitAuthorization {
  static func state(from status: AuthorizationStatus) -> String {
    switch status {
    case .notDetermined:
      return "notDetermined"
    case .denied:
      return "denied"
    case .approved:
      return "granted"
    @unknown default:
      return "unavailable"
    }
  }

  /// ⚠️ 앱이 막 켜진 직후에는 이 값이 아직 실제 상태를 반영하지 않는다.
  ///
  /// 실기기에서 확인된 동작: 이미 승인된 상태인데도 앱 시작 직후 몇 초 동안
  /// `notDetermined`가 나오다가 잠시 뒤 `approved`로 바뀐다. Family Controls가
  /// 시스템과 상태를 동기화하기 전에 읽히기 때문이다.
  ///
  /// 그래서 이 값을 한 번 읽고 끝내면 안 되고, `AuthorizationCenter`의 변화를
  /// 구독해서 갱신해야 한다 (모듈의 `onPermissionChange` 이벤트).
  /// 이걸 놓치면 사용자에게 "권한이 없다"고 잘못 안내하게 된다.
  static func currentState() -> String {
    state(from: AuthorizationCenter.shared.authorizationStatus)
  }

  /// 개인용(.individual) 권한을 요청한다.
  ///
  /// 부모가 자녀 기기를 관리하는 `.child`가 아니라, 본인이 본인 기기의 사용량을
  /// 공유하는 제품이므로 `.individual`이 맞다.
  static func request() async -> String {
    do {
      try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
      return currentState()
    } catch {
      // 사용자가 거부하면 여기로 온다. 기기 정책으로 막힌 경우와 구분되지 않으므로
      // 최종 상태는 authorizationStatus를 다시 읽어 판단한다.
      let state = currentState()
      return state == "notDetermined" ? "denied" : state
    }
  }
}
