import { describe, expect, it } from 'vitest';

import { permissionCta } from './permission';

describe('permissionCta', () => {
  it('켤 수 없는 상태에는 버튼을 만들지 않는다', () => {
    // 눌러도 아무 일이 없는 버튼은 사용자가 뭘 잘못했다고 읽게 만든다.
    expect(permissionCta('granted', 'ios')).toBeNull();
    expect(permissionCta('restricted', 'ios')).toBeNull();
    expect(permissionCta('unavailable', 'android')).toBeNull();
  });

  it('아직 안 물어봤으면 시스템에 묻는다', () => {
    expect(permissionCta('notDetermined', 'ios')).toEqual({
      label: 'Screen Time 권한 켜기',
      opensSettings: false,
    });
  });

  it('Android에서는 애플 용어를 쓰지 않는다', () => {
    expect(permissionCta('notDetermined', 'android')?.label).toBe('사용 정보 접근 켜기');
  });

  it('iOS는 거절당하면 다시 물을 수 없다 — 설정으로 보낸다', () => {
    expect(permissionCta('denied', 'ios')).toEqual({
      label: '설정에서 켜기',
      opensSettings: true,
    });
  });

  it('Android는 요청 자체가 설정 화면이라 다시 불러도 된다', () => {
    const cta = permissionCta('denied', 'android');
    expect(cta?.label).toBe('설정에서 켜기');
    expect(cta?.opensSettings).toBe(false);
  });
});
