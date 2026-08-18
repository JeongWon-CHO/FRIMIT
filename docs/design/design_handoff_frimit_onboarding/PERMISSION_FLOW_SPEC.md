# PERMISSION_FLOW_SPEC

## Principle

Frimit owns the screen **before** a system prompt and the screen **after** it. It never draws the prompt itself.

```
[ Frimit: why ]  →  [ OS: the actual permission UI ]  →  [ Frimit: what changed ]
```

Do not build a fake OS sheet, do not restyle `FamilyActivityPicker`, do not wrap system UI in a Frimit-branded container. If a system screen looks out of place, the fix is to soften Frimit's screens on either side of it, not to replace the system screen.

---

## 1. Notifications

| Stage | Owner | Screen |
| --- | --- | --- |
| Pre-permission | Frimit | 04 Notification intro — three sample notifications, value-first copy |
| Request | OS | `Notifications.requestPermissionsAsync()` presents the system alert |
| Return | Frimit | No dedicated screen. Advance to 05 either way |

**Rules.**
- Only request after the user taps `Turn on notifications`. `Not now` must never trigger the OS alert.
- The OS alert can be shown only once per install. If `canAskAgain === false`, `Turn on notifications` deep-links to app settings (`Linking.openSettings()`) instead.
- Denial is not blocking and is never re-prompted during onboarding. The re-entry point is MY → Notifications toggle.
- Store the resolved status; the MY toggle reflects it and does not lie about local state.

---

## 2. Screen Time

| Stage | Owner | Screen |
| --- | --- | --- |
| Trust explanation | Frimit | 05 Privacy intro — "Friends can see" / "Friends can't see" |
| Pre-permission | Frimit | 06 Permission (not requested) |
| Authorization | OS | iOS: `AuthorizationCenter.requestAuthorization(for: .individual)` (Family Controls). Android: Usage Access settings screen via `Settings.ACTION_USAGE_ACCESS_SETTINGS` |
| Return, granted | Frimit | 06a Approved |
| Return, denied | Frimit | 06b Denied |
| Later recovery | Frimit | 16 Permission recovery / Today state H / MY |

**Rules.**
- 05 must be shown before 06. It is the screen that earns the permission; do not let a deep link skip it.
- The three app names on 05 are static examples. Never populate them with the user's real usage — that would expose exactly what the screen promises to keep private.
- iOS Family Controls presents its own sheet; Android sends the user out to a settings screen. Both return asynchronously — handle the return via `AppState` change, not by assuming the promise resolves in the foreground.
- Android's usage-access path can return with the user having changed nothing. Treat "no change" as denied and show 06b.
- On grant, 06a shows for ~1600ms and then continues automatically; the `Continue` button is always tappable.
- Never block navigation on denial. A denied user completes onboarding and is simply marked "Waiting for Screen Time" in readiness.

---

## 3. App selection (system picker)

| Stage | Owner | Screen |
| --- | --- | --- |
| Explanation | Frimit | 11 Tracking intro — what counts, and that the list stays on the device |
| Selection | OS | iOS `FamilyActivityPicker`; Android: an app list built from usage-access data, styled with system defaults |
| Return | Frimit | 12 App selection result — the count only |

**Rules.**
- Selection is **per group**. The same user may count different apps in different pools. Persist `{ groupId, selectionToken }`.
- On iOS the selection is an opaque `FamilyActivitySelection` token. Frimit stores the token and the **count**; it never resolves or transmits app identities. What syncs to the server is total minutes, app count, and a sync timestamp.
- On Android, keep the same contract even though package names are readable: store them locally, send only the aggregate.
- Returning with zero selections shows the empty variant of 12, not an error dialog.
- `Change selection` reopens the picker with the previous selection pre-loaded.

---

## 4. Denied, re-ask and settings

```
denied → can the OS still prompt?
   ├ yes  → "Try again" re-invokes the system request
   └ no   → "Try again" opens Linking.openSettings()
            and the button label becomes "설정에서 켜기"
```

- Never show a permission prompt more than once per user action.
- No nagging: no modal on app open, no red badge, no interstitial. The only persistent affordances are the Today hero CTA (state H) and the MY row.
- When permission is granted later, the app must recover without a restart: re-read the authorization status on `AppState` `active`, then animate Today from state H to its live state (`ONBOARDING_MOTION_SPEC` §7).

## 5. State contract

```ts
type PermissionState = 'notRequested' | 'granted' | 'denied' | 'blocked'; // blocked = cannot ask again

interface OnboardingPermissions {
  notifications: PermissionState;
  screenTime: PermissionState;
  appSelection: { groupId: string; count: number; updatedAt: string } | null;
}
```

Readiness (screen 13) is derived, never stored:

```ts
const isReady = permissions.screenTime === 'granted' && (permissions.appSelection?.count ?? 0) > 0;
```

## 6. Copy boundaries

Frimit's copy explains value and consequence; it never describes the system UI's buttons ("탭하세요 → 허용"). The one exception is the neutral note on screen 06 — `다음 화면은 iOS / Android 시스템 시트예요.` — which sets the expectation that the next surface is not Frimit's.
