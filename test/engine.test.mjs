// 계산 엔진·화면 공통 숫자 테스트 (11/11 숫자 통일 · 계산 기준 10-3)
// 공개 저장소라 실제 소득·자산 대신 가상의 숫자를 쓴다. 실제 기준값 대조는 Claude가 저장소 밖에서 한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SRC = readFileSync(new URL("../household/app.js", import.meta.url), "utf8");
const engine = () => {
  const code = SRC.slice(SRC.indexOf("const RULES"), SRC.indexOf("// ===== 파생 값"));
  return new Function(code + "\nreturn { RULES, ASSUME, BASIS, loan, affordable, PMT, PV, R2, e2, priceGap, needOf, pctOf };")();
};

test("계산 기준 10-3: 주담대 금리 4.88%, 버전 이력 맨 위, 월 상환 중간 금리도 같은 값", () => {
  const E = engine();
  assert.equal(E.ASSUME.rate, 0.0488);
  assert.equal(E.BASIS.history[0].v, "2026.10-3");
  assert.equal(E.BASIS.history[1].v, "2026.10-2");
  assert.match(SRC, /mort: \[\.039, ASSUME\.rate, \.0564\]/);
});

test("대출 = min(LTV, 금액 상한, 상환능력) · 독립 계산과 같음 (가상 부부)", () => {
  const E = engine(), inc = { H: 6000, W: 4000 }, s = { price: 80000, region: "서울", type: "생애최초", incomeBasis: "합산" };
  const r = (0.0488 + 0.03) / 12, n = 360, pay = (10000 * 0.4) / 12;
  const repay = pay * (1 - Math.pow(1 + r, -n)) / r;
  const L = E.loan(s, inc);
  assert.ok(Math.abs(L.amount - Math.min(80000 * 0.7, 60000, repay)) < 1e-6);
  assert.equal(L.reason, "소득(DSR)");
  assert.ok(Math.abs(L.cash - (80000 * 1.04 - L.amount)) < 1e-6);
  // 살 수 있는 집값에서 필요 현금 = 목표일 자산
  const fut = 26000, b = E.affordable(s, inc, fut);
  assert.ok(Math.abs(E.loan({ ...s, price: b }, inc).cash - fut) < 0.01);
});

test("격차는 보이는 값끼리 뺀 값 (목표 − 7.16억 = 0.84억)", () => {
  const E = engine();
  for (let buy = 60000; buy < 80000; buy += 7.3) {
    const shown = Number(E.e2(buy).replace("억", "")), gap = Number(E.e2(E.priceGap(buy, 80000)).replace("억", ""));
    assert.equal(Math.round((8 - shown) * 100), Math.round(gap * 100), `buy=${buy}`);
  }
  assert.equal(E.priceGap(82000, 80000), 0);
});

test("월 필요 저축은 반올림, 진행률은 내림(못 미치면 최대 99%)", () => {
  const E = engine();
  assert.equal(E.needOf(13447, 0, 15), 896);
  assert.equal(E.needOf(100, 500, 15), 0);
  assert.equal(E.pctOf(79990, 80000), 99);
  assert.equal(E.pctOf(70640, 80000), 88);
  assert.equal(E.pctOf(80000, 80000), 100);
});
