import { describe, expect, it } from 'vitest';

import { buildPoolView, groupAccent, pickHeroGroup } from './today';
import type { GroupMember, MyGroup } from './groups';
import type { GroupDailyUsage } from './usage-sync';

const NOW = new Date('2026-08-18T12:00:00Z');
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60_000).toISOString();

const group = (patch: Partial<MyGroup> = {}): MyGroup => ({
  id: 'group-1',
  name: '밤샘 금지단',
  status: 'active',
  invite_code: '824913',
  icon_key: 'icon-01',
  color_key: 'color-01',
  admin_id: 'me',
  started_at: '2026-08-01T00:00:00Z',
  time_zone: 'Asia/Seoul',
  ...patch,
});

const members: GroupMember[] = [
  { profile_id: 'me', role: 'admin', is_ready: true, effective_from: null, effective_until: null, nickname: '정원', avatar_key: 'avatar-01' },
  { profile_id: 'minji', role: 'member', is_ready: true, effective_from: null, effective_until: null, nickname: '민지', avatar_key: 'avatar-02' },
];

const usage = (patch: Partial<GroupDailyUsage> = {}): GroupDailyUsage => ({
  group_id: 'group-1',
  period_start: '2026-08-18T06:00:00+09:00',
  period_end: '2026-08-19T06:00:00+09:00',
  date_key: '2026-08-18',
  daily_limit_seconds: 28800,
  total_seconds: 15552,
  remaining_seconds: 13248,
  over_seconds: 0,
  member_count: 2,
  members: [
    { profile_id: 'minji', cumulative_seconds: 11552, last_collected_at: minutesAgo(2), permission_state: 'granted' },
    { profile_id: 'me', cumulative_seconds: 4000, last_collected_at: minutesAgo(1), permission_state: 'granted' },
  ],
  ...patch,
});

const options = { permission: true, myProfileId: 'me', now: NOW };

describe('groupAccent', () => {
  it('서버의 color-NN을 디자인의 세 강조색으로 옮긴다', () => {
    expect(groupAccent({ id: 'x', color_key: 'color-02' })).toBe('cyan');
    expect(groupAccent({ id: 'x', color_key: 'color-03' })).toBe('pink');
  });

  it('예전 그룹은 전부 color-01이라 id로 흩는다 — 그리드가 한 색으로 도장 찍히면 안 된다', () => {
    const keys = ['aa', 'bb', 'cc', 'dd', 'ee', 'ff', 'gg'].map((id) =>
      groupAccent({ id, color_key: 'color-99' })
    );
    expect(new Set(keys).size).toBeGreaterThan(1);
  });
});

describe('buildPoolView', () => {
  it('아직 못 읽었으면 null이다 — 0으로 그리면 "아무도 안 썼다"와 구분되지 않는다', () => {
    expect(buildPoolView(group(), undefined, members, options)).toBeNull();
  });

  it('큰 숫자는 잔여시간이다', () => {
    const view = buildPoolView(group(), usage(), members, options)!;
    expect(view.headline).toBe('3h 40m');
    expect(view.percentLabel).toBe('54% USED');
    expect(view.state).toBe('normal');
  });

  it('초과하면 큰 숫자가 초과분으로 바뀐다', () => {
    const view = buildPoolView(
      group(),
      usage({ total_seconds: 31320, remaining_seconds: 0, over_seconds: 2520 }),
      members,
      options
    )!;
    expect(view.headline).toBe('42m over');
    expect(view.state).toBe('over');
    // 게이지는 한 바퀴에서 멈춘다. 초과분은 바깥 아크가 진다.
    expect(view.progress).toBe(1);
  });

  it('권한이 없으면 다른 판단보다 먼저다', () => {
    const view = buildPoolView(group(), usage(), members, { ...options, permission: false })!;
    expect(view.state).toBe('permissionOff');
    expect(view.percentLabel).toBe('NO DATA');
  });

  it('늦은 멤버가 있으면 퍼센트에 ~가 붙고 그 사람이 따로 잡힌다', () => {
    const view = buildPoolView(
      group(),
      usage({
        members: [
          { profile_id: 'minji', cumulative_seconds: 11552, last_collected_at: minutesAgo(38), permission_state: 'granted' },
          { profile_id: 'me', cumulative_seconds: 4000, last_collected_at: minutesAgo(1), permission_state: 'granted' },
        ],
      }),
      members,
      options
    )!;

    expect(view.stale).toBe(true);
    expect(view.percentLabel).toBe('~54% USED');
    expect(view.staleMembers.map((m) => m.name)).toEqual(['민지']);
  });

  it('내 자리가 12시에 온다', () => {
    const view = buildPoolView(group(), usage(), members, options)!;
    expect(view.seats[0].id).toBe('me');
    expect(view.seats[0].ring).toBe('activity');
  });

  it('한 번도 안 올린 사람은 빈 자리다', () => {
    const view = buildPoolView(
      group(),
      usage({
        members: [
          { profile_id: 'me', cumulative_seconds: 4000, last_collected_at: minutesAgo(1), permission_state: 'granted' },
          { profile_id: 'minji', cumulative_seconds: 0, last_collected_at: null, permission_state: null },
        ],
      }),
      members,
      options
    )!;

    expect(view.seats.find((seat) => seat.id === 'minji')?.pending).toBe(true);
    // 안 올린 사람은 "늦은" 것이 아니다.
    expect(view.stale).toBe(false);
  });

  it('랭킹은 덜 쓴 순서다 — 서버는 많이 쓴 사람부터 준다', () => {
    const view = buildPoolView(group(), usage(), members, options)!;
    expect(view.ranking.map((member) => member.name)).toEqual(['정원', '민지']);
  });

  it('푸터는 오늘 가장 많이 쓴 사람 한 줄이다', () => {
    const view = buildPoolView(group(), usage(), members, options)!;
    expect(view.highlight).toEqual({ name: '민지', label: '3h 12m' });
  });

  it('아무도 안 썼으면 강조할 사람이 없다', () => {
    const view = buildPoolView(
      group(),
      usage({
        total_seconds: 0,
        remaining_seconds: 28800,
        members: [
          { profile_id: 'me', cumulative_seconds: 0, last_collected_at: minutesAgo(1), permission_state: 'granted' },
        ],
      }),
      members,
      options
    )!;
    expect(view.highlight).toBeNull();
    expect(view.state).toBe('fresh');
  });

  it('멤버 목록이 아직 안 왔어도 행을 버리지 않는다', () => {
    const view = buildPoolView(group(), usage(), undefined, options)!;
    expect(view.ranking).toHaveLength(2);
  });
});

describe('pickHeroGroup', () => {
  it('시작 전 그룹은 히어로에 올리지 않는다 — 그릴 숫자가 없다', () => {
    const groups = [group({ id: 'draft', status: 'draft' }), group({ id: 'live' })];
    expect(pickHeroGroup(groups)?.id).toBe('live');
  });

  it('사용자가 고른 그룹이 이긴다', () => {
    const groups = [group({ id: 'a' }), group({ id: 'b' })];
    expect(pickHeroGroup(groups, 'b')?.id).toBe('b');
  });

  it('고른 그룹에서 나왔으면 다시 기본으로', () => {
    const groups = [group({ id: 'a' })];
    expect(pickHeroGroup(groups, 'gone')?.id).toBe('a');
  });

  it('그룹이 없으면 null', () => {
    expect(pickHeroGroup([])).toBeNull();
  });
});
