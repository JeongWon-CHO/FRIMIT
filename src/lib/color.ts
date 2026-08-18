/**
 * 색 문자열 다루기.
 *
 * 디자인 토큰에는 `#7C4DFF`와 `rgba(124,77,255,0.55)`가 섞여 있다(불투명한 표면은
 * hex, 빛으로 쓰는 값은 이미 알파가 붙은 rgba). 블룸과 그라데이션은 그 위에 다시
 * 알파를 곱해야 하므로 두 형식을 모두 받아야 한다.
 */

/** 어떤 형식이든 받아서 알파를 갈아 끼운 rgba로 돌려준다. */
export function hexToRgba(color: string, alpha: number): string {
  const clamped = Math.max(0, Math.min(1, alpha));

  const rgba = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (rgba) {
    const [, r, g, b, a] = rgba;
    // 원본에 알파가 있으면 곱한다 — 토큰의 rgba는 이미 "이만큼 흐린 빛"이라는 뜻이다.
    return `rgba(${r}, ${g}, ${b}, ${clamped * (a === undefined ? 1 : Number(a))})`;
  }

  const hex = color.replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const value = Number.parseInt(full.slice(0, 6), 16);

  if (Number.isNaN(value)) return `rgba(255, 255, 255, ${clamped})`;

  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${clamped})`;
}
