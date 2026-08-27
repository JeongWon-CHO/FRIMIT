#!/usr/bin/env bash
#
# plan.md 6장: "clean prebuild를 반복해 iOS extension과 entitlement 생성이 멱등인지 확인한다"
#
# config plugin은 ios/ 디렉터리가 통째로 사라졌다 다시 생기는 것을 전제로 하므로,
# 두 번 돌렸을 때 타깃이 두 개가 되거나 entitlement가 덮어써져 사라지면 안 된다.
# CI에서 이 스크립트를 돌린다.

set -euo pipefail

cd "$(dirname "$0")/.."

PBXPROJ="ios/Frimit.xcodeproj/project.pbxproj"
ENTITLEMENTS="ios/Frimit/Frimit.entitlements"
# extension 타깃 이름과 그 타깃의 extension point. 하나가 늘 때마다 여기에 한 줄
# 추가한다 — 목록이 어긋나면 새 타깃은 검사 없이 지나간다.
EXT_NAMES=(FrimitActivityMonitor FrimitNotificationService)
EXT_POINTS=(com.apple.deviceactivity.monitor-extension com.apple.usernotifications.service)
# 폐기한 타깃. 되살아나지 않는지 함께 확인한다 (전략 A, 2026-08-13 폐기).
RETIRED_NAME="FrimitActivityReport"

fail() {
  echo "❌ $1" >&2
  exit 1
}

check() {
  local label="$1"

  # 타깃마다 정확히 하나씩 있는가. 반복 prebuild에서 늘어나는 것이 이 검사의 표적이다.
  local index
  for index in "${!EXT_NAMES[@]}"; do
    local name="${EXT_NAMES[$index]}"

    local target_count
    target_count=$(grep -c "/\* ${name} \*/ = {" "$PBXPROJ" || true)
    [ "$target_count" -ge 1 ] || fail "[$label] ${name} 타깃이 없습니다"

    local native_target_count
    native_target_count=$(grep -A 1 "isa = PBXNativeTarget;" "$PBXPROJ" | grep -c "$name" || true)
    [ "$native_target_count" -eq 1 ] \
      || fail "[$label] ${name} 네이티브 타깃이 ${native_target_count}개입니다 (1개여야 함)"
  done

  # 호스트 앱이 extension에 의존하는가 (없으면 빌드도 탑재도 안 된다)
  grep -q "PBXTargetDependency" "$PBXPROJ" \
    || fail "[$label] 호스트 앱이 extension에 의존하지 않습니다"

  # extension이 앱 번들에 복사되는가 (dstSubfolderSpec 13 = PlugIns)
  grep -q "dstSubfolderSpec = 13;" "$PBXPROJ" \
    || fail "[$label] Embed App Extensions 복사 페이즈가 없습니다"

  # 호스트 entitlement
  grep -q "com.apple.developer.family-controls" "$ENTITLEMENTS" \
    || fail "[$label] 호스트에 Family Controls entitlement가 없습니다"
  grep -q "group.com.frimit.app" "$ENTITLEMENTS" \
    || fail "[$label] 호스트에 App Group이 없습니다"

  # App Group이 중복 등록되지 않았는가
  local group_count
  group_count=$(grep -c "group.com.frimit.app" "$ENTITLEMENTS" || true)
  [ "$group_count" -eq 1 ] \
    || fail "[$label] App Group이 ${group_count}번 등록됐습니다 (1번이어야 함)"

  # Apple 로그인 entitlement (app.json의 ios.usesAppleSignIn)
  #
  # 이 파일에 쓰는 주체가 둘이라서 확인한다 — expo의 기본 mod와 우리
  # `withFrimitScreenTime`이 같은 entitlements를 건드린다. 한쪽이 파일을
  # 통째로 쓰면 다른 쪽 키가 조용히 사라지고, 그때 나는 증상은 빌드 실패가
  # 아니라 **실기기에서 Apple 시트가 뜨자마자 닫히는 것**이다.
  grep -q "com.apple.developer.applesignin" "$ENTITLEMENTS" \
    || fail "[$label] Apple 로그인 entitlement가 없습니다"

  # extension 쪽 파일들
  for index in "${!EXT_NAMES[@]}"; do
    local name="${EXT_NAMES[$index]}"

    [ -f "ios/${name}/${name}.entitlements" ] || fail "[$label] ${name} entitlement 없음"
    [ -f "ios/${name}/Info.plist" ] || fail "[$label] ${name} Info.plist 없음"
    [ -f "ios/${name}/${name}.swift" ] || fail "[$label] ${name} 소스 없음"
    [ -f "ios/${name}/${name}SharedStore.swift" ] || fail "[$label] ${name} 공유 저장소 소스 없음"

    grep -q "${EXT_POINTS[$index]}" "ios/${name}/Info.plist" \
      || fail "[$label] ${name}의 extension point identifier가 없습니다"

    # 잠그려면 두 extension 모두 Family Controls가 필요하다.
    grep -q "com.apple.developer.family-controls" "ios/${name}/${name}.entitlements" \
      || fail "[$label] ${name}에 Family Controls entitlement가 없습니다"

    # 공유 소스는 타깃마다 다른 이름이어야 한다. 같은 이름이면 pod install이 깨진다.
    [ ! -f "ios/${name}/FrimitSharedStore.swift" ] \
      || fail "[$label] ${name}의 공유 소스가 타깃별 이름으로 분리되지 않았습니다"
  done

  # 폐기한 Report extension이 파일로도 타깃으로도 남아 있지 않아야 한다
  [ ! -d "ios/${RETIRED_NAME}" ] || fail "[$label] 폐기한 ${RETIRED_NAME} 디렉터리가 남아 있습니다"
  ! grep -q "$RETIRED_NAME" "$PBXPROJ" \
    || fail "[$label] 폐기한 ${RETIRED_NAME} 타깃이 pbxproj에 남아 있습니다"

  # 호스트가 App Group 식별자를 읽을 수 있는가
  /usr/libexec/PlistBuddy -c "Print :FrimitAppGroupIdentifier" ios/Frimit/Info.plist > /dev/null 2>&1 \
    || fail "[$label] 호스트 Info.plist에 App Group 식별자가 없습니다"

  echo "✅ [$label] 통과"
}

echo "1/3 · clean prebuild"
npx expo prebuild --platform ios --clean --no-install > /dev/null
check "clean prebuild"

echo "2/3 · clean prebuild 반복"
npx expo prebuild --platform ios --clean --no-install > /dev/null
check "clean prebuild 반복"

echo "3/3 · clean 없이 prebuild (기존 프로젝트 위에 덮어쓰기)"
npx expo prebuild --platform ios --no-install > /dev/null
check "non-clean prebuild"

echo
echo "🎉 prebuild 멱등성 검증 통과"
