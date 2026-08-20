import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * 한도 알림 발송기.
 *
 * 주기적으로 불려서, 아직 보내지 않은 한도 사건을 집어 Expo 푸시로 보낸다.
 * "누구에게 보낼까"와 "두 번 보내지 않기"는 전부 서버 함수가 정한다
 * (`claim_push_batch`). 이 파일이 정하는 것은 **문장 한 줄**뿐이다.
 *
 * 푸시 문장이 활동 탭 문장과 다른 것은 실수가 아니다. 푸시는 제목과 본문이
 * 나뉘고, 잠금 화면에서 한 줄로 읽히며, 그룹 이름이 먼저 와야 어느 그룹 얘기인지
 * 알 수 있다. 같은 사건이라도 다른 매체에 맞는 다른 글이다.
 *
 * 배포:  supabase functions deploy push-activity --no-verify-jwt
 * 호출:  대시보드 Cron에서 1분마다, 헤더에 x-cron-secret
 *
 * 인증을 Supabase 키가 아니라 **전용 시크릿**으로 받는다. 이 프로젝트는 새 형식
 * 키(sb_secret_…)를 쓰는데 그건 JWT가 아니라서 게이트웨이의 JWT 검사와 맞지 않고,
 * 키 형식이 또 바뀌면 이 파일이 같이 흔들린다. 발송기가 필요로 하는 것은 "예약
 * 작업이 부른 게 맞는가" 하나뿐이므로 그것만 확인한다.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type Claimed = {
  event_id: string;
  kind: 'pool_threshold' | 'pool_over';
  payload: {
    threshold?: number;
    total_seconds?: number;
    limit_seconds?: number;
    over_seconds?: number;
  };
  group_name: string;
  tokens: string[];
};

/** "1시간 30분", "45분". 앱의 `formatDuration`과 같은 규칙이다 — 초는 보여주지 않는다. */
function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);

  if (hours > 0 && minutes > 0) return `${hours}시간 ${minutes}분`;
  if (hours > 0) return `${hours}시간`;
  return `${minutes}분`;
}

/**
 * 잠금 화면에 뜰 한 줄.
 *
 * 100%와 초과는 퍼센트를 말하지 않는다. 숫자보다 "오늘 몫을 다 썼다"가 먼저
 * 읽혀야 하고, 넘긴 뒤에 90%였다는 얘기는 아무 쓸모가 없다.
 */
function body(event: Claimed): string {
  if (event.kind === 'pool_over') {
    return `${formatDuration(event.payload.over_seconds ?? 0)} 넘겼어요`;
  }

  if (event.payload.threshold === 100) return '오늘 몫을 다 썼어요';

  const remaining = (event.payload.limit_seconds ?? 0) - (event.payload.total_seconds ?? 0);
  const used = `우리 시간의 ${event.payload.threshold ?? 0}%를 썼어요`;

  return remaining > 0 ? `${used} · ${formatDuration(remaining)} 남았어요` : used;
}

Deno.serve(async (request) => {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const cronSecret = Deno.env.get('PUSH_CRON_SECRET') ?? '';

  // 발송기는 예약 작업만 부른다. 아무나 부를 수 있으면 남의 그룹 알림을 임의의
  // 시점에 터뜨릴 수 있다. 시크릿이 설정돼 있지 않으면 아예 열지 않는다 —
  // 설정을 깜빡한 상태가 "누구나 통과"로 이어지면 안 된다.
  if (!cronSecret || request.headers.get('x-cron-secret') !== cronSecret) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });
  }

  if (!serviceKey || !url) {
    return new Response(JSON.stringify({ error: 'service key missing' }), { status: 500 });
  }

  const supabase = createClient(url, serviceKey);

  const { data, error } = await supabase.rpc('claim_push_batch', { max_events: 50 });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const claimed = ((data ?? []) as Claimed[]).filter((event) => event.tokens.length > 0);
  if (claimed.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const messages = claimed.map((event) => ({
    to: event.tokens,
    title: event.group_name,
    body: body(event),
    // 소리 없이. 스크린타임을 줄이자는 앱이 소리로 사람을 부르지는 않는다.
    sound: null,
    priority: 'normal',
    channelId: 'default',
    data: { eventId: event.event_id, kind: event.kind },
  }));

  let tickets: { status: string; details?: { error?: string } }[] = [];

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });

    if (!response.ok) throw new Error(`expo ${response.status}`);
    tickets = (await response.json()).data ?? [];
  } catch (cause) {
    // 집어 둔 사건을 대기로 되돌린다. 되돌리지 않으면 Expo가 잠깐 흔들렸다는
    // 이유로 그날의 한도 알림이 조용히 사라진다.
    await supabase.rpc('release_push_batch', {
      event_ids: claimed.map((event) => event.event_id),
    });

    return new Response(JSON.stringify({ error: String(cause), released: claimed.length }), {
      status: 502,
    });
  }

  /*
   * 죽은 토큰 정리.
   *
   * 앱을 지웠거나 알림을 끈 기기는 `DeviceNotRegistered`로 돌아온다. 그대로 두면
   * 매번 같은 실패를 보낸다. 기기 행은 사용량 집계에 필요하므로 지우지 않고
   * 토큰만 비운다.
   *
   * 티켓은 보낸 순서대로 온다. 수가 어긋나면 짝이 틀어진 것이므로 정리를 건너뛴다 —
   * 엉뚱한 사람의 토큰을 지우는 것이 죽은 토큰을 하루 더 두는 것보다 나쁘다.
   */
  const sentTokens = claimed.flatMap((event) => event.tokens);

  if (tickets.length === sentTokens.length) {
    const dead = sentTokens.filter(
      (_, index) => tickets[index]?.details?.error === 'DeviceNotRegistered'
    );

    for (const token of dead) {
      await supabase.rpc('forget_push_token', { bad_token: token });
    }
  }

  return new Response(
    JSON.stringify({
      events: claimed.length,
      recipients: sentTokens.length,
      failed: tickets.filter((ticket) => ticket.status !== 'ok').length,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
