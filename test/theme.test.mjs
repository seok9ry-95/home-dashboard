// 색 이름 + 다크 모드 + 메뉴 줄 테스트 (현황판 24-2).
// 화면 코드는 DESIGN.md 색 이름(var(--이름))만 쓰고, 라이트·다크 값은 index.html의 :root 두 곳에만 둔다.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const NOT_COLORS = new Set(["f", "hatch", "p", "c"]); // 글꼴·빗금 무늬·슬라이더 위치 같은 색 아닌 변수
// 움직임 이름(24-2a)은 DESIGN.md '부드러움' 표에 있는 것만 — test/motion.test.mjs가 값까지 검사
async function motionNames() {
  const md = await read("DESIGN.md");
  const sec = md.slice(md.indexOf("## 부드러움"));
  return new Set([...sec.matchAll(/^\| ((?:dur|ease)-[\w-]+) \|/gm)].map((m) => m[1]));
}

async function design() {
  const md = await read("DESIGN.md");
  const sec = md.slice(md.indexOf("## 색"), md.indexOf("## 글자"));
  const rows = [...sec.matchAll(/^\| ([a-z][\w-]*) \| ([^|]+) \| ([^|]+) \|/gm)].filter((m) => m[1] !== "이름");
  return Object.fromEntries(rows.map((m) => [m[1], { light: m[2].trim(), dark: m[3].trim() }]));
}
function rootVars(css, selector) {
  const i = css.indexOf(selector === ":root" ? ":root{\n  color-scheme:light;" : selector + "{");
  assert.ok(i >= 0, `${selector} 블록이 없음`);
  const body = css.slice(i, css.indexOf("}", i));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
function stripRoots(page) {
  let s = page;
  for (const sel of [":root{\n  color-scheme:light;", ':root[data-theme="dark"]{']) {
    const i = s.indexOf(sel);
    s = s.slice(0, i) + s.slice(s.indexOf("}", i) + 1);
  }
  return s;
}

test("라이트·다크 값이 DESIGN.md 색 표와 똑같다", async () => {
  const D = await design();
  const page = await read("index.html");
  const light = rootVars(page, ":root"), dark = rootVars(page, ':root[data-theme="dark"]');
  for (const [name, v] of Object.entries(D)) {
    if (v.light.startsWith("#")) assert.equal(light[name]?.toUpperCase(), v.light.toUpperCase(), `라이트 --${name}`);
    if (v.dark.startsWith("#")) assert.equal(dark[name]?.toUpperCase(), v.dark.toUpperCase(), `다크 --${name}`);
    assert.ok(name in light && name in dark, `--${name}이 라이트·다크 둘 다 있어야 함`);
  }
  const MOT = await motionNames();
  for (const name of Object.keys(light)) if (!NOT_COLORS.has(name) && !MOT.has(name)) assert.ok(name in D, `DESIGN.md에 없는 색 이름: --${name}`);
});

test("화면 코드에 고정 색이 없고 DESIGN.md 색 이름만 쓴다 (홈·시뮬레이터·월 결산·계산 기준·청약·잠금)", async () => {
  const D = await design(), MOT = await motionNames();
  const files = { "index.html": stripRoots(await read("index.html")), "household/app.js": await read("household/app.js"), "cheongyak/app.mjs": await read("cheongyak/app.mjs") };
  for (const [f, src] of Object.entries(files)) {
    const code = src.replace(/<svg[\s\S]*?<\/svg>/g, "");
    const hex = code.match(/(?:color|background|border|outline|fill|stroke|shadow)[^;"'`{}]*#[0-9a-fA-F]{3,8}\b/);
    assert.ok(!hex, `${f}: 고정 색 ${hex && hex[0]}`);
    const rgba = [...code.matchAll(/rgba?\(([^)]*)\)/g)].filter((m) => !/^0,0,0,/.test(m[1].replace(/\s/g, "")));
    assert.deepEqual(rgba.map((m) => m[0]), [], `${f}: 그림자(검정) 말고 rgba 색이 있음`);
    for (const [, name] of code.matchAll(/var\(--([\w-]+)/g)) if (!NOT_COLORS.has(name) && !MOT.has(name)) assert.ok(name in D, `${f}: DESIGN.md에 없는 이름 --${name}`);
  }
});

test("다크 모드: 그리기 전에 테마를 정하고, 고른 값은 기기에 기억한다", async () => {
  const page = await read("index.html");
  const head = page.slice(0, page.indexOf("<style"));
  assert.match(head, /localStorage\.getItem\(k\)/, "첫 <style>보다 먼저 테마 스크립트가 있어야 함(번쩍임 방지)");
  assert.match(head, /'nest-theme'/);
  assert.match(head, /prefers-color-scheme: dark/);
  assert.match(page, /<button class="thm" id="thm" type="button" aria-label=/);
  const app = await read("household/app.js");
  assert.match(app, /window\.__setTheme\(isDark\(\) \? 'light' : 'dark'\)/);
});

test("메뉴 줄: '○○ 보는 중' 버튼이 없다", async () => {
  const page = await read("index.html"), app = await read("household/app.js");
  assert.ok(!/id="viewer"|class="viewer"/.test(page), "보는 중 버튼이 남아 있음");
  assert.ok(!/renderViewer|nest-viewer|#viewerName/.test(app), "보는 사람 코드가 남아 있음");
});

test("결산 버튼 상태: 결산 전 · 결산 중 · 놓친 달", async () => {
  const app = await read("household/app.js");
  const src = app.slice(app.indexOf("function settleState"), app.indexOf("\n}\n", app.indexOf("function settleState")) + 2);
  const make = (DATA) => new Function("DATA", "p2", `${src}; return settleState;`)(DATA, (n) => String(n).padStart(2, "0"));
  const at = (d) => new Date(d + "T12:00:00");
  const done = make({ settleStart: "2026-10", settlements: { "2026-10": {} } });
  const none = make({ settleStart: "2026-10", settlements: {} });
  assert.equal(done(at("2026-11-16")), "pre", "10월 결산 끝 → 11월 결산 전");
  assert.equal(done(at("2026-11-30")), "now", "11월 말일 → 결산 중");
  assert.equal(none(at("2026-11-02")), "now", "10월 기록 없음 · 11/3까지 → 결산 중");
  assert.equal(none(at("2026-11-04")), "miss", "10월 기록 없음 · 11/4부터 → 놓친 달");
  assert.equal(make({ settleStart: "2026-10", settlements: {} })(at("2026-10-15")), "pre", "결산 시작 전 달은 놓친 달이 아님");
  assert.equal(make({ settleStart: "2026-12", settlements: {} })(at("2027-01-02")), "now", "해가 바뀌어도 지난달(12월)로 판단");
  const page = await read("index.html");
  for (const [st, bg] of [["pre", "lemon"], ["now", "lime"], ["miss", "warn"]]) assert.ok(page.includes(`.btn-dark[data-st="${st}"]{background:var(--${bg})`), `${st} → ${bg}`);
});

test("글자 대비 4.5:1 이상 (라이트·다크)", async () => {
  const page = await read("index.html");
  const L = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const cr = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const pairs = [["ink", "card"], ["desc", "card"], ["mute", "card"], ["good", "card"], ["warn", "card"], ["ink", "sub"], ["desc", "sub"],
    ["on-ink", "ink"], ["on-data", "lime"], ["on-data", "lemon"], ["on-data", "orange"], ["card", "warn"], ["ink", "lime2"], ["ink", "orange2"], ["ink", "lemon2"]];
  for (const sel of [":root", ':root[data-theme="dark"]']) {
    const v = rootVars(page, sel);
    for (const [fg, bg] of pairs) assert.ok(cr(v[fg], v[bg]) >= 4.5, `${sel} ${fg} on ${bg} = ${cr(v[fg], v[bg]).toFixed(2)}`);
  }
});
