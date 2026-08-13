import DeviceActivity
import Foundation

/// 백그라운드에서 사용량 임계값을 감시하는 extension.
///
/// iOS는 "지금 몇 초 썼는지"를 알려주지 않고, 미리 등록해 둔 임계값을 넘을 때마다
/// 콜백만 준다. 그래서 5분·15분·30분 간격의 임계값을 촘촘히 깔아 두고, 발화한
/// 이벤트 이름에서 분을 되읽어 "적어도 이만큼은 썼다"를 계단식으로 쌓는다.
///
/// 이 프로세스는 짧게만 살아 있으므로 여기서는 App Group에 값을 쓰는 일만 하고,
/// 서버 업로드는 호스트 앱이 깨어날 때 처리한다.
class FrimitActivityMonitor: DeviceActivityMonitor {
  override func intervalDidStart(for activity: DeviceActivityName) {
    super.intervalDidStart(for: activity)

    guard let groupId = FrimitSharedStore.groupId(fromActivityName: activity.rawValue) else {
      return
    }

    // 새 Frimit 일자가 시작됐다. 누적값을 0으로 되돌린다.
    FrimitSharedStore.resetInterval(
      groupId: groupId,
      periodStartMs: Date().timeIntervalSince1970 * 1000
    )
  }

  override func eventDidReachThreshold(
    _ event: DeviceActivityEvent.Name,
    activity: DeviceActivityName
  ) {
    super.eventDidReachThreshold(event, activity: activity)

    guard
      let groupId = FrimitSharedStore.groupId(fromActivityName: activity.rawValue),
      let minutes = FrimitSharedStore.minutes(fromEventName: event.rawValue)
    else {
      return
    }

    FrimitSharedStore.recordThreshold(groupId: groupId, minutes: minutes)
  }

  override func intervalDidEnd(for activity: DeviceActivityName) {
    super.intervalDidEnd(for: activity)
    // 구간이 끝나도 값은 남겨 둔다. 호스트 앱이 다음에 깨어날 때 마지막 합계를
    // 읽어 서버로 올려야 하기 때문이다. 초기화는 다음 intervalDidStart에서 한다.
  }
}
