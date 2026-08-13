import DeviceActivity
import SwiftUI

/// 정밀 사용량을 계산하는 extension.
///
/// iOS에서 실제 사용 시간을 초 단위로 읽을 수 있는 유일한 자리다. 다만 이 데이터는
/// extension 밖으로 나가지 못하게 설계돼 있어서, 계산한 합계를 App Group에 적어 두고
/// 호스트 앱이 그것을 되읽는 구조를 쓴다.
///
/// ⚠️ 이 우회는 Apple의 프라이버시 설계 의도를 비껴가는 것이라 심사 리스크가 있다.
/// Monitor extension(백그라운드 임계값)만으로도 제품은 성립하도록 만들어 뒀으므로,
/// 문제가 되면 이 타깃만 통째로 떼어내면 된다.
@main
struct FrimitActivityReport: DeviceActivityReportExtension {
  var body: some DeviceActivityReportScene {
    TotalActivityReport { totalSeconds in
      TotalActivityView(totalSeconds: totalSeconds)
    }
  }
}
