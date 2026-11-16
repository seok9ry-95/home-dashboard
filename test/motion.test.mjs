// 움직임 테스트 (현황판 24-2a). 시간·감속은 DESIGN.md '부드러움' 표의 이름만, 값은 index.html :root 한 곳.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
async function table() {
  const md = await read("DESIGN.md");
  const sec = md.slice(md.indexOf("## 부드러움"));
  return Object.fromEntries([...sec.matchAll(/^\| ((?:dur|ease)-[\w-]+) \| ([^|]+) \|/gm)].map((m) => [m[1], m[2].trim()]));
}

test("DESIGN.md '부드러움' 표와 index.html :root 값이 같다", async () => {
  const T = await table(), page = await read("index.html");
  assert.ok(Object.keys(T).length >= 7, "부드러움 표를 찾지 못함");
  const root = page.slice(page.indexOf(":root{\n  color-scheme:light;"), page.indexOf("}", page.indexOf(":root{\n  color-scheme:light;")));
  for (const [k, v] of Object.entries(T)) assert.match(root, new RegExp(`--${k}:${v.replace(/[().,]/g, "\\$&")};`), `--${k} 값이 DESIGN.md(${v})와 다름`);
  assert.equal(T["dur-slide"], "320ms", "PRD 결정(0.3~0.4초)");
  assert.equal(T["dur-grow"], "320ms");
  assert.equal(T["dur-count"], "600ms");
});

test("화면 코드에 고정 시간이 없다(transition·animation은 var(--dur-*)만)", async () => {
  const page = await read("index.html");
  const css = [...page.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
  for (const m of css.matchAll(/(?:transition|animation)\s*:[^;}]*/g)) {
    if (/^(?:transition|animation)\s*:\s*none/.test(m[0])) continue;
    assert.ok(!/(?:^|[\s,:])\.?\d*\.?\d+m?s\b/.test(m[0].replace(/var\([^)]*\)/g, "")), `고정 시간: ${m[0]}`);
    assert.ok(!/\b(?:ease-out|ease-in|ease|linear)\b/.test(m[0].replace(/var\([^)]*\)/g, "")), `이름 없는 감속: ${m[0]}`);
  }
  const js = await read("household/motion.js");
  assert.ok(!/setTimeout\([^)]*,\s*\d{3,}\s*\)/.test(js), "motion.js에 고정 시간");
  assert.match(js, /getPropertyValue\('--dur-' \+ name\)/, "motion.js는 CSS 이름에서 시간을 읽어야 함");
});

test("'동작 줄이기'를 켜면 모든 --dur-*가 0", async () => {
  const T = await table(), page = await read("index.html");
  const m = page.match(/@media \(prefers-reduced-motion:reduce\)\{:root\{([^}]*)\}\}/);
  assert.ok(m, "동작 줄이기 블록이 없음");
  for (const k of Object.keys(T).filter((k) => k.startsWith("dur-"))) assert.match(m[1], new RegExp(`--${k}:0ms`), `--${k}가 0이 아님`);
});

test("미끄러짐·펼치기·굴러가기·미리 불러오기가 연결돼 있다", async () => {
  const page = await read("index.html"), js = await read("household/motion.js"), app = await read("household/app.js"), cy = await read("cheongyak/app.mjs");
  assert.ok(page.indexOf('src="household/motion.js"') < page.indexOf('src="household/boot.mjs"'), "motion.js는 boot보다 먼저");
  for (const box of ["'.seg'", "'#menu'", "'#tabbar'"]) assert.ok(js.includes(`box: ${box}`), `미끄러짐 대상 ${box}`);
  assert.match(js, /ROLL_SEL = 'main \.kv, main \.eq \.v, main \.gs \.amt'/);
  assert.match(cy, /export function prefetch\(\)/);
  assert.match(cy, /window\.__motion\?\.grow\(/);
  assert.match(app, /m\.prefetch && m\.prefetch\(\)/);
  assert.match(page, /\.cards\{display:grid;[^}]*align-items:start/, "청약 카드 옆 칸 고정");
});
