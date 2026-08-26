import Combine
import ExpoModulesCore
import FamilyControls
import SwiftUI

public class FrimitScreenTimeModule: Module {
  private var cancellables = Set<AnyCancellable>()

  public func definition() -> ModuleDefinition {
    Name("FrimitScreenTime")

    Events("onUsageUpdate", "onPermissionChange")

    // 권한 상태를 구독한다. 앱 시작 직후에는 실제 상태가 아직 안 실려서
    // `notDetermined`로 읽히다가 잠시 뒤 바뀌는데, 한 번만 읽으면 그 변화를 놓친다.
    OnCreate {
      AuthorizationCenter.shared.$authorizationStatus
        .removeDuplicates()
        .receive(on: DispatchQueue.main)
        .sink { [weak self] status in
          let state = FrimitAuthorization.state(from: status)

          // 권한이 사라지면 잠금부터 푼다. 사용자가 스크린타임 승인을 거두는 것은
          // "이 앱에 더는 맡기지 않겠다"는 뜻이고, 그 상태로 잠금만 남으면 풀
          // 방법이 마땅치 않다.
          //
          // `denied`만 본다. 앱이 막 뜬 순간에는 실제 상태가 아직 안 실려서
          // `notDetermined`로 읽히는데(위 주석), 거기서 함께 풀면 켤 때마다
          // 잠금이 저절로 사라진다.
          if state == "denied" {
            for groupId in FrimitStore.knownGroupIds() {
              FrimitShield.clearBudget(groupId: groupId)
            }
          }

          self?.sendEvent("onPermissionChange", ["permissionState": state])
        }
        .store(in: &self.cancellables)
    }

    Property("isSupported") {
      // Family Controls는 iOS 16+ 이고, 앱 최소 버전이 이미 16.4다.
      true
    }

    Function("getPermissionState") {
      FrimitAuthorization.currentState()
    }

    AsyncFunction("requestPermissionAsync") { () async -> String in
      let state = await FrimitAuthorization.request()
      self.sendEvent("onPermissionChange", ["permissionState": state])
      return state
    }

    AsyncFunction("presentSelectionAsync") { (groupId: String, promise: Promise) in
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject(FrimitError.noPresentingViewController)
        return
      }

      // 권한이 없으면 picker가 빈 목록으로 뜬다. 호출 전에 막아 사용자를 헷갈리게 하지 않는다.
      guard FrimitAuthorization.currentState() == "granted" else {
        promise.reject(FrimitError.permissionNotGranted)
        return
      }

      let box = FrimitPresentationBox()
      let initial = FrimitStore.loadSelection(groupId: groupId) ?? FamilyActivitySelection()

      let picker = FrimitSelectionPicker(initialSelection: initial) { result in
        box.viewController?.dismiss(animated: true)
        box.viewController = nil

        if let result {
          do {
            try FrimitStore.saveSelection(result, groupId: groupId)
          } catch {
            promise.reject(FrimitError.selectionNotSaved(error.localizedDescription))
            return
          }
        }
        // 취소한 경우에도 현재 저장된 상태를 그대로 돌려준다.
        promise.resolve(FrimitStore.selectionSummary(groupId: groupId))
      }

      let host = UIHostingController(rootView: picker)
      // 아래로 쓸어내려 닫으면 promise가 영영 resolve되지 않으므로 막는다.
      host.isModalInPresentation = true
      box.viewController = host
      presenter.present(host, animated: true)
    }
    .runOnQueue(.main)

    Function("getSelectionSummary") { (groupId: String) in
      FrimitStore.selectionSummary(groupId: groupId)
    }

    Function("clearSelection") { (groupId: String) in
      FrimitScheduler.stop(groupId: groupId)
      FrimitUsageBridge.clear(groupId: groupId)
      // 선택이 사라지기 전에 푼다. 선택을 지운 뒤에는 무엇을 잠갔는지 알 수 없어
      // 잠금을 풀 방법이 남지 않는다.
      FrimitShield.clearBudget(groupId: groupId)
      FrimitStore.clearSelection(groupId: groupId)
    }

    // periodEndMs는 Android 전용이다. iOS는 `DeviceActivitySchedule`이 매일 반복되며
    // 경계에서 `intervalDidStart`가 불려 구간이 스스로 넘어가므로, 끝을 따로 들고
    // 있을 필요가 없다. 계약을 한 벌로 유지하려고 받기만 하고 버린다.
    AsyncFunction("startTrackingAsync") { (groupId: String, periodStartMs: Double, _: Double, timeZoneIdentifier: String) in
      try FrimitScheduler.start(
        groupId: groupId,
        periodStartMs: periodStartMs,
        timeZoneIdentifier: timeZoneIdentifier
      )
    }

    AsyncFunction("stopTrackingAsync") { (groupId: String) in
      FrimitScheduler.stop(groupId: groupId)
      FrimitShield.clearBudget(groupId: groupId)
    }

    /// 서버가 알려준 그룹 잔여 시간을 차단선으로 심는다. 지금 잠겼으면 true.
    ///
    /// 동기화가 돌아올 때마다 부른다. 이 값이 있어야 Monitor extension이 오프라인
    /// 상태에서도 스스로 잠글 수 있다.
    Function("applyShieldBudget") { (groupId: String, remainingSeconds: Int) -> Bool in
      FrimitShield.setBudget(groupId: groupId, remainingSeconds: remainingSeconds)
    }

    Function("clearShield") { (groupId: String) in
      FrimitShield.clearBudget(groupId: groupId)
    }

    Function("isShielded") { (groupId: String) -> Bool in
      FrimitShield.isShielded(groupId: groupId)
    }

    AsyncFunction("getSnapshotAsync") { (groupId: String) -> [String: Any?]? in
      self.snapshot(groupId: groupId)
    }

    AsyncFunction("getAllSnapshotsAsync") { () -> [[String: Any?]] in
      FrimitStore.knownGroupIds().compactMap { self.snapshot(groupId: $0) }
    }

    /// 스파이크 진단용. 동시 감시 한계(20개)에 얼마나 가까운지 확인한다.
    Function("getDiagnostics") { () -> [String: Any?] in
      [
        "appGroupConfigured": FrimitStore.isAppGroupConfigured,
        "appGroupIdentifier": FrimitStore.appGroupIdentifier,
        "activeMonitorCount": FrimitScheduler.activeCount(),
        "shieldedGroupIds": FrimitStore.knownGroupIds().filter { FrimitShield.isShielded(groupId: $0) },
        "thresholdEventCount": FrimitScheduler.thresholdMinutes.count,
      ]
    }

    /// 임계값 경로가 마지막으로 무엇을 언제 기록했는지 그대로 본다.
    ///
    /// `getSnapshotAsync`의 `collectedAt`은 "지금 읽은 시각"이라 extension이 실제로
    /// 값을 갱신한 시각을 알 수 없다. 계단값이 멈춘 것인지 앱이 안 읽은 것인지를
    /// 구분하려면 이 값이 필요하다.
    Function("getUsageDetail") { (groupId: String) -> [String: Any?] in
      [
        "thresholdSeconds": FrimitUsageBridge.cumulativeSeconds(groupId: groupId),
        "lastUpdatedAt": FrimitUsageBridge.lastUpdatedAt(groupId: groupId),
        // 차단선과 계단값을 나란히 봐야 "아직 안 넘었다"와 "넘었는데 안 잠겼다"를
        // 구분할 수 있다. 후자만 결함이다.
        "shieldAtSeconds": FrimitShield.shieldAtSeconds(groupId: groupId),
        "shielded": FrimitShield.isShielded(groupId: groupId),
      ]
    }
  }

  private func snapshot(groupId: String) -> [String: Any?]? {
    // 추적을 시작하지 않았으면 올릴 것이 없다.
    guard let periodStartMs = FrimitUsageBridge.periodStartMs(groupId: groupId) else {
      return nil
    }
    guard let selection = FrimitStore.loadSelection(groupId: groupId),
          selection.frimitTotalCount > 0 else {
      return nil
    }

    return [
      "groupId": groupId,
      "periodStartMs": periodStartMs,
      "cumulativeSeconds": Double(FrimitUsageBridge.cumulativeSeconds(groupId: groupId)),
      "collectedAtMs": Date().timeIntervalSince1970 * 1000,
      "permissionState": FrimitAuthorization.currentState(),
      "source": "ios-device-activity",
      "sequence": Double(FrimitStore.nextSequence(groupId: groupId)),
    ]
  }
}

enum FrimitError: Error, LocalizedError {
  case noPresentingViewController
  case permissionNotGranted
  case selectionNotSaved(String)
  case noSelection
  case invalidTimeZone(String)
  case monitoringFailed(String)

  var errorDescription: String? {
    switch self {
    case .noPresentingViewController:
      return "선택 화면을 띄울 뷰 컨트롤러를 찾지 못했습니다."
    case .permissionNotGranted:
      return "스크린타임 권한이 없어 앱을 선택할 수 없습니다."
    case let .selectionNotSaved(reason):
      return "선택을 저장하지 못했습니다: \(reason)"
    case .noSelection:
      return "추적할 앱을 먼저 선택해야 집계를 시작할 수 있습니다."
    case let .invalidTimeZone(identifier):
      return "알 수 없는 시간대입니다: \(identifier)"
    case let .monitoringFailed(reason):
      return "사용량 감시를 시작하지 못했습니다: \(reason)"
    }
  }
}
