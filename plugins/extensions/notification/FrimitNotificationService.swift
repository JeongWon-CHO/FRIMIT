import UserNotifications

/// 남이 풀을 태워 버렸을 때 잠그는 경로.
///
/// 임계값 콜백(Monitor extension)은 **내 사용량이 오를 때만** 깨어난다. 그런데
/// 공동 풀은 남이 대신 태워 버릴 수 있고, 그때 내 누적은 1초도 늘지 않는다.
/// 그 경우 다음 동기화까지 잠기지 않는데, 하필 그 시간이 내가 그 앱을 보고 있는
/// 시간이다.
///
/// 그래서 이미 나가고 있던 "오늘 몫을 다 썼어요" 알림에 얹어 탄다. `mutable-content`가
/// 붙은 알림은 화면에 뜨기 전에 이 extension을 깨우므로, 여기서 잠그고 알림은
/// 손대지 않은 채 그대로 흘려보낸다.
///
/// silent push(`content-available`) 대신 이 방식을 고른 이유: 앱이 강제 종료돼
/// 있으면 silent push는 아예 배달되지 않지만, 눈에 보이는 알림은 배달된다.
class FrimitNotificationService: UNNotificationServiceExtension {
  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    if let groupId = Self.shieldGroupId(in: request.content.userInfo) {
      // 이 알림이 나가는 시점의 잔여는 정의상 0이다. 한도를 다 썼다는 사건에만
      // 이 값을 실어 보내기 때문이다(push-activity).
      FrimitSharedStore.setShieldBudget(groupId: groupId, remainingSeconds: 0)
    }

    // 알림 자체는 건드리지 않는다. 문장을 정하는 곳은 서버 하나뿐이어야 한다.
    contentHandler(request.content)
  }

  /// 시간이 다 되면 시스템이 여기로 온다. 원본을 그대로 내보내는 것 말고 할 일이 없다.
  override func serviceExtensionTimeWillExpire() {}

  /**
   * 잠글 그룹 id를 payload에서 찾는다.
   *
   * Expo 푸시 서비스는 `data`를 APNs payload의 최상위 `body` 아래에 넣는데, 그
   * 값이 사전으로 올 때도 JSON 문자열로 올 때도 있다. 어느 쪽이든 열어 보고,
   * Expo를 거치지 않은 raw APNs도 대비해 최상위도 함께 본다.
   *
   * 세 갈래를 전부 두는 이유는 여기서 틀렸을 때의 증상이 오류가 아니라 **조용한
   * 무동작**이기 때문이다. 알림은 정상적으로 뜨고 잠금만 안 걸린다.
   */
  static func shieldGroupId(in userInfo: [AnyHashable: Any]) -> String? {
    let key = "shieldGroupId"

    if let direct = userInfo[key] as? String { return direct }

    if let body = userInfo["body"] as? [AnyHashable: Any] {
      return body[key] as? String
    }

    if let raw = userInfo["body"] as? String,
       let data = raw.data(using: .utf8),
       let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
      return parsed[key] as? String
    }

    return nil
  }
}
