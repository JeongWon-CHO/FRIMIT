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
          self?.sendEvent("onPermissionChange", [
            "permissionState": FrimitAuthorization.state(from: status),
          ])
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
      FrimitStore.clearSelection(groupId: groupId)
    }

    AsyncFunction("startTrackingAsync") { (groupId: String, periodStartMs: Double, timeZoneIdentifier: String) in
      try FrimitScheduler.start(
        groupId: groupId,
        periodStartMs: periodStartMs,
        timeZoneIdentifier: timeZoneIdentifier
      )
    }

    AsyncFunction("stopTrackingAsync") { (groupId: String) in
      FrimitScheduler.stop(groupId: groupId)
    }

    AsyncFunction("getSnapshotAsync") { (groupId: String) -> [String: Any?]? in
      self.snapshot(groupId: groupId)
    }

    AsyncFunction("getAllSnapshotsAsync") { () -> [[String: Any?]] in
      FrimitStore.knownGroupIds().compactMap { self.snapshot(groupId: $0) }
    }

    /// 앱이 열려 있는 동안 정밀 합계로 보정한다.
    /// 임계값 기반 계단값보다 정확하지만, report extension이 화면에 붙어야만
    /// 계산되므로 백그라운드에서는 쓸 수 없다.
    AsyncFunction("refreshReportAsync") { (groupId: String) async throws -> [String: Any?]? in
      guard let periodStartMs = FrimitUsageBridge.periodStartMs(groupId: groupId) else {
        return nil
      }
      _ = try await FrimitReportProbe.refresh(groupId: groupId, periodStartMs: periodStartMs)
      return self.snapshot(groupId: groupId)
    }

    /// 스파이크 진단용. 동시 감시 한계(20개)에 얼마나 가까운지 확인한다.
    Function("getDiagnostics") { () -> [String: Any?] in
      [
        "appGroupConfigured": FrimitStore.isAppGroupConfigured,
        "appGroupIdentifier": FrimitStore.appGroupIdentifier,
        "activeMonitorCount": FrimitScheduler.activeCount(),
        "thresholdEventCount": FrimitScheduler.thresholdMinutes.count,
      ]
    }

    /// 두 수집 경로가 각각 얼마를 보고하는지 나눠서 본다.
    /// 스파이크에서 계단값과 정밀값의 차이를 재는 것이 목적이다.
    Function("getUsageBreakdown") { (groupId: String) -> [String: Any?] in
      [
        "thresholdSeconds": FrimitUsageBridge.thresholdSeconds(groupId: groupId),
        "reportSeconds": FrimitUsageBridge.reportSeconds(groupId: groupId),
        "adoptedSeconds": FrimitUsageBridge.cumulativeSeconds(groupId: groupId),
        "lastUpdatedAt": FrimitUsageBridge.lastUpdatedAt(groupId: groupId),
        // 계측: report extension이 돌긴 했는지, 돌았다면 무엇을 계산했는지
        "reportLastRunAt": FrimitUsageBridge.reportLastRunAt(),
        "reportRawSeconds": FrimitUsageBridge.reportLastRawSeconds(),
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
