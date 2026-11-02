// 가계 화면 데이터 (현황판 15번). 브라우저·Node 공용.
// 잠긴 기록의 hh:* 줄들을 모아 화면이 쓰는 DATA 하나로 합친다.
//   hh:<항목>             → DATA.<항목>              (자산·소득·목표처럼 통째로 바뀌는 것)
//   hh:<항목>:<YYYY-MM>    → DATA.<항목>[YYYY-MM]     (detail·fixedList·oneOff·settlements 등 달마다 쌓이는 것)
//   hh:months:<YYYY-MM>    → DATA.months 배열의 한 줄 (m 순서로 정렬)
//   hh:<목록>:<이름>        → 목록의 한 건 (할부·연간 비용·할부 끝나는 달). 새 건은 새 줄, 없앨 땐 data:null
// 월 결산 때 Claude는 바뀐 항목·새 달·새 건만 잠가 추가하면 된다(지난 기록을 열 필요 없음).

export const MONTH = /^\d{4}-\d{2}$/;

// 한 건씩 쪼개 잠그는 목록. id = 그 건의 이름(같은 이름은 같은 건)
export const ITEM_LISTS = {
  installments: { kind: "array", id: (x) => x.name },   // 할부
  annual: { kind: "array", id: (x) => x[0] },            // 연간 정기비용
  fixedEnds: { kind: "map" },                            // 할부·약정 끝나는 달 (이름 → 문구)
};

const at = (r) => r.at || "";

export function assemble(state) {
  const D = {};
  const months = [];
  const items = {};
  const keys = Object.keys(state).filter((k) => k.startsWith("hh:"));
  for (const k of [...keys].sort()) {
    const rest = k.slice(3);
    const i = rest.indexOf(":");
    const field = i < 0 ? rest : rest.slice(0, i);
    const sub = i < 0 ? null : rest.slice(i + 1);
    const r = state[k];
    if (sub !== null && ITEM_LISTS[field]) { (items[field] ||= []).push([sub, r]); continue; }
    if (field === "months") { months.push(r.data); continue; }
    if (sub !== null && MONTH.test(sub)) { (D[field] ||= {})[sub] = r.data; continue; }
    D[field] = r.data;
  }
  if (months.length) D.months = months.sort((a, b) => (a.m < b.m ? -1 : a.m > b.m ? 1 : 0));
  // 목록은 넣은 순서(at)대로. 같은 시각이면 이름 순
  for (const [field, rows] of Object.entries(items)) {
    rows.sort((a, b) => (at(a[1]) < at(b[1]) ? -1 : at(a[1]) > at(b[1]) ? 1 : a[0] < b[0] ? -1 : 1));
    D[field] = ITEM_LISTS[field].kind === "map"
      ? Object.fromEntries(rows.map(([id, r]) => [id, r.data]))
      : rows.map(([, r]) => r.data);
  }
  return keys.length ? D : null;
}

// 목록 하나를 한 건씩 기록으로 쪼갠다. 이름이 겹치거나 비면 멈춘다(덮어쓰기·누락 방지)
export function splitList(field, value, by = "Claude") {
  const def = ITEM_LISTS[field];
  if (!def) throw new Error(`쪼개는 목록이 아닙니다: ${field}`);
  const pairs = def.kind === "map" ? Object.entries(value) : value.map((x) => [def.id(x), x]);
  const seen = new Set();
  for (const [id] of pairs) {
    if (!id || typeof id !== "string") throw new Error(`${field}: 이름 없는 건이 있습니다`);
    if (seen.has(id)) throw new Error(`${field}: 같은 이름이 두 건 있습니다(${id})`);
    seen.add(id);
  }
  return pairs.map(([id, data]) => ({ key: `hh:${field}:${id}`, type: "hh", data, by }));
}

// 공개 코드의 이름 자리(⟦H⟧ 남편 이름, ⟦W⟧ 아내 이름, ⟦h⟧·⟦w⟧ 동그라미 한 글자)를 채운다
export function fillNames(text, names) {
  const n = names || {};
  return text
    .replaceAll("⟦H⟧", n.H || "남편").replaceAll("⟦W⟧", n.W || "아내")
    .replaceAll("⟦h⟧", n.h || "남").replaceAll("⟦w⟧", n.w || "아");
}
