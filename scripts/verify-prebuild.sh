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
EXT_NAME="FrimitActivityMonitor"
REPORT_NAME="FrimitActivityReport"

fail() {
  echo "❌ $1" >&2
  exit 1
}

check() {
  local label="$1"

  # extension 타깃이 정확히 하나
  local target_count
  target_count=$(grep -c "/\* ${EXT_NAME} \*/ = {" "$PBXPROJ" || true)
  [ "$target_count" -ge 1 ] || fail "[$label] ${EXT_NAME} 타깃이 없습니다"

  local native_target_count
  native_target_count=$(grep -A 1 "isa = PBXNativeTarget;" "$PBXPROJ" | grep -c "$EXT_NAME" || true)
  [ "$native_target_count" -eq 1 ] \
    || fail "[$label] ${EXT_NAME} 네이티브 타깃이 ${native_target_count}개입니다 (1개여야 함)"

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

  # extension 쪽 파일들
  [ -f "ios/${EXT_NAME}/${EXT_NAME}.entitlements" ] || fail "[$label] extension entitlement 없음"
  [ -f "ios/${EXT_NAME}/Info.plist" ] || fail "[$label] extension Info.plist 없음"
  [ -f "ios/${EXT_NAME}/${EXT_NAME}.swift" ] || fail "[$label] extension 소스 없음"
  [ -f "ios/${EXT_NAME}/${EXT_NAME}SharedStore.swift" ] || fail "[$label] 공유 저장소 소스 없음"

  grep -q "com.apple.deviceactivity.monitor-extension" "ios/${EXT_NAME}/Info.plist" \
    || fail "[$label] extension point identifier가 없습니다"

  # Report extension
  [ -f "ios/${REPORT_NAME}/${REPORT_NAME}.swift" ] || fail "[$label] report extension 소스 없음"
  [ -f "ios/${REPORT_NAME}/${REPORT_NAME}SharedStore.swift" ] || fail "[$label] report 공유 저장소 소스 없음"
  [ -f "ios/${REPORT_NAME}/${REPORT_NAME}.entitlements" ] || fail "[$label] report entitlement 없음"

  grep -q "com.apple.deviceactivityui.report-extension" "ios/${REPORT_NAME}/Info.plist" \
    || fail "[$label] report extension point identifier가 없습니다"

  # 공유 소스는 타깃마다 다른 이름이어야 한다. 같은 이름이면 pod install이 깨진다.
  [ ! -f "ios/${EXT_NAME}/FrimitSharedStore.swift" ] \
    || fail "[$label] 공유 소스가 타깃별 이름으로 분리되지 않았습니다"

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
