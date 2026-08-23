import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AddGroupTile, DraftTile, GroupTile } from '@/components/group-tile';
import { SharedPoolHero, SyncRow } from '@/components/shared-pool-hero';
import {
  AppText,
  Avatar,
  EmptyState,
  GradientButton,
  ScreenFrame,
  StatusPill,
} from '@/components/ui';
import { colors, spacing } from '@/constants/design-tokens';
import { useGroupMembers, useGroupUsages, useMyGroups } from '@/hooks/use-groups';
import { MAX_ACTIVE_GROUPS } from '@/lib/groups';
import { useMyProfile } from '@/hooks/use-profile';
import { useTrackingState } from '@/hooks/use-tracking';
import { useUsageSync } from '@/hooks/use-usage-sync';
import { DEV_POOL_STATE, devPoolView } from '@/lib/dev-preview';
import { POOL_VISUALS } from '@/lib/pool-state';
import {
  describePermission,
  isUsable,
  permissionButton,
  recoverPermission,
} from '@/lib/tracking';
import { buildPoolView, pickHeroGroup } from '@/lib/today';
import type { PermissionState } from '@modules/screen-time';

/**
 * 오늘 화면.
 *
 * 순서가 중요하다 — **먼저 올리고, 그다음 읽는다**(`useUsageSync`). 반대로 하면
 * 내가 방금 쓴 시간만 빠진 값이 그려진다. 그 규칙은 훅에 이미 들어 있고 여기서는
 * 건드리지 않는다.
 *
 * 화면의 여덟 모습은 전부 `poolState()` 하나에서 갈린다. 이 파일에 임계값이
 * 다시 나타나면 안 된다.
 */
export default function TodayScreen() {
  const profile = useMyProfile();
  const groups = useMyGroups();
  const usages = useGroupUsages(groups.data);
  const sync = useUsageSync();

  // 개발용 상태 미리보기가 켜져 있으면 그룹이 없어도 히어로를 그린다.
  const devPreview = __DEV__ && DEV_POOL_STATE ? DEV_POOL_STATE : null;

  const [preferredGroupId, setPreferredGroupId] = useState<string | null>(null);
  const hero = pickHeroGroup(groups.data ?? [], preferredGroupId);
  const members = useGroupMembers(hero?.id);
  const tracking = useTrackingState(hero?.id);

  const heroView = useMemo(
    () =>
      // 개발용 상태 미리보기. `dev-preview.ts`를 한 줄 고치면 여덟 상태를 돈다.
      devPreview
        ? devPoolView(devPreview)
        : hero
        ? buildPoolView(hero, usages.byGroupId.get(hero.id), members.data, {
            permission: isUsable(tracking.permission),
            myProfileId: profile.data?.id,
          })
        : null,
    [devPreview, hero, usages.byGroupId, members.data, tracking.permission, profile.data?.id]
  );

  const others = (groups.data ?? []).filter((group) => group.id !== hero?.id);

  /*
   * 그리드에 "그룹 추가" 자리를 둘지.
   *
   * 그룹이 하나라도 있으면 빈 상태의 CTA가 사라지므로, 여기가 두 번째 그룹으로
   * 가는 유일한 문이다. 서버가 5개에서 막으므로(`too_many_groups`) 그때는 그리지
   * 않는다 — 눌러도 거절당할 버튼을 두지 않는다.
   */
  const groupCount = groups.data?.length ?? 0;
  const canAddGroup = groupCount > 0 && groupCount < MAX_ACTIVE_GROUPS;
  const tileCount = others.length + (canAddGroup ? 1 : 0);

  // 홀수 번째 마지막 카드는 두 칸을 차지한다. 그리드에 빈 칸이 남으면 화면이
  // 미완성으로 보인다.
  const isWide = (index: number) => index === tileCount - 1 && tileCount % 2 === 1;

  const refresh = async () => {
    await sync.sync();
    await groups.refetch();
  };

  const visual = heroView ? POOL_VISUALS[heroView.state] : POOL_VISUALS.normal;

  return (
    <ScreenFrame
      texture={visual.texture}
      ambient={
        visual.ambient
          ? { ...visual.ambient, x: heroView?.state === 'fresh' ? 330 : 60, y: 120 }
          : null
      }
      onRefresh={refresh}>
      <Header
        nickname={profile.data?.nickname}
        avatarKey={profile.data?.avatar_key}
        profileId={profile.data?.id}
        view={heroView}
      />

      {groups.isPending ? (
        <HeroSkeleton />
      ) : groups.error ? (
        <EmptyState
          title="공동 풀을 읽지 못했어요"
          body={groups.error instanceof Error ? groups.error.message : String(groups.error)}
          action={<GradientButton label="다시 시도" size="md" onPress={() => groups.refetch()} />}
        />
      ) : !hero && !heroView ? (
        <EmptyState
          title="아직 그룹이 없어요"
          body="친구 한 명만 있으면 공동 시간을 시작할 수 있어요."
          /*
            만들기 화면이 아니라 갈림길(07)로 보낸다. 초대 코드를 받고 온 사람은
            그룹을 만들 게 아니라 참여해야 하는데, 코드 입력은 그 화면에만 있다.
          */
          action={
            <GradientButton label="그룹 시작하기" size="md" onPress={() => router.push('/start')} />
          }
        />
      ) : hero?.status === 'draft' && !devPreview ? (
        /*
          시작 전 그룹이 히어로에 올라오는 경우가 생겼다 — 대기실에서 "먼저
          둘러보기"로 나오면 가진 그룹이 draft 하나뿐일 수 있다.

          게이지를 그리면 안 된다. 서버는 시작 전 그룹에도 한도와 다음 초기화
          시각을 정상으로 주므로(집계 대상만 0명), 그대로 그리면 "우리 시간 8h 중"이
          뜨면서 아무도 안 쓴 날처럼 보인다. 아직 흐르지 않는 시간이다.
        */
        <EmptyState
          title="아직 시작하지 않았어요"
          body="친구가 준비를 마치면 우리 시간이 흐르기 시작해요."
          action={
            <GradientButton
              label="대기실 보기"
              size="md"
              onPress={() => router.push({ pathname: '/ready', params: { groupId: hero.id } })}
            />
          }
        />
      ) : !heroView ? (
        <HeroSkeleton />
      ) : (
        <SharedPoolHero
          view={heroView}
          onPress={() => router.push({ pathname: '/group/[id]', params: { id: heroView.groupId } })}
          syncRow={
            heroView.stale && heroView.staleMembers[0] ? (
              <SyncRow member={heroView.staleMembers[0]} />
            ) : undefined
          }
          permissionCta={
            heroView.state === 'permissionOff' ? (
              <PermissionCTA permission={tracking.permission} />
            ) : undefined
          }
        />
      )}

      {tileCount > 0 && (
        <>
          <View style={styles.sectionTitle}>
            <AppText variant="sectionTitle">내 그룹</AppText>
            <AppText variant="metadata" tone="metadata">
              {groupCount}
            </AppText>
          </View>

          <View style={styles.grid}>
            {others.map((group, index) => {
              const wide = isWide(index);
              const view = buildPoolView(group, usages.byGroupId.get(group.id), undefined, {
                permission: true,
                myProfileId: profile.data?.id,
              });

              const press = () =>
                group.status === 'draft'
                  ? router.push({ pathname: '/ready', params: { groupId: group.id } })
                  : setPreferredGroupId(group.id);

              return (
                <View key={group.id} style={wide ? styles.wide : styles.half}>
                  {group.status === 'draft' || !view ? (
                    <DraftTile name={group.name} wide={wide} onPress={press} />
                  ) : (
                    <GroupTile view={view} wide={wide} onPress={press} />
                  )}
                </View>
              );
            })}

            {canAddGroup && (
              <View style={isWide(others.length) ? styles.wide : styles.half}>
                <AddGroupTile
                  wide={isWide(others.length)}
                  onPress={() => router.push('/start')}
                />
              </View>
            )}
          </View>
        </>
      )}
    </ScreenFrame>
  );
}

/**
 * 인사와 나.
 *
 * 문구는 상태를 따라간다 — 한도를 다 쓴 날과 넘긴 날에는 인사 대신 사실을 말한다.
 * 다만 어느 쪽도 비난이 아니다.
 */
function Header({
  nickname,
  avatarKey,
  profileId,
  view,
}: {
  nickname?: string;
  avatarKey?: string;
  profileId?: string;
  view: ReturnType<typeof buildPoolView>;
}) {
  const off = view?.state === 'permissionOff';

  /*
   * 인사와 이름.
   *
   * 닉네임은 20자까지 허용된다(서버 제약). 24px 굵은 글씨로 "인사말, 이름"을 다
   * 넣으려면 두 줄로도 모자라서 이름이 `…`로 잘린다.
   *
   * 그때 버리는 것은 **인사말**이다. 이름이 아니라. 분위기는 바로 아랫줄이 이미
   * 맡고 있고, 이 화면이 누구의 것인지는 오른쪽 위 아바타가 말한다. 반대로
   * 이름을 자르면 사람을 잘못 부르는 셈이 된다.
   *
   * 두 줄까지 허용한다(`numberOfLines`). 스무 자는 두 줄에 들어가고, 세 줄이
   * 되면 그 아래 히어로가 접힌다 — 이 화면의 주인공은 히어로다.
   */
  const name = nickname ?? '친구';
  const greeting = name.length > 6 ? name : `${greetingFor(new Date())}, ${name}`;

  const [title, subline] =
    view?.state === 'over'
      ? [`${view.headline.replace(' over', '')} 초과했어요`, '내일은 조금 더 여유롭게']
      : view?.state === 'complete'
        ? ['오늘 몫은 다 썼어요', '내일 다시 채워져요.']
        : off
          ? [greeting, '아직 우리 시간에 참여하지 못했어요']
          : view?.state === 'fresh'
            ? [greeting, '화면 밖의 하루가 널 기다리고 있어']
            : view?.state === 'tightening'
              ? ['우리 시간이 조금 남았어요', '같이 아껴봐요.']
              : view?.state === 'approaching'
                ? ['오늘 남은 시간이 얼마 없어요', '같이 아껴봐요.']
                : [greeting, '우리의 일상을 위한 시간도 남겨두자'];

  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <AppText variant="greeting" numberOfLines={2}>
          {title}
        </AppText>
        <AppText variant="body" tone="muted">
          {subline}
        </AppText>
      </View>

      {/* 권한이 꺼져 있으면 내 아바타도 색을 잃는다. 나도 아직 이 시간의 일부가 아니다. */}
      {off ? (
        <View style={styles.flatAvatar} />
      ) : (
        <Avatar
          id={profileId ?? 'me'}
          name={nickname}
          emoji={avatarKey ? undefined : undefined}
          size={44}
          ring="activity"
        />
      )}
    </View>
  );
}

/**
 * 권한을 되찾는 자리.
 *
 * 이 버튼의 그라데이션이 권한 꺼짐 화면에서 **유일하게 채도 있는 요소**다.
 * 게이지는 회색으로 남는다.
 *
 * 버튼이 없는 상태도 있다(기기 정책·미지원 기기). 그때는 눌러도 아무 일이 없는
 * 버튼 대신 이유만 말한다 — 사용자가 켤 수 없는 것을 켜라고 하지 않는다.
 *
 * 설정으로 나갔다 돌아오면 화면이 저절로 살아난다. `useTrackingState`가 앱 복귀
 * 때마다 권한을 다시 읽기 때문이고, 그것이 스펙이 말하는 "재시작 없는 복구"다.
 */
function PermissionCTA({ permission }: { permission: PermissionState }) {
  const cta = permissionButton(permission);

  return (
    <View style={styles.cta}>
      <AppText variant="body" tone="muted" style={styles.ctaBody}>
        {cta
          ? '권한을 켜면 내 사용 시간이 우리 공동 시간에 합산돼요.'
          : describePermission(permission)}
      </AppText>
      {cta && (
        <GradientButton
          label={cta.label}
          size="md"
          onPress={() => recoverPermission(permission)}
        />
      )}
    </View>
  );
}

function HeroSkeleton() {
  return (
    <View style={styles.skeleton}>
      <StatusPill label="읽는 중" />
      <View style={styles.skeletonRing} />
    </View>
  );
}

/**
 * 시간대별 인사.
 *
 * 영어의 morning/afternoon/evening을 그대로 옮기면 안 된다. 한국어에서 실제로
 * 쓰는 인사는 "좋은 아침"뿐이고, "좋은 오후"와 "좋은 저녁"은 번역투다. 그래서
 * 시간대는 살리되 문구는 각각 따로 고른다.
 *
 * 저녁이 "고생했어"인 것은 이 제품의 태도이기도 하다. 하루의 끝에 화면을 얼마나
 * 봤는지 따지지 않는다.
 */
function greetingFor(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return '좋은 아침';
  if (hour < 18) return '오늘도 반가워';
  return '고생했어';
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    gap: 12,
    // 인사와 히어로가 붙으면 큰 숫자가 제목의 일부처럼 읽힌다. 둘은 다른
    // 층위라 사이를 벌려 둔다.
    marginBottom: 10,
  },
  headerText: { gap: 5, flexShrink: 1 },
  flatAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingTop: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.gridGap,
  },
  half: { width: '48%', flexGrow: 1 },
  wide: { width: '100%' },
  cta: { gap: 12, paddingTop: 12 },
  ctaBody: { lineHeight: 21 },
  skeleton: {
    height: 290,
    borderRadius: 32,
    backgroundColor: colors.surface.cardNeutral,
    borderWidth: 1,
    borderColor: colors.border.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  skeletonRing: {
    width: 162,
    height: 162,
    borderRadius: 81,
    borderWidth: 15,
    borderColor: 'rgba(255,255,255,0.055)',
  },
});
