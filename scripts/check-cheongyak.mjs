// 새로 받은 청약 데이터가 저장해도 될 상태인지 검사한다.
// 사용: node scripts/check-cheongyak.mjs <새 파일> [기존 파일]
// 오류가 하나라도 있으면 종료 코드 1 → 워크플로가 저장 단계로 가지 않는다.
import { readFile } from "node:fs/promises";
import { SIDO } from "./lib/cheongyak.mjs";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function checkPayload(next, prev = null, now = new Date()) {
  const errors = [];
  const warnings = [];

  if (next?.schema !== 1) errors.push("schema 값이 1이 아님");
  if (!Array.isArray(next?.items)) {
    errors.push("items 배열 없음");
    return { errors, warnings };
  }
  const age = (now - new Date(next.collected_at)) / 3600000;
  if (!(age >= -0.1 && age < 3)) errors.push(`수집 시각이 이상함: ${next.collected_at}`);

  const items = next.items;
  if (items.length === 0) errors.push("공고가 0건 — 수집이 깨졌을 가능성");
  if ((next.counts?.apt ?? 0) === 0) errors.push("APT 공고가 0건 — 수집이 깨졌을 가능성");
  if (next.counts?.total !== items.length) errors.push("counts.total과 실제 건수가 다름");

  const ids = new Set();
  items.forEach((it, i) => {
    const where = `${i + 1}번째(${it?.name ?? "이름 없음"})`;
    if (!it.id || ids.has(it.id)) errors.push(`${where}: id 없음 또는 중복`);
    ids.add(it.id);
    if (!it.name) errors.push(`${where}: 단지명 없음`);
    if (!SIDO.includes(it.sido)) errors.push(`${where}: 서울·경기가 아님(${it.sido})`);
    if (it.announce_date != null && !ISO.test(it.announce_date)) errors.push(`${where}: 공고일 형식 오류`);
    const r = it.schedule?.receipt;
    if (!r?.start && !r?.end) errors.push(`${where}: 접수일 없음`);
    for (const d of [r?.start, r?.end, it.schedule?.winner_date]) {
      if (d != null && !ISO.test(d)) errors.push(`${where}: 날짜 형식 오류(${d})`);
    }
    if (r?.start && r?.end && r.start > r.end) errors.push(`${where}: 접수 시작이 마감보다 늦음`);
    if (it.price_max_manwon != null && !(it.price_max_manwon > 0)) errors.push(`${where}: 분양가 이상`);
    if (!Array.isArray(it.types)) errors.push(`${where}: types 배열 없음`);
  });

  // 지난번보다 갑자기 크게 줄면 일부만 받은 것으로 보고 막는다
  const prevTotal = prev?.counts?.total ?? 0;
  if (prevTotal >= 10 && items.length < prevTotal * 0.3) {
    errors.push(`건수가 급감: 지난번 ${prevTotal}건 → 이번 ${items.length}건`);
  }

  // 아래는 저장은 하되 확인이 필요한 신호
  const apt = items.filter((i) => i.kind === "apt");
  const noTypes = apt.filter((i) => i.types.length === 0).length;
  if (apt.length && noTypes / apt.length > 0.5) warnings.push(`APT ${apt.length}건 중 ${noTypes}건에 주택형 정보 없음`);
  const noPrice = apt.filter((i) => i.price_max_manwon == null).length;
  if (apt.length && noPrice / apt.length > 0.5) warnings.push(`APT ${apt.length}건 중 ${noPrice}건에 분양가 없음`);

  return { errors, warnings };
}

async function main() {
  const [nextPath, prevPath] = process.argv.slice(2);
  const next = JSON.parse(await readFile(nextPath, "utf8"));
  let prev = null;
  if (prevPath) {
    try { prev = JSON.parse(await readFile(prevPath, "utf8")); } catch { /* 첫 수집 */ }
  }
  const { errors, warnings } = checkPayload(next, prev);
  console.log(`[검사] ${next.items?.length ?? 0}건 · 서울·경기 · 기준일 ${next.base_date}`);
  console.log(`[검사] 종류별: ${JSON.stringify(next.counts)} · 주택형/분양가 있는 공고: ${JSON.stringify(next.coverage)}`);
  warnings.forEach((w) => console.log(`[확인 필요] ${w}`));
  if (errors.length) {
    errors.slice(0, 30).forEach((e) => console.error(`[오류] ${e}`));
    console.error(`[검사 실패] 오류 ${errors.length}건 — 저장하지 않습니다. 기존 데이터는 그대로입니다.`);
    process.exit(1);
  }
  console.log("[검사 통과] 저장합니다.");
}

if (import.meta.url === `file://${process.argv[1]}`) main();
