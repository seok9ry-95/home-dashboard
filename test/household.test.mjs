// 가계 화면(현황판 15번) 테스트. 실제 숫자 대신 가짜 가계 데이터를 쓴다.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assemble, fillNames, splitList } from "../scripts/lib/household.mjs";
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

test("할부 목록: 새 할부는 한 줄 추가, 끝난 할부는 null 한 줄 — 다른 할부는 그대로", async () => {
  const keys = await createKeys("test-password-1234", { iter: 1000 });
  const log = emptyLog();
  const put = async (r, at) => log.entries.push(await seal(keys, { ...r, at, by: "test" }));
  const [a, b] = splitList("installments", [{ name: "가전 할부", monthly: 1 }, { name: "가구 할부", monthly: 2 }]);
  await put(a, "2026-11-01T00:00:00Z"); await put(b, "2026-11-01T00:00:01Z");
  for (const r of splitList("fixedEnds", { "가전 할부": "2027-09 마지막" })) await put(r, "2026-11-01T00:00:02Z");
  await put({ key: "hh:installments:휴대폰 할부", type: "hh", data: { name: "휴대폰 할부", monthly: 3 } }, "2026-12-01T00:00:00Z");
  const priv = await unlock(keys, "test-password-1234");
  let D = assemble((await openLog(priv, log)).state);
  assert.deepEqual(D.installments.map((x) => x.name), ["가전 할부", "가구 할부", "휴대폰 할부"]); // 추가해도 사라지지 않음
  assert.deepEqual(D.fixedEnds, { "가전 할부": "2027-09 마지막" });
  await put({ key: "hh:installments:가구 할부", type: "hh", data: null }, "2027-01-01T00:00:00Z");
  D = assemble((await openLog(priv, log)).state);
  assert.deepEqual(D.installments.map((x) => x.name), ["가전 할부", "휴대폰 할부"]); // 끝난 건만 빠짐
});

test("용돈(현황판 20): 달마다 한 줄 hh:pocket:<YYYY-MM> → DATA.pocket[달], 새 달은 지난 달을 건드리지 않음", async () => {
  const keys = await createKeys("test-password-1234", { iter: 1000 });
  const log = emptyLog();
  const oct = { plan: { H: 400000, W: 500000 }, H: [["10.02", "가게A", 7000, "생활", ""]], W: [["10.01", "가게B", 90000, "꾸미기", ""]] };
  log.entries.push(await seal(keys, { key: "hh:pocket:2026-10", type: "hh", data: oct, by: "test" }));
  log.entries.push(await seal(keys, { key: "hh:pocket:2026-11", type: "hh", data: { plan: { H: 400000, W: 500000 }, H: [], W: [] }, by: "test" }));
  const D = assemble((await openLog(await unlock(keys, "test-password-1234"), log)).state);
  assert.deepEqual(Object.keys(D.pocket), ["2026-10", "2026-11"]);
  assert.deepEqual(D.pocket["2026-10"], oct);
  const tot = (rows) => rows.reduce((a, x) => a + x[2], 0);
  assert.equal(tot(D.pocket["2026-10"].W), 90000);
});

test("목록 쪼개기는 이름이 겹치거나 비면 멈춘다(덮어쓰기·누락 방지)", () => {
  assert.throws(() => splitList("installments", [{ name: "A" }, { name: "A" }]), /같은 이름/);
  assert.throws(() => splitList("annual", [["", "H", 1]]), /이름 없는/);
  assert.equal(splitList("annual", [["자동차보험", "H", 1]])[0].key, "hh:annual:자동차보험");
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
