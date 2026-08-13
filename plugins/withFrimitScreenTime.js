const { createRunOncePlugin, withEntitlementsPlist, withInfoPlist } = require('expo/config-plugins');

const { withActivityExtensions } = require('./withActivityExtensions');

/**
 * Frimit 사용량 수집에 필요한 iOS 네이티브 설정을 prebuild마다 다시 만들어 준다.
 *
 * ios/ 디렉터리는 CNG(Continuous Native Generation) 정책상 언제든 지워지고 다시
 * 생성될 수 있으므로, 손으로 Xcode에서 켠 capability는 살아남지 못한다.
 * 여기서 하는 일:
 *
 * 1. `com.apple.developer.family-controls` entitlement — 이게 없으면
 *    AuthorizationCenter.requestAuthorization()이 실패한다.
 * 2. App Group — 호스트 앱과 DeviceActivity extension이 같은 UserDefaults를
 *    공유해야 사용량 합계를 주고받을 수 있다.
 * 3. App Group 식별자를 Info.plist에 심어 Swift 쪽에서 하드코딩 없이 읽게 한다.
 *
 * 배포용 Family Controls entitlement는 Apple의 별도 승인이 필요하다.
 * 개발용 프로비저닝에서는 승인 없이 동작하지만, TestFlight 전에 신청해 둘 것.
 * https://developer.apple.com/contact/request/family-controls-distribution
 */

const APP_GROUP_INFO_PLIST_KEY = 'FrimitAppGroupIdentifier';
const FAMILY_CONTROLS_ENTITLEMENT = 'com.apple.developer.family-controls';
const APP_GROUPS_ENTITLEMENT = 'com.apple.security.application-groups';

/** @param {import('expo/config').ExpoConfig} config */
function resolveAppGroup(config, props) {
  if (props.appGroup) return props.appGroup;

  const bundleIdentifier = config.ios?.bundleIdentifier;
  if (!bundleIdentifier) {
    throw new Error(
      '[withFrimitScreenTime] ios.bundleIdentifier가 필요합니다. app.json에 먼저 설정하거나 plugin props로 appGroup을 직접 넘기세요.'
    );
  }
  return `group.${bundleIdentifier}`;
}

const withFamilyControlsEntitlement = (config, { appGroup }) =>
  withEntitlementsPlist(config, (cfg) => {
    cfg.modResults[FAMILY_CONTROLS_ENTITLEMENT] = true;

    // 이미 있는 App Group을 지우지 않도록 합집합으로 다룬다 (멱등성).
    const existing = cfg.modResults[APP_GROUPS_ENTITLEMENT] ?? [];
    cfg.modResults[APP_GROUPS_ENTITLEMENT] = Array.from(new Set([...existing, appGroup]));

    return cfg;
  });

const withAppGroupIdentifier = (config, { appGroup }) =>
  withInfoPlist(config, (cfg) => {
    cfg.modResults[APP_GROUP_INFO_PLIST_KEY] = appGroup;
    return cfg;
  });

/** @type {import('expo/config-plugins').ConfigPlugin<{ appGroup?: string, appleTeamId?: string }>} */
const withFrimitScreenTime = (config, props = {}) => {
  const appGroup = resolveAppGroup(config, props);

  config = withFamilyControlsEntitlement(config, { appGroup });
  config = withAppGroupIdentifier(config, { appGroup });
  // extension 타깃도 호스트와 같은 팀으로 서명돼야 한다. Expo의 자동 서명은
  // 앱 타깃만 챙기므로, 팀 ID를 여기서 직접 넣어 준다.
  // app.json의 plugin props > APPLE_TEAM_ID 환경변수 순으로 찾는다.
  const appleTeamId = props.appleTeamId ?? process.env.APPLE_TEAM_ID;

  config = withActivityExtensions(config, { appGroup, appleTeamId });

  return config;
};

module.exports = createRunOncePlugin(withFrimitScreenTime, 'frimit-screen-time', '0.1.0');
