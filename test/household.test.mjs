// 가계 화면(현황판 15번) 테스트. 실제 숫자 대신 가짜 가계 데이터를 쓴다.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assemble, fillNames } from "../scripts/lib/household.mjs";
import { createKeys, seal, unlock, openLog, emptyLog } from "../scripts/lib/vault.mjs";

const FAKE = [
  { key: "hh:names", type: "hh", data: { H: "가나", W: "다라", h: "가", w: "라" } },
  { key: "hh:asOf", type: "hh", data: "2026-10-31" },
  { key: "hh:income", type: "hh", data: { H: 50000000, W: 40000000 } },
  { key: "hh:months:2026-08", type: "hh", data: { m: "2026-08", incH: 2 } },
  { key: "hh:months:2026-07", type: "hh", data: { m: "2026-07", incH: 1 } },
  { key: "hh:detail:2026-07", type: "hh", data: { etc: [] } },
  { key: "hh:settlements:2026-10", type: "hh", data: { asOf: "2026-10-31" } },
];

test("잠근 hh 기록을 열면 화면 데이터로 다시 합쳐진다", async () => {
  const keys = await createKeys("test-password-1234", { iter: 1000 });
  const log = emptyLog();
  for (const r of FAKE) log.entries.push(await seal(keys, { ...r, by: "test" }));
  const { state } = await openLog(await unlock(keys, "test-password-1234"), log);
  const D = assemble(state);
  assert.deepEqual(D.months.map((r) => r.m), ["2026-07", "2026-08"]); // 달 순서 정렬
  assert.deepEqual(D.income, { H: 50000000, W: 40000000 });
  assert.deepEqual(Object.keys(D.detail), ["2026-07"]);
  assert.equal(D.settlements["2026-10"].asOf, "2026-10-31");
});

test("새 달 결산은 지난 기록을 몰라도 줄만 추가하면 반영된다(같은 key는 최신 줄)", async () => {
  const st = Object.fromEntries(FAKE.map((r, i) => [r.key, { ...r, at: `2026-11-01T00:00:0${i}Z` }]));
  st["hh:asOf"] = { key: "hh:asOf", data: "2026-11-30" };
  st["hh:months:2026-11"] = { key: "hh:months:2026-11", data: { m: "2026-11", incH: 3 } };
  const D = assemble(st);
  assert.equal(D.asOf, "2026-11-30");
  assert.equal(D.months.at(-1).m, "2026-11");
  assert.equal(D.months.length, 3);
});

test("청약 등 다른 기록만 있으면 가계 데이터는 없음", () => {
  assert.equal(assemble({ profile: { key: "profile", data: {} } }), null);
});

test("이름 자리 채우기", () => {
  assert.equal(fillNames("⟦H⟧ · ⟦W⟧ / ⟦h⟧⟦w⟧", { H: "가나", W: "다라", h: "가", w: "라" }), "가나 · 다라 / 가라");
  assert.equal(fillNames("⟦H⟧", null), "남편");
});

test("공개 파일에 가계 데이터가 들어 있지 않다", async () => {
  const page = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../household/app.js", import.meta.url), "utf8");
  assert.ok(app.includes("const DATA = window.__HH;"), "DATA는 잠금을 푼 뒤에만 채워져야 함");
  for (const [name, text] of [["index.html", page], ["household/app.js", app]]) {
    assert.ok(!/const DATA\s*=\s*\{/.test(text), `${name}: 데이터 덩어리가 남아 있음`);
    assert.ok(!/names:\s*\{\s*H:\s*'/.test(text), `${name}: 실명이 남아 있음`);
    assert.ok(!/income:\s*\{\s*H:\s*\d/.test(text), `${name}: 소득 데이터가 남아 있음`);
  }
  assert.ok(page.includes('class="hh-locked"'), "잠금 전에는 본문이 숨겨져야 함");
});
