import DeviceActivity
import SwiftUI

extension DeviceActivityReport.Context {
  /// 호스트 앱의 같은 이름 정의와 문자열이 정확히 일치해야 한다.
  static let frimitTotal = Self("frimitTotal")
}

struct TotalActivityReport: DeviceActivityReportScene {
  let context: DeviceActivityReport.Context = .frimitTotal
  let content: (Int) -> TotalActivityView

  /// 호스트가 넘긴 필터에 걸린 사용 시간을 모두 더한다.
  ///
  /// 필터에는 그룹이 고른 앱·카테고리 토큰과 집계 구간이 담겨 있다. 여기서 나온 값이
  /// 우리가 iOS에서 얻을 수 있는 가장 정확한 숫자다.
  func makeConfiguration(representing data: DeviceActivityResults<DeviceActivityData>) async -> Int {
    var totalDuration: TimeInterval = 0

    for await result in data {
      for await segment in result.activitySegments {
        totalDuration += segment.totalActivityDuration
      }
    }

    let seconds = Int(totalDuration)

    // 호스트가 "지금 어느 그룹을 계산 중"이라고 적어 둔 값을 되읽어 결과를 남긴다.
    if let groupId = FrimitSharedStore.pendingReportGroupId() {
      FrimitSharedStore.recordReportSeconds(groupId: groupId, seconds: seconds)
    }

    return seconds
  }
}

/// 화면에 보일 일이 없는 뷰.
///
/// `DeviceActivityReport`는 뷰가 렌더링될 때만 `makeConfiguration`을 돌린다.
/// 우리는 숫자만 필요하므로 계산을 유발할 최소한의 뷰만 둔다.
struct TotalActivityView: View {
  let totalSeconds: Int

  var body: some View {
    Text(verbatim: "\(totalSeconds)")
      .opacity(0)
      .accessibilityHidden(true)
  }
}
