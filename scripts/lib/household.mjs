// 가계 화면 데이터 (현황판 15번). 브라우저·Node 공용.
// 잠긴 기록의 hh:* 줄들을 모아 화면이 쓰는 DATA 하나로 합친다.
//   hh:<항목>          → DATA.<항목>            (자산·소득·목표처럼 통째로 바뀌는 것)
//   hh:<항목>:<YYYY-MM> → DATA.<항목>[YYYY-MM]   (detail·fixedList·oneOff·settlements 등 달마다 쌓이는 것)
//   hh:months:<YYYY-MM> → DATA.months 배열의 한 줄 (m 순서로 정렬)
// 월 결산 때 Claude는 바뀐 항목과 새 달 줄만 잠가 추가하면 된다(지난 기록을 열 필요 없음).

export const MONTH = /^\d{4}-\d{2}$/;

export function assemble(state) {
  const D = {};
  const months = [];
  const keys = Object.keys(state).filter((k) => k.startsWith("hh:")).sort();
  for (const k of keys) {
    const [, field, month] = k.split(":");
    const v = state[k].data;
    if (field === "months") { months.push(v); continue; }
    if (month && MONTH.test(month)) { (D[field] ||= {})[month] = v; continue; }
    D[field] = v;
  }
  if (months.length) D.months = months.sort((a, b) => (a.m < b.m ? -1 : a.m > b.m ? 1 : 0));
  return keys.length ? D : null;
}

// 공개 코드의 이름 자리(⟦H⟧ 남편 이름, ⟦W⟧ 아내 이름, ⟦h⟧·⟦w⟧ 동그라미 한 글자)를 채운다
export function fillNames(text, names) {
  const n = names || {};
  return text
    .replaceAll("⟦H⟧", n.H || "남편").replaceAll("⟦W⟧", n.W || "아내")
    .replaceAll("⟦h⟧", n.h || "남").replaceAll("⟦w⟧", n.w || "아");
}
