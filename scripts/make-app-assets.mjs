/**
 * 안드로이드 적응형 앞판과 스플래시 워드마크 생성기.
 *
 * 원본은 `assets/frimit-*.png` 두 장이다. **아이콘은 그대로 쓴다** — 1024
 * 정사각형에 알파가 없고 모서리도 안 깎여 있어서 iOS가 요구하는 그대로다.
 * 손댈 것이 남은 곳은 두 군데뿐이다.
 *
 *   Android 적응형  앞판은 마크만 투명 배경에 놓고, 색은 뒷판이 칠한다.
 *                   66%가 안전 영역이라 마크는 그보다 작아야 잘리지 않는다.
 *   스플래시        가운데 로고 + 배경색이 두 플랫폼 공통이다. 전체 화면
 *                   이미지는 iOS 전용 legacy이고 곧 없어진다(SDK 57 문서).
 *
 * 손으로 하면 다시 뽑을 때마다 조금씩 달라지므로 스크립트로 둔다. 원본을 다시
 * 내보내면 이걸 다시 돌리면 된다.
 *
 * jimp는 `@expo/image-utils`가 이미 끌고 온다(간접 의존이라 직접 넣지 않았다).
 *
 *   node scripts/make-app-assets.mjs
 */
import { createRequire } from 'node:module';

const Jimp = createRequire(import.meta.url)('jimp-compact');

/** 마크(링)가 아이콘 1024px 안에서 그리는 원. 링의 바깥 지름에서 잰 값이다. */
const MARK = { cx: 512, cy: 512, r: 344 };

/** 적응형 아이콘 앞판에서 마크가 차지할 비율. 안전 영역(66%)보다 작게 둔다. */
const MARK_RATIO = 0.62;

const ICON = 1024;

const icon = await Jimp.read('assets/frimit-appicon-1024.png');

// ── Android 적응형 앞판 ────────────────────────────────────────────
//
// 사각형으로 오리면 안 된다. 아이콘의 어두운 배경까지 딸려 와서, 원형 마스크
// 안에 배경보다 밝은 **사각형 모서리**가 뜬다. 마크가 원이므로 원으로 오린다 —
// 링의 아래쪽 절반은 원래 어두운 색이라(게이지의 빈 부분) 밝기로 자르면 그것까지
// 함께 사라진다. 도형으로 잘라야 하는 이유다.
const mark = icon.clone();
mark.scan(0, 0, mark.bitmap.width, mark.bitmap.height, function (x, y, index) {
  const distance = Math.hypot(x + 0.5 - MARK.cx, y + 0.5 - MARK.cy);
  // 가장자리 1.5px은 알파를 눕혀 계단을 없앤다.
  const edge = Math.min(1, Math.max(0, (MARK.r - distance) / 1.5));
  this.bitmap.data[index + 3] = Math.round(this.bitmap.data[index + 3] * edge);
});

const markSize = Math.round(ICON * MARK_RATIO);
const foreground = new Jimp(ICON, ICON, 0x00000000);
foreground.composite(
  mark
    .crop(MARK.cx - MARK.r, MARK.cy - MARK.r, MARK.r * 2, MARK.r * 2)
    .resize(markSize, markSize),
  Math.round((ICON - markSize) / 2),
  Math.round((ICON - markSize) / 2)
);
await foreground.writeAsync('assets/images/android-icon-foreground.png');

// ── 스플래시의 워드마크 ────────────────────────────────────────────
// 글자와 점만 오려 낸다. 배경은 스플래시 설정의 backgroundColor가 칠하므로,
// 잘라 낸 조각의 배경색과 그 값이 같아야 이음매가 안 보인다.
const splash = await Jimp.read('assets/frimit-splash.png');

let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
splash.scan(0, 0, splash.bitmap.width, splash.bitmap.height, function (x, y, index) {
  const [r, g, b] = this.bitmap.data.slice(index, index + 3);
  // 배경(약 #07070A)보다 확실히 밝은 것 = 글자와 점.
  if (r + g + b > 120) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
});

// 글자 주변 여백. 점 둘레의 보라 후광이 잘리지 않을 만큼은 남긴다.
const PAD_X = 40;
const PAD_Y = 34;
const box = {
  x: x0 - PAD_X,
  y: y0 - PAD_Y,
  w: x1 - x0 + 1 + PAD_X * 2,
  h: y1 - y0 + 1 + PAD_Y * 2,
};
const wordmark = splash.clone().crop(box.x, box.y, box.w, box.h);
await wordmark.writeAsync('assets/images/splash-icon.png');

const corner = Jimp.intToRGBA(wordmark.getPixelColor(0, 0));
const hex = (c) => `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

console.log(`적응형 앞판   마크 ${markSize}px / ${ICON}px (원본 ${icon.bitmap.width}px)`);
console.log(`워드마크      ${box.w}×${box.h}, 배경 ${hex(corner)}`);
console.log(`             → imageWidth ${Math.round(box.w / 3)} (3배 화면 기준), backgroundColor ${hex(corner)}`);
