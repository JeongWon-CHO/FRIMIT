import DeviceActivity
import FamilyControls
import Foundation

/// 그룹별 DeviceActivity 감시를 걸고 푼다.
enum FrimitScheduler {
  /// 임계값을 몇 분 간격으로 깔 것인가.
  ///
  /// iOS는 등록해 둔 임계값을 넘을 때만 알려주므로, 촘촘할수록 사용량이 정확해지지만
  /// 이벤트 수가 늘어 시스템 부담이 커진다. 초반은 촘촘하게, 뒤로 갈수록 성기게 깐다.
  ///
  /// 첫 10분을 1분 단위로 까는 이유: 사용자가 앱을 열어 잔여시간을 확인하는 시점은
  /// 대개 사용 초반이고, 이때 "0초"로 보이면 앱이 고장난 것처럼 느껴진다.
  /// 뒤로 갈수록 이미 한도를 넘긴 초과시간 구간이라 분 단위 해상도가 필요 없다.
  ///
  /// 실기기 스파이크에서 이벤트 수와 발화 신뢰도의 관계를 측정한 뒤 조정할 것.
  /// 이벤트가 많아 발화가 누락된다면 앞쪽 1분 간격부터 줄인다.
  static let thresholdMinutes: [Int] = {
    var minutes: [Int] = []
    minutes += stride(from: 1, through: 10, by: 1)       // 0~10분: 1분 (10개)
    minutes += stride(from: 15, through: 120, by: 5)     // 10분~2시간: 5분 (22개)
    minutes += stride(from: 135, through: 360, by: 15)   // 2~6시간: 15분 (16개)
    minutes += stride(from: 390, through: 720, by: 30)   // 6~12시간: 30분 (12개)
    return minutes
  }()

  /// 그룹의 하루 경계에 맞춰 반복 감시를 시작한다.
  ///
  /// `periodStartMs`가 가리키는 시각의 "시:분"을 그룹 시간대 기준으로 읽어
  /// 매일 같은 시각에 반복되는 스케줄을 만든다. plan.md의 오전 6시 경계가
  /// 여기에 대응한다.
  static func start(groupId: String, periodStartMs: Double, timeZoneIdentifier: String) throws {
    guard let selection = FrimitStore.loadSelection(groupId: groupId),
          selection.frimitTotalCount > 0 else {
      throw FrimitError.noSelection
    }

    guard let timeZone = TimeZone(identifier: timeZoneIdentifier) else {
      throw FrimitError.invalidTimeZone(timeZoneIdentifier)
    }

    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = timeZone

    let periodStart = Date(timeIntervalSince1970: periodStartMs / 1000)
    let boundary = calendar.dateComponents([.hour, .minute], from: periodStart)

    var intervalStart = DateComponents(hour: boundary.hour, minute: boundary.minute)
    intervalStart.timeZone = timeZone

    // 하루를 꽉 채우되 시작과 끝이 같은 분이 되지 않도록 1분을 뺀다.
    // (시작 == 끝이면 스케줄이 성립하지 않는다.)
    let endTotalMinutes = ((boundary.hour ?? 6) * 60 + (boundary.minute ?? 0) + 24 * 60 - 1) % (24 * 60)
    var intervalEnd = DateComponents(hour: endTotalMinutes / 60, minute: endTotalMinutes % 60)
    intervalEnd.timeZone = timeZone

    let schedule = DeviceActivitySchedule(
      intervalStart: intervalStart,
      intervalEnd: intervalEnd,
      repeats: true
    )

    var events: [DeviceActivityEvent.Name: DeviceActivityEvent] = [:]
    for minutes in thresholdMinutes {
      let name = DeviceActivityEvent.Name(FrimitUsageBridge.eventName(minutes: minutes))
      events[name] = DeviceActivityEvent(
        applications: selection.applicationTokens,
        categories: selection.categoryTokens,
        webDomains: selection.webDomainTokens,
        threshold: DateComponents(minute: minutes)
      )
    }

    let activity = DeviceActivityName(FrimitUsageBridge.activityName(for: groupId))
    let center = DeviceActivityCenter()

    // 선택이 바뀌었을 수도 있으므로 항상 껐다 다시 건다 (멱등).
    center.stopMonitoring([activity])

    do {
      try center.startMonitoring(activity, during: schedule, events: events)
    } catch {
      throw FrimitError.monitoringFailed(error.localizedDescription)
    }

    FrimitUsageBridge.setPeriodStart(groupId: groupId, periodStartMs: periodStartMs)
  }

  static func stop(groupId: String) {
    let activity = DeviceActivityName(FrimitUsageBridge.activityName(for: groupId))
    DeviceActivityCenter().stopMonitoring([activity])
  }

  /// 현재 감시 중인 그룹 수. 시스템 한계(동시 20개)에 얼마나 가까운지 확인용.
  static func activeCount() -> Int {
    DeviceActivityCenter().activities.count
  }
}
