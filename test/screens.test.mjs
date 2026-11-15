// 화면 합치기 테스트 (현황판 24-1). 청약은 대시보드 안 화면(#cheongyak) 하나로, 잠금도 하나로.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const DESIGN_COLORS = ["bg", "card", "sub", "line", "ghost", "ink", "desc", "mute", "lime", "lime2", "good", "lemon", "lemon2", "orange", "orange2", "warn"];

test("메뉴 5번째가 청약이고 같은 페이지 안(#cheongyak)으로 간다", async () => {
  const app = await read("household/app.js");
  const menus = [...app.slice(app.indexOf("const MENUS = ["), app.indexOf("];", app.indexOf("const MENUS = ["))).matchAll(/\['([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(menus, ["홈", "시뮬레이터", "월 결산", "계산 기준", "청약"]);
  assert.match(app, /HREF = \['#home', '#simulator', '#settle', '#basis', '#cheongyak'\]/);
  const page = await read("index.html");
  assert.ok(page.includes('href="#cheongyak"'), "휴대폰 더보기의 청약도 앱 안 화면으로");
  assert.ok(!page.includes('href="cheongyak/"'), "다른 페이지로 넘어가는 링크가 남아 있음");
  assert.ok(!(await read("household/boot.mjs")).includes("addCheongyakMenu"), "임시 메뉴 덧붙이기가 남아 있음");
});

test("예전 청약 주소는 새 화면으로 넘긴다", async () => {
  const old = await read("cheongyak/index.html");
  assert.match(old, /location\.replace\("\.\.\/#cheongyak"\)/);
  assert.match(old, /url=\.\.\/#cheongyak/);
});

test("잠금은 하나: 청약 화면에 따로 비밀번호 칸이 없고 대시보드 열쇠를 받는다", async () => {
  const cy = await read("cheongyak/app.mjs");
  const page = await read("index.html");
  assert.match(cy, /export function mount\(priv\)/);
  assert.ok(!/\bunlock\(/.test(cy), "청약 코드가 직접 비밀번호로 열면 안 됨");
  const view = page.slice(page.indexOf('<div id="cy"'), page.indexOf('<nav class="tabbar"'));
  assert.ok(!/type="password"[^>]*비밀번호/.test(view), "청약 화면에 비밀번호 칸이 남아 있음");
  assert.match(await read("household/boot.mjs"), /window\.__HH_PRIV = priv/);
});

test("청약 화면 id는 cy- 로 시작하고 코드가 찾는 id가 모두 있다", async () => {
  const cy = await read("cheongyak/app.mjs");
  const page = await read("index.html");
  const ids = new Set([...cy.matchAll(/\$\("([^"]+)"\)/g)].map((m) => m[1]));
  for (const id of ids) assert.ok(page.includes(`id="cy-${id}"`), `index.html에 cy-${id}가 없음`);
});

test("청약 화면은 Pretendard와 DESIGN.md 색 이름만 쓴다", async () => {
  const page = await read("index.html");
  const css = page.slice(page.indexOf("/* ===== 청약 (#cheongyak"), page.lastIndexOf("</style>"));
  assert.ok(css.length > 1000, "청약 CSS를 찾지 못함");
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(css), "청약 CSS에 고정 색(#...)이 있음");
  for (const [, name] of css.matchAll(/var\(--([\w-]+)\)/g)) assert.ok(DESIGN_COLORS.includes(name), `DESIGN.md에 없는 색 이름: --${name}`);
  assert.ok(!/IBM Plex/.test(page + (await read("cheongyak/index.html"))), "IBM Plex가 남아 있음");
});
