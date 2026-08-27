const fs = require('fs');
const path = require('path');

const { withDangerousMod, withXcodeProject } = require('expo/config-plugins');

/**
 * DeviceActivity extension 타깃을 prebuild마다 다시 만들어 준다.
 *
 * Xcode에서 손으로 추가한 타깃은 `expo prebuild --clean`에서 사라지므로
 * pbxproj 조작을 코드로 남겨야 한다. plan.md가 요구하는 "clean prebuild 멱등성"이
 * 바로 이 파일의 존재 이유다.
 *
 * 만드는 타깃:
 * - `<앱>ActivityMonitor`     : 백그라운드 임계값 감시 (전략 B)
 * - `<앱>NotificationService` : 한도 소진 알림을 받아 그 자리에서 앱을 잠근다
 *
 * 한때 `<앱>ActivityReport`(전략 A, 앱이 열려 있을 때 정밀 합계 계산)도 함께
 * 만들었지만 실기기 3차 측정까지 한 번도 실행되지 않아 2026-08-13에 폐기했다.
 * 경위는 docs/spike-protocol.md의 측정 기록에 남아 있다.
 */

const SHARED_SOURCE = 'FrimitSharedStore.swift';

/**
 * 공유 소스는 타깃마다 **다른 파일명으로** 복사한다.
 *
 * 같은 이름의 파일을 여러 타깃의 Sources 빌드 페이즈에 넣으면 xcodeproj가 파일 참조의
 * 부모 그룹을 찾지 못해 `Consistency issue: no parent for object` 로 pod install이
 * 통째로 깨진다. Swift는 파일명과 타입명이 일치할 필요가 없으므로, 내용은 그대로 두고
 * 이름만 타깃별로 달리한다.
 *
 * 타깃이 둘이 되면서 이 규약이 실제로 일하기 시작했다. 둘 다 같은 공유 소스를
 * 쓰므로, 이름을 나누지 않으면 여기서 pod install이 통째로 깨진다.
 */
function sharedSourceNameFor(target) {
  return `${target.name}SharedStore.swift`;
}

/** @type {{ name: string, dir: string, sources: string[], extensionPointIdentifier: string, principalClass: string }[]} */
const EXTENSIONS = [
  {
    name: 'FrimitActivityMonitor',
    dir: 'monitor',
    sources: ['FrimitActivityMonitor.swift'],
    extensionPointIdentifier: 'com.apple.deviceactivity.monitor-extension',
    principalClass: 'FrimitActivityMonitor',
  },
  {
    name: 'FrimitNotificationService',
    dir: 'notification',
    sources: ['FrimitNotificationService.swift'],
    extensionPointIdentifier: 'com.apple.usernotifications.service',
    principalClass: 'FrimitNotificationService',
  },
];

/** 더 이상 만들지 않는 타깃. 이미 생성된 프로젝트에서 지우기 위해 이름만 남긴다. */
const RETIRED_EXTENSIONS = ['FrimitActivityReport'];

function templateDir(target) {
  return path.join(__dirname, 'extensions', target.dir);
}

function sharedDir() {
  return path.join(__dirname, 'extensions', 'shared');
}

function infoPlistContent(target, { version, buildNumber }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>$(PRODUCT_NAME)</string>
  <key>CFBundleDisplayName</key>
  <string>$(PRODUCT_NAME)</string>
  <key>CFBundleIdentifier</key>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundlePackageType</key>
  <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
  <!-- extension의 버전은 호스트 앱과 정확히 같아야 한다.
       다르면 빌드 경고로 시작해 App Store 업로드에서 거부된다. -->
  <key>CFBundleShortVersionString</key>
  <string>${version}</string>
  <key>CFBundleVersion</key>
  <string>${buildNumber}</string>
  <key>FrimitAppGroupIdentifier</key>
  <string>__APP_GROUP__</string>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionPointIdentifier</key>
    <string>${target.extensionPointIdentifier}</string>
    <key>NSExtensionPrincipalClass</key>
    <string>$(PRODUCT_MODULE_NAME).${target.principalClass}</string>
  </dict>
</dict>
</plist>
`;
}

function entitlementsContent(appGroup) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.developer.family-controls</key>
  <true/>
  <key>com.apple.security.application-groups</key>
  <array>
    <string>${appGroup}</string>
  </array>
</dict>
</plist>
`;
}

/**
 * extension 소스와 plist를 ios/<타깃이름>/ 아래에 새로 쓴다.
 * 매번 통째로 다시 쓰기 때문에 멱등이다.
 */
const withExtensionFiles = (config, { appGroup }) =>
  withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const iosRoot = cfg.modRequest.platformProjectRoot;
      const version = cfg.version ?? '1.0.0';
      const buildNumber = cfg.ios?.buildNumber ?? '1';

      // 폐기한 타깃의 소스가 남아 있으면 지운다. clean이 아닌 prebuild에서도
      // 파일만큼은 확실히 사라지게 한다.
      for (const name of RETIRED_EXTENSIONS) {
        fs.rmSync(path.join(iosRoot, name), { recursive: true, force: true });
      }

      for (const target of EXTENSIONS) {
        const outDir = path.join(iosRoot, target.name);
        fs.mkdirSync(outDir, { recursive: true });

        for (const source of target.sources) {
          fs.copyFileSync(
            path.join(templateDir(target), source),
            path.join(outDir, source)
          );
        }

        // 호스트 앱과 키 규약을 공유하는 파일. 각 extension 타깃에 복사해 넣는다.
        fs.copyFileSync(
          path.join(sharedDir(), SHARED_SOURCE),
          path.join(outDir, sharedSourceNameFor(target))
        );

        fs.writeFileSync(
          path.join(outDir, 'Info.plist'),
          infoPlistContent(target, { version, buildNumber }).replace('__APP_GROUP__', appGroup)
        );

        fs.writeFileSync(
          path.join(outDir, `${target.name}.entitlements`),
          entitlementsContent(appGroup)
        );
      }

      return cfg;
    },
  ]);

/** 새 타깃의 Debug/Release 빌드 설정을 한꺼번에 덮어쓴다. */
function applyBuildSettings(project, targetUuid, settings) {
  const nativeTarget = project.pbxNativeTargetSection()[targetUuid];
  const configListUuid = nativeTarget.buildConfigurationList;
  const configList = project.pbxXCConfigurationList()[configListUuid];
  const buildConfigs = project.pbxXCBuildConfigurationSection();

  for (const ref of configList.buildConfigurations) {
    const buildConfig = buildConfigs[ref.value];
    if (!buildConfig) continue;
    Object.assign(buildConfig.buildSettings, settings);
  }
}

/** 이름이 같은 타깃이 이미 있으면 다시 만들지 않는다 (clean이 아닌 prebuild 대비). */
function targetExists(project, name) {
  const targets = project.pbxNativeTargetSection();
  return Object.keys(targets).some((key) => {
    if (key.endsWith('_comment')) return false;
    const raw = targets[key]?.name;
    // pbxproj의 이름은 따옴표가 붙어 있을 때도, 없을 때도 있다.
    return typeof raw === 'string' && raw.replace(/"/g, '') === name;
  });
}

const withExtensionTargets = (config, { appleTeamId }) =>
  withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const hostBundleId = cfg.ios?.bundleIdentifier;

    // xcode 패키지의 addTargetDependency는 이 두 섹션이 이미 있을 때만 동작하고,
    // 없으면 아무 말 없이 건너뛴다. Expo 템플릿 pbxproj에는 extension이 없어서
    // 두 섹션 자체가 존재하지 않으므로 먼저 만들어 준다.
    // 이게 없으면 호스트 앱이 extension을 빌드하지도, 품고 나가지도 않는다.
    const objects = project.hash.project.objects;
    objects.PBXTargetDependency = objects.PBXTargetDependency || {};
    objects.PBXContainerItemProxy = objects.PBXContainerItemProxy || {};

    // 호스트 앱에도 팀을 박아 둔다. `expo run:ios`는 실행 시점에 팀을 채워 주지만,
    // 순수 xcodebuild나 CI에서는 아무도 채워 주지 않아 "requires a development team"으로
    // 실패한다. extension만 설정해 두면 호스트에서 먼저 막힌다.
    const mainTargetUuid = project.getFirstTarget().uuid;
    if (appleTeamId) {
      applyBuildSettings(project, mainTargetUuid, { DEVELOPMENT_TEAM: appleTeamId });
    }

    // 폐기한 타깃은 pbxproj에서 안전하게 떼어낼 방법이 없다(`xcode` 패키지에
    // removeTarget이 없다). 소스는 이미 지웠으니 그대로 두면 빌드가 깨지므로,
    // 남아 있다면 clean prebuild가 필요하다고 알려 준다.
    for (const name of RETIRED_EXTENSIONS) {
      if (targetExists(project, name)) {
        console.warn(
          `[withFrimitScreenTime] 폐기된 ${name} 타깃이 ios/ 프로젝트에 남아 있습니다. ` +
            '`npx expo prebuild --platform ios --clean`으로 다시 생성하세요.'
        );
      }
    }

    for (const target of EXTENSIONS) {
      if (targetExists(project, target.name)) {
        continue;
      }

      const sourceFiles = [...target.sources, sharedSourceNameFor(target)];
      const files = [...sourceFiles, 'Info.plist', `${target.name}.entitlements`];

      // 1. Xcode 프로젝트 네비게이터에 폴더를 만든다.
      const group = project.addPbxGroup(files, target.name, target.name);

      // 2. 그 폴더를 최상위(main group) 아래에 매단다.
      const groups = project.hash.project.objects.PBXGroup;
      for (const key of Object.keys(groups)) {
        if (key.endsWith('_comment')) continue;
        const candidate = groups[key];
        if (candidate.name === undefined && candidate.path === undefined) {
          project.addToPbxGroup(group.uuid, key);
        }
      }

      // 3. 타깃 자체를 만든다.
      //    addTarget은 내부적으로 호스트 앱에 대한 의존성 등록과
      //    "Embed App Extensions" 복사 페이즈(dstSubfolderSpec 13)까지 함께 만든다.
      const newTarget = project.addTarget(
        target.name,
        'app_extension',
        target.name,
        `${hostBundleId}.${target.name.replace(/^Frimit/, '').toLowerCase()}`
      );

      // 4. 빌드 페이즈. Swift 파일만 컴파일하고 리소스는 없다.
      project.addBuildPhase(sourceFiles, 'PBXSourcesBuildPhase', 'Sources', newTarget.uuid);
      project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', newTarget.uuid);
      project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', newTarget.uuid);

      applyBuildSettings(project, newTarget.uuid, {
        CODE_SIGN_ENTITLEMENTS: `${target.name}/${target.name}.entitlements`,
        INFOPLIST_FILE: `${target.name}/Info.plist`,
        IPHONEOS_DEPLOYMENT_TARGET: '16.4',
        SWIFT_VERSION: '5.0',
        TARGETED_DEVICE_FAMILY: '"1"',
        SKIP_INSTALL: 'YES',
        CLANG_ENABLE_MODULES: 'YES',
        CODE_SIGN_STYLE: 'Automatic',
        ...(appleTeamId ? { DEVELOPMENT_TEAM: appleTeamId } : {}),
      });
    }

    return cfg;
  });

/** @type {import('expo/config-plugins').ConfigPlugin<{ appGroup: string, appleTeamId?: string }>} */
const withActivityExtensions = (config, props) => {
  config = withExtensionFiles(config, props);
  config = withExtensionTargets(config, props);
  return config;
};

module.exports = { withActivityExtensions, EXTENSIONS };
