# ONBOARDING_NAVIGATION

## Entry points

| # | Entry | Lands on | Notes |
| --- | --- | --- | --- |
| E1 | Fresh install, cold open | 01 Welcome | Default. |
| E2 | Deep link / universal link `frimit://invite/<code>` | 08 Invitation preview | If unauthenticated, run 02 → 03 first and hold the invite, then land on 08. Screen 07 is **skipped**. |
| E3 | "I have an invite" on 01 | Code entry (07 Join card) → 08 | Same as E2 after a valid code. |
| E4 | Returning user, authenticated, has ≥1 group | Today | Onboarding is not shown again. |
| E5 | Returning user, authenticated, no group | 07 Create or Join | Profile and permissions already resolved. |
| E6 | Permission revoked later (OS settings) | Today in state H → 16 Recovery | Not part of onboarding; reuses its CTA. |

## Linear spine

```
01 Welcome
   └ Get started → 02 Sign in
        └ success → 03 Profile setup
             └ Continue → 04 Notification intro
                  ├ Turn on notifications → [OS sheet] → 05
                  └ Not now →                            05 Privacy intro
                       └ Continue → 06 Permission (not requested)
```

## Permission branch

```
06 Permission
 ├ Enable Screen Time → [OS Screen Time sheet]
 │      ├ granted → 06a Approved ──┐
 │      └ denied  → 06b Denied     │
 │                    ├ Try again → [OS sheet] or [Settings]
 │                    └ Continue for now ──┐
 └ Continue for now ─────────────────────┐ │
                                         ▼ ▼
                                   07 Create or Join
```

A denied user proceeds through the entire social flow. Their group participation is inactive until permission is granted; every screen from 11 onward shows their readiness as "Waiting for Screen Time".

## Social branch

```
07 Create or Join
 ├ Create a group ─────────► 09 Create group (step 1 → step 2)
 │                                └ Create → 10 Invite friends
 │                                     └ (share / continue) → 11 Tracking intro
 └ Join with invite (code) ─► 08 Invitation preview
                                  └ Join the group → 11 Tracking intro
                                  └ 먼저 둘러볼게요 → Today (explore mode, no group)

[E2 deep link] ─────────────► 08  (07 skipped)
```

## Tracking branch

```
11 Tracking intro
   └ Choose apps → [System picker: FamilyActivityPicker / Android equivalent]
        └ returns → 12 App selection result
             ├ Looks good        → 13 Member readiness
             └ Change selection  → [System picker] → 12
             └ (0 apps selected) → 12 with the empty variant → Choose apps → [System picker]
```

## Start branch

```
13 Member readiness
   └ Go to waiting room → 14 Waiting room
        ├ ADMIN:  Start our pool → 15 Group started → See today → Today (Fresh Day)
        ├ ADMIN:  Invite another friend → share sheet (stays on 14)
        └ MEMBER: waits; realtime "pool_started" event → 15 → Today
```

The admin is the group creator. A joining member never sees `Start our pool`; they see the waiting line instead. Both roles pass through 15 so that everyone gets the same hand-off moment.

## Recovery branch

```
Any user with Screen Time denied
   └ browses the app (Today state H, Goals, Activity, MY all reachable)
        └ 16 Permission recovery (Today hero) or MY → Connect Screen Time
             └ [OS sheet] or [Settings deep link]
                  ├ granted → 06a Approved → returns to the screen of origin, now live
                  └ denied  → stays in state H, no nag, no modal
```

## Back behavior

| Screen | Back allowed | Target |
| --- | --- | --- |
| 01 | — | Exit app |
| 02 | Yes | 01 |
| 03 | Yes | 02 |
| 04, 05, 06 | No visible back | Forward-only; the OS back gesture on Android is disabled for these three so a permission flow isn't half-completed |
| 06a / 06b | No | Only their CTAs |
| 07 | No | Entering 07 clears the auth stack (`navigation.reset`) |
| 08 | Yes when reached from 07; no when deep-linked | 07 |
| 09 step 2 | Yes | 09 step 1 |
| 10 | Yes | 09 |
| 11, 12 | No | The picker owns this step |
| 13 | Yes | 12 |
| 14 | Yes | 13 |
| 15 | No | Forward only |
| 16 | n/a | It is a tab screen |

## Navigator structure

```
RootStack
 ├ OnboardingStack (headerShown: false, gestureEnabled per the table above)
 │   ├ Welcome, SignIn, ProfileSetup
 │   ├ NotificationIntro, PrivacyIntro, PermissionRequest
 │   ├ PermissionResult (params: { granted: boolean })   // 06a / 06b
 │   ├ CreateOrJoin, InvitationPreview
 │   ├ CreateGroup (params: { step: 1 | 2 }), InviteFriends
 │   ├ TrackingIntro, SelectionResult
 │   └ Readiness, WaitingRoom, GroupStarted
 └ MainTabs  (Today · Goals · Activity · MY)
```

Transition to the app: `navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] })` from 15, so back never returns into onboarding.

## Resume rules

Persist an `onboardingStep` value on every successful advance. On relaunch mid-flow:
- Before 07: resume at the stored step.
- 09–10 with a created group: resume at 10.
- 11–12: resume at 11 (re-explain before reopening the picker).
- 13–14: resume at 14; if the pool has already started, go straight to Today.
- After 15: never show onboarding again.

## Screens that must not be built
The OS notification sheet, the Screen Time authorization sheet, `FamilyActivityPicker`, and the OS share sheet. They are system UI — see `PERMISSION_FLOW_SPEC.md`.
