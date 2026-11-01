// 청약 유형 판정 테스트 (현황판 16번). 기준값: 고덕강일3단지 전략 문서 결론.
// 공개 저장소이므로 실제 개인 정보 대신, 판정에 영향을 주는 조건만 같게 맞춘 가상 인물을 쓴다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ageOn, monthsBetween, judgeNotice, applyOverrides, displaySchedule, privateScore,
} from "../scripts/lib/judge.mjs";

const rules = JSON.parse(await readFile(new URL("../data/cheongyak-rules.json", import.meta.url)));
const overrides = JSON.parse(await readFile(new URL("../data/cheongyak-overrides.json", import.meta.url)));

// A: 세대주, 서울 2년 이상 / B: 같은 집 세대원, 서울 2년 미만. 둘 다 30대 무주택·통장 24회 이상·미혼
const A = {
  key: "a", label: "A", birth: "1994-06-15", householder: true, homeless: true, ever_owned: false,
  residence: { sido: "서울", since: "2023-05-01" }, account: { payments: 30 },
  won_5y: false, income_tax_years: null, youth_income_ok: true, youth_assets_ok: true, dependents: 0,
};
const B = { ...A, key: "b", label: "B", birth: "1996-02-10", householder: false, residence: { sido: "서울", since: "2025-03-01" } };
const before = { married: false, engaged: true, children_under2: 0, pregnant: false, minor_children: 0, parent65_3y: false };
const after = { ...before, married: true, married_since: "2026-11-15", engaged: false };

// 고덕강일3단지: 청약홈 데이터 그대로(2026-11-01 수집분에서 판정에 쓰는 칸만)
const gdk3 = {
  id: "apt-2026000373-2026000373", kind: "apt", house_detail: "국민", sale_type: "분양주택",
  name: "고덕강일지구 3단지 토지임대부(본청약)", sido: "서울", announce_date: "2026-10-16",
  schedule: {
    receipt: { start: "2026-10-26", end: "2026-11-06" }, special: null,
    rank1: { start: "2026-10-26", end: "2026-11-05" }, rank2: { start: "2026-11-06", end: "2026-11-06" },
    general: null, winner_date: "2026-11-26",
  },
  flags: { 투기과열: true, 조정대상: true, 분양가상한제: true, 공공주택지구: true, 대규모택지: true },
  types: [
    { type: "059.0000G", general_households: 25, special_households: 95, price_top_manwon: 37912,
      special_by_kind: { 청년: 30, 신혼부부: 30, 생애최초: 25, 신생아: 10 } },
  ],
};

const labels = (r, key) => r.people.find((p) => p.key === key).options.filter((o) => o.ok !== false).map((o) => o.label);
const pick = (r, key) => r.people.find((p) => p.key === key).pick.label;

test("만 나이와 개월 수", () => {
  assert.equal(ageOn("1995-04-08", "2026-04-07"), 30);
  assert.equal(ageOn("1995-04-08", "2026-04-08"), 31);
  assert.equal(monthsBetween("2024-10-16", "2026-10-16"), 24);
  assert.equal(monthsBetween("2024-10-17", "2026-10-16"), 23);
});

test("기준값: 고덕강일3단지 혼인신고 전 — A는 청년 특공 + 일반 1순위(해당지역), B는 청년 특공 + 일반 2순위", () => {
  const r = judgeNotice(gdk3, [A, B], before, rules);
  assert.ok(labels(r, "a").includes("청년 특공"));
  assert.ok(labels(r, "a").includes("일반 1순위(해당지역)"));
  assert.ok(labels(r, "b").includes("청년 특공"));
  assert.ok(labels(r, "b").includes("일반 2순위"));
  assert.ok(!labels(r, "b").some((l) => l.startsWith("일반 1순위")), "세대원은 투기과열 공공 1순위 불가");
  // 공공 생애최초는 혼인 또는 자녀가 있어야 함
  assert.ok(!labels(r, "a").includes("생애최초 특공"));
  assert.equal(pick(r, "a"), "일반 1순위(해당지역)");
  assert.equal(pick(r, "b"), "청년 특공");
});

test("혼인신고 후 비교 — 청년 특공은 빠지고 신혼부부·한 세대 1명 안내가 붙는다", () => {
  const r = judgeNotice(gdk3, [A, B], after, rules);
  assert.ok(!labels(r, "a").includes("청년 특공"));
  assert.ok(labels(r, "a").includes("신혼부부 특공"));
  assert.ok(r.notes.some((n) => n.includes("1명만")));
});

test("D22: 보정이 없으면 공공분양 특공·1순위 날짜를 단정하지 않는다", () => {
  const s = displaySchedule(gdk3);
  assert.equal(s.find((x) => x.key === "special").certain, false);
  assert.equal(s.find((x) => x.key === "receipt").certain, false);
  assert.ok(!s.some((x) => x.key === "rank1"));
});

test("D22: 보정 파일이 있으면 공고문 날짜로 덮어쓴다", () => {
  const s = displaySchedule(applyOverrides(gdk3, overrides));
  assert.deepEqual(s.find((x) => x.key === "special"), { key: "special", label: "특공", start: "2026-11-02", end: "2026-11-03", certain: true });
  assert.equal(s.find((x) => x.key === "rank1").start, "2026-11-04");
  assert.equal(s.find((x) => x.key === "rank2").start, "2026-11-06");
});

test("경기 비규제 민영: 세대원도 1순위, 예치금은 확인 필요로 표시", () => {
  const item = {
    id: "apt-x", kind: "apt", house_detail: "민영", sido: "경기", announce_date: "2026-10-30",
    schedule: { special: { start: "2026-11-09", end: "2026-11-09" }, rank1: { start: "2026-11-10", end: "2026-11-10" } },
    flags: { 투기과열: false, 조정대상: false },
    types: [{ type: "059.9000A", special_by_kind: { 신혼부부: 10, 생애최초: 8 }, price_top_manwon: 60000 }],
  };
  const r = judgeNotice(item, [A, B], before, rules);
  const b1 = r.people.find((p) => p.key === "b").options.find((o) => o.key === "rank1");
  assert.equal(b1.label, "일반 1순위(기타지역)");
  assert.equal(b1.ok, "check");
  assert.match(b1.why, /예치금 200만원/);
  assert.ok(r.people[0].score, "민영은 가점을 계산");
});

test("민영 가점: 30세 미만 미혼은 무주택 0점, 부양가족 0명 5점", () => {
  const s = privateScore({ birth: "1998-01-01", dependents: 0, account: { since: "2020-01-01" } }, { married: false }, rules, "2026-11-01");
  assert.equal(s.homeless, 0);
  assert.equal(s.dependents, 5);
  assert.equal(s.account, 8); // 6년 10개월 → 6~7년 구간
  assert.equal(s.total, 13);
});
