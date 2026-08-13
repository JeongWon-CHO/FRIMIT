import DeviceActivity
import FamilyControls
import SwiftUI
import UIKit

extension DeviceActivityReport.Context {
  /// report extension의 같은 이름 정의와 문자열이 정확히 일치해야 한다.
  static let frimitTotal = Self("frimitTotal")
}

/// `DeviceActivityReport`를 담는 최소 뷰. 사용자에게 보이지 않는다.
struct FrimitReportProbeView: View {
  let filter: DeviceActivityFilter

  var body: some View {
    DeviceActivityReport(.frimitTotal, filter: filter)
  }
}

/// 정밀 합계를 한 번 긁어오는 장치.
///
/// iOS는 report extension이 **화면에 붙어 렌더링될 때만** 계산을 돌린다. 그래서
/// 숫자만 필요한 우리도 뷰를 잠깐 창에 붙였다 떼야 한다. 1×1 크기에 투명하게
/// 붙이므로 사용자 눈에는 아무 일도 일어나지 않는다.
///
/// extension은 별도 프로세스라 계산이 끝나는 시점을 직접 알 수 없다. 잠시 기다렸다
/// App Group에 값이 갱신됐는지 확인하는 방식을 쓴다.
enum FrimitReportProbe {
  /// 렌더링 후 결과를 기다리는 최대 시간.
  /// extension은 별도 프로세스로 새로 뜨기 때문에 첫 실행이 특히 느리다.
  private static let timeout: TimeInterval = 8.0
  private static let pollInterval: TimeInterval = 0.25

  /// 프로브 뷰의 크기.
  ///
  /// 1×1에 `alpha = 0`으로 붙였더니 정밀값이 0으로만 나왔다. iOS가 사실상 보이지 않는
  /// 뷰의 렌더링을 건너뛰면서 extension이 아예 실행되지 않은 것으로 보인다.
  /// 화면에 실제로 자리를 차지하되 눈에는 띄지 않는 크기·투명도를 쓴다.
  private static let probeSize = CGSize(width: 120, height: 120)
  private static let probeAlpha: CGFloat = 0.02

  @MainActor
  static func refresh(groupId: String, periodStartMs: Double) async throws -> Int {
    guard let selection = FrimitStore.loadSelection(groupId: groupId),
          selection.frimitTotalCount > 0 else {
      throw FrimitError.noSelection
    }

    guard let rootViewController = activeWindow()?.rootViewController else {
      throw FrimitError.noPresentingViewController
    }

    let periodStart = Date(timeIntervalSince1970: periodStartMs / 1000)
    let now = Date()
    guard now > periodStart else {
      return FrimitUsageBridge.cumulativeSeconds(groupId: groupId)
    }

    // 시간 단위로 쪼갠다. Frimit의 하루 경계는 항상 정시(오전 6시)이므로
    // 시간 단위 구간이 경계와 정확히 맞아떨어진다. 일 단위로 쪼개면 자정 기준으로
    // 잘려서 오전 6시 이전 사용량이 섞여 들어온다.
    let filter = DeviceActivityFilter(
      segment: .hourly(during: DateInterval(start: periodStart, end: now)),
      users: .all,
      devices: .init([.iPhone]),
      applications: selection.applicationTokens,
      categories: selection.categoryTokens,
      webDomains: selection.webDomainTokens
    )

    // 값이 아니라 **실행 시각**의 변화를 기다린다.
    // 정밀값이 0으로 계산되는 경우에도 extension이 돌았다는 사실은 알 수 있어야 한다.
    let runAtBefore = FrimitUsageBridge.reportLastRunAt()
    FrimitSharedStoreBridge.setPendingReportGroupId(groupId)

    // ⚠️ view만 window에 붙이면 extension이 실행되지 않는다 (2026-08-13 실측).
    //
    // `DeviceActivityReport`는 별도 프로세스의 원격 뷰에 연결되는데, 그 연결은
    // 뷰 컨트롤러 계층이 제대로 구성돼야 시작된다. addChild/didMove 없이 view만
    // 얹으면 SwiftUI 생명주기가 완성되지 않아 makeConfiguration이 아예 안 불린다.
    let host = UIHostingController(rootView: FrimitReportProbeView(filter: filter))
    rootViewController.addChild(host)
    host.view.frame = CGRect(origin: .zero, size: probeSize)
    host.view.alpha = probeAlpha
    host.view.isUserInteractionEnabled = false
    // 다른 UI를 가리지 않도록 맨 뒤에 깐다.
    rootViewController.view.insertSubview(host.view, at: 0)
    host.didMove(toParent: rootViewController)
    host.view.setNeedsLayout()
    host.view.layoutIfNeeded()

    defer {
      host.willMove(toParent: nil)
      host.view.removeFromSuperview()
      host.removeFromParent()
      FrimitSharedStoreBridge.setPendingReportGroupId(nil)
    }

    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      try await Task.sleep(nanoseconds: UInt64(pollInterval * 1_000_000_000))
      if FrimitUsageBridge.reportLastRunAt() != runAtBefore {
        return FrimitUsageBridge.cumulativeSeconds(groupId: groupId)
      }
    }

    // 시간 안에 extension이 돌지 않았다. 임계값 기반 값이라도 돌려준다.
    return FrimitUsageBridge.cumulativeSeconds(groupId: groupId)
  }

  private static func activeWindow() -> UIWindow? {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first { $0.activationState == .foregroundActive }?
      .windows
      .first { $0.isKeyWindow }
  }
}

/// 호스트 쪽에서 extension과 공유하는 "지금 계산 중인 그룹" 값을 다루는 창구.
/// 키 이름은 plugins/extensions/shared/FrimitSharedStore.swift 와 같아야 한다.
enum FrimitSharedStoreBridge {
  private static let pendingReportGroupIdKey = "frimit.usage.pendingReportGroup"

  static func setPendingReportGroupId(_ groupId: String?) {
    if let groupId {
      FrimitStore.defaults.set(groupId, forKey: pendingReportGroupIdKey)
    } else {
      FrimitStore.defaults.removeObject(forKey: pendingReportGroupIdKey)
    }
  }
}
