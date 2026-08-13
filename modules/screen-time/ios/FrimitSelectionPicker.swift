import FamilyControls
import SwiftUI
import UIKit

/// 시스템 `FamilyActivityPicker`를 감싼 시트.
///
/// 이 화면 안에서만 앱 이름과 아이콘이 보이고, 그것도 Apple이 그리는 것이라
/// 우리 코드는 앱의 정체를 알 수 없다. 우리가 받는 건 불투명한 토큰뿐이다.
struct FrimitSelectionPicker: View {
  @State private var selection: FamilyActivitySelection
  private let onFinish: (FamilyActivitySelection?) -> Void

  init(initialSelection: FamilyActivitySelection, onFinish: @escaping (FamilyActivitySelection?) -> Void) {
    _selection = State(initialValue: initialSelection)
    self.onFinish = onFinish
  }

  var body: some View {
    NavigationStack {
      FamilyActivityPicker(selection: $selection)
        .navigationTitle("추적할 앱 고르기")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button("취소") { onFinish(nil) }
          }
          ToolbarItem(placement: .confirmationAction) {
            Button("완료") { onFinish(selection) }
          }
        }
    }
  }
}

/// 클로저가 자기를 띄운 뷰 컨트롤러를 참조할 수 있게 해주는 상자.
final class FrimitPresentationBox {
  var viewController: UIViewController?
}
