// 청약 유형 판정 (현황판 16번). 브라우저와 Node 양쪽에서 쓰도록 바깥 모듈을 가져오지 않는다.
// 숫자·기준은 data/cheongyak-rules.json(규칙표)에 두고, 여기는 순서와 조건만 둔다.
// 판정은 보조이고 최종 확인은 공고문 원문이다.

const CHECK = "check"; // 확인 필요(자격이 있을 수 있으나 공고문·서류로 확인)

const dateOf = (s) => (s ? new Date(`${s.length === 7 ? `${s}-01` : s}T00:00:00Z`) : null);

// 만 나이(기준일 당일 생일이면 한 살 더)
export function ageOn(birth, on) {
  const b = dateOf(birth), d = dateOf(on);
  if (!b || !d) return null;
  let age = d.getUTCFullYear() - b.getUTCFullYear();
  const md = (d.getUTCMonth() - b.getUTCMonth()) * 100 + (d.getUTCDate() - b.getUTCDate());
  if (md < 0) age -= 1;
  return age;
}

// 시작일부터 기준일까지 꽉 찬 개월 수
export function monthsBetween(from, to) {
  const a = dateOf(from), b = dateOf(to);
  if (!a || !b) return null;
  let m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) m -= 1;
  return Math.max(0, m);
}

// [[상한, 값], ...] 표에서 x 이하(또는 미만) 첫 칸
const pickBand = (bands, x, strict = false) => {
  for (const [limit, v] of bands) if (strict ? x < limit : x <= limit) return v;
  return bands.at(-1)[1];
};

export const sectorOf = (item) => (item.house_detail === "민영" ? "private" : "public");
export const regulationOf = (item) =>
  item.flags?.투기과열 ? "speculation" : item.flags?.조정대상 ? "adjust" : "unregulated";

// 주택형 "059.0000A" → 전용 59
export const exclusiveM2 = (t) => {
  const n = parseFloat(String(t?.type ?? ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

// 이 공고에 실제로 물량이 있는 특공 종류
export function specialKinds(item) {
  const kinds = new Set();
  for (const t of item.types ?? []) {
    for (const [k, v] of Object.entries(t.special_by_kind ?? {})) if (v > 0) kinds.add(k);
  }
  return kinds;
}

// D22: 공공분양은 청약홈 데이터에 특공 일정이 없고 1순위가 접수 기간 전체로 들어온다.
// 넣을 단지만 보정 파일(data/cheongyak-overrides.json)로 정확한 날짜를 덮어쓴다.
export function applyOverrides(item, overrides) {
  const ov = overrides?.items?.[item.id];
  if (!ov) return item;
  return {
    ...item,
    schedule: { ...item.schedule, ...ov.schedule },
    schedule_override: { checked: ov.checked, source: ov.source },
  };
}

// 화면에 보여줄 일정. certain=false면 '공고문 확인'으로 표시한다.
export function displaySchedule(item) {
  const s = item.schedule ?? {};
  const fixed = Boolean(item.schedule_override);
  const out = [];
  const add = (key, label, r, certain = true) => r?.start && out.push({ key, label, start: r.start, end: r.end ?? r.start, certain });
  if (item.kind !== "apt") {
    add("receipt", "접수", s.receipt ?? s.general ?? s.special);
  } else if (sectorOf(item) === "public" && !s.special && !fixed) {
    out.push({ key: "special", label: "특공", start: null, end: null, certain: false });
    add("receipt", "접수 기간", s.receipt ?? s.rank1, false);
  } else {
    add("special", "특공", s.special);
    add("rank1", "1순위", s.rank1);
    add("rank2", "2순위", s.rank2);
  }
  if (s.winner_date) out.push({ key: "winner", label: "발표", start: s.winner_date, end: s.winner_date, certain: true });
  return out;
}

const opt = (key, label, ok, why) => ({ key, label, ok, why });

function generalOption(item, p, hh, rules, on) {
  const sector = sectorOf(item);
  const reg = regulationOf(item);
  const cfg = reg === "unregulated" ? rules.rank1.metro_unregulated : rules.rank1.regulated;
  const lacks = [];
  const checks = [];
  const months = p.account?.since ? monthsBetween(p.account.since, on) : null;
  const payments = p.account?.payments ?? null;
  if (months != null ? months < cfg.account_months : payments == null || payments < cfg.account_months)
    lacks.push(`통장 가입 ${cfg.account_months}개월 미만`);
  if (sector === "public") {
    if (payments == null || payments < cfg.payments_public) lacks.push(`납입 ${cfg.payments_public}회 미만`);
    if (!p.homeless) lacks.push("무주택 세대 아님");
  }
  if (cfg.householder_only && !p.householder) lacks.push(`세대주가 아님(${reg === "speculation" ? "투기과열" : "규제지역"})`);
  if (sector === "private") {
    if (cfg.no_win_5y_private && p.won_5y) lacks.push("5년 내 당첨 이력");
    const m2 = Math.min(...(item.types ?? []).map(exclusiveM2).filter(Boolean));
    const table = rules.deposit_manwon[item.sido] ?? rules.deposit_manwon["경기"];
    const need = Number.isFinite(m2) ? pickBand(table, m2) : null;
    if (need != null) {
      if (p.account?.balance_manwon == null) checks.push(`예치금 ${need}만원 이상인지`);
      else if (p.account.balance_manwon < need) lacks.push(`예치금 ${need}만원 미만`);
    }
  }
  if (lacks.length) return opt("rank2", "일반 2순위", true, `1순위 조건 미달: ${lacks.join(", ")}`);
  // 해당지역: 같은 시·도 + 거주기간
  const need = rules.rank1.local_priority_years[item.sido] ?? 0;
  const lived = p.residence?.sido === item.sido ? monthsBetween(p.residence.since, on) : null;
  const local = lived != null && lived >= need * 12;
  const where = local ? "해당지역" : "기타지역";
  const why = local
    ? `${item.sido} ${need}년 이상 거주`
    : p.residence?.sido === item.sido
      ? `${item.sido} 거주 ${need}년 미만`
      : `${item.sido} 거주 아님`;
  return opt("rank1", `일반 1순위(${where})`, checks.length ? CHECK : true, checks.length ? `${why} · 확인: ${checks.join(", ")}` : why);
}

function specialOptions(item, p, hh, rules, on) {
  const sector = sectorOf(item);
  const kinds = specialKinds(item);
  const R = rules.special;
  const out = [];
  const age = ageOn(p.birth, on);
  const has = (k) => kinds.has(k) && R[k].sectors.includes(sector);

  if (has("청년")) {
    const lacks = [];
    if (age == null || age < R.청년.age_min || age > R.청년.age_max) lacks.push(`만 ${R.청년.age_min}~${R.청년.age_max}세 아님`);
    if (hh.married) lacks.push("혼인 중(미혼만)");
    if (!p.homeless) lacks.push("무주택 아님");
    const unknown = R.청년.needs.filter((k) => p[k] == null);
    const failed = R.청년.needs.filter((k) => p[k] === false);
    if (failed.length) lacks.push("소득·자산 기준 초과");
    out.push(lacks.length
      ? opt("youth", "청년 특공", false, lacks.join(", "))
      : opt("youth", "청년 특공", unknown.length ? CHECK : true, unknown.length ? "소득·자산 기준 확인" : `만 ${age}세 미혼 무주택`));
  }
  if (has("신혼부부")) {
    if (hh.married) {
      const years = hh.married_since ? monthsBetween(hh.married_since, on) / 12 : 0;
      out.push(years <= R.신혼부부.married_years_max
        ? opt("newlywed", "신혼부부 특공", CHECK, `혼인 ${R.신혼부부.married_years_max}년 이내 · ${R.신혼부부.income_note}`)
        : opt("newlywed", "신혼부부 특공", false, `혼인 ${R.신혼부부.married_years_max}년 초과`));
    } else if (hh.engaged && R.신혼부부.engaged_ok) {
      out.push(opt("newlywed", "신혼부부 특공(예비)", CHECK, R.신혼부부.engaged_note));
    } else out.push(opt("newlywed", "신혼부부 특공", false, "혼인·예비신혼 아님"));
  }
  if (has("생애최초")) {
    const lacks = [];
    if (p.ever_owned) lacks.push("주택 소유 이력");
    if (p.income_tax_years != null && p.income_tax_years < R.생애최초.income_tax_years) lacks.push(`소득세 ${R.생애최초.income_tax_years}년 미만`);
    const single = !hh.married && !(hh.minor_children > 0);
    if (single && sector === "public" && R.생애최초.needs_married_or_child_public) lacks.push("공공은 혼인 또는 자녀 필요");
    if (lacks.length) out.push(opt("first", "생애최초 특공", false, lacks.join(", ")));
    else {
      const notes = [];
      if (single) notes.push(`미혼은 전용 ${R.생애최초.single_ok_private_max_m2}㎡ 이하 추첨 물량만`);
      if (p.income_tax_years == null) notes.push(`소득세 ${R.생애최초.income_tax_years}년 납부 확인`);
      out.push(opt("first", "생애최초 특공", notes.length ? CHECK : true, notes.join(" · ") || "평생 무주택, 혼인 중"));
    }
  }
  if (has("신생아")) {
    const ok = hh.children_under2 > 0 || hh.pregnant;
    out.push(opt("newborn", "신생아 특공", ok, ok ? "2세 미만 자녀·임신" : "2세 미만 자녀·임신 없음"));
  }
  if (has("다자녀")) {
    const ok = (hh.minor_children ?? 0) >= R.다자녀.minor_children_min;
    out.push(opt("multi", "다자녀 특공", ok, ok ? `미성년 자녀 ${hh.minor_children}명` : `미성년 자녀 ${R.다자녀.minor_children_min}명 미만`));
  }
  if (has("노부모부양")) {
    const ok = Boolean(hh.parent65_3y && p.householder);
    out.push(opt("parent", "노부모부양 특공", ok, ok ? "65세 이상 부모 3년 부양 · 세대주" : "65세 이상 부모 3년 부양·세대주 아님"));
  }
  return out;
}

// 민영 가점(84점 만점). 모르는 항목은 missing에 적는다.
export function privateScore(p, hh, rules, on) {
  const T = rules.score_table;
  const age = ageOn(p.birth, on);
  const missing = [];
  let homeless = 0;
  if (age != null && (age >= T.homeless_start_age || hh.married)) {
    const thirty = p.birth ? `${Number(p.birth.slice(0, 4)) + T.homeless_start_age}${p.birth.slice(4)}` : null;
    const starts = [thirty, hh.married ? hh.married_since : null].filter(Boolean).sort();
    const from = age >= T.homeless_start_age ? starts[0] : hh.married_since;
    const years = from ? monthsBetween(from, on) / 12 : 0;
    homeless = pickBand(T.homeless_points, years, true);
  }
  const dependents = T.dependents_points[Math.min(p.dependents ?? 0, 6)];
  let account = null;
  if (p.account?.since) account = pickBand(T.account_points_months, monthsBetween(p.account.since, on), true);
  else missing.push("통장 가입일");
  return { total: homeless + dependents + (account ?? 0), homeless, dependents, account, missing };
}

// 공고 하나 × 부부. 결과: 사람별 넣을 수 있는 유형, 점수, 추천 1개와 이유
export function judgeNotice(item, people, household, rules) {
  const on = item.announce_date ?? new Date().toISOString().slice(0, 10);
  const sector = sectorOf(item);
  const notes = [];
  if (sector === "public" && household.married) notes.push(rules.public_one_per_household);
  if (sector === "public" && !household.married && household.engaged) notes.push("예비신혼부부로 넣으면 1명만 신청 가능 — 각자 넣을지 먼저 정하기");

  const result = people.map((p) => {
    let options;
    if (item.kind !== "apt") {
      const near = p.homeless && p.residence?.sido === item.sido;
      options = [opt("other", item.kind === "remndr" ? "무순위" : "임의공급", near ? CHECK : false,
        near ? `${item.sido} 거주 무주택 · 공고문 자격 확인` : `${item.sido} 거주 아님`)];
    } else {
      options = [...specialOptions(item, p, household, rules, on), generalOption(item, p, household, rules, on)];
    }
    const score = item.kind === "apt" && sector === "private" ? privateScore(p, household, rules, on) : null;
    return { key: p.key, label: p.label, options, score, pick: pickOne(item, options, score, rules) };
  });
  return { on, sector, regulation: regulationOf(item), notes, people: result };
}

// 추천 1개. 강한 특공(신생아·다자녀·노부모) → 공공 1순위 해당지역 → 청년·신혼·생애최초 → 일반
function pickOne(item, options, score, rules) {
  const ok = (k) => options.find((o) => o.key === k && o.ok === true);
  const maybe = (k) => options.find((o) => o.key === k && o.ok !== false);
  const sector = sectorOf(item);
  for (const k of ["newborn", "multi", "parent"]) if (ok(k)) return { label: ok(k).label, why: "물량 대비 자격자가 적은 특공" };
  const r1 = ok("rank1") ?? (options.find((o) => o.key === "rank1" && o.ok === CHECK));
  if (sector === "public") {
    if (r1 && r1.label.includes("해당지역")) return { label: r1.label, why: "세대주·해당지역 1순위는 공공 일반공급의 본선(저축액 순)" };
    for (const k of ["youth", "newlywed", "first"]) if (maybe(k)) return { label: maybe(k).label, why: "일반 1순위 해당지역이 아니라 특공이 더 나은 표" };
    if (r1) return { label: r1.label, why: "기타지역 1순위" };
    if (maybe("rank2")) return { label: "일반 2순위", why: "1순위 미달 시에만 기회" };
  } else if (item.kind === "apt") {
    for (const k of ["newlywed", "first"]) if (ok(k)) return { label: ok(k).label, why: "특공은 일반공급과 따로 한 번 더 기회" };
    const ratio = rules.private_score_ratio[regulationOf(item) === "speculation" ? "regulated_speculation" : regulationOf(item) === "adjust" ? "regulated_adjust" : "unregulated"];
    const m2 = Math.min(...(item.types ?? []).map(exclusiveM2).filter(Boolean));
    const scoreShare = Number.isFinite(m2) ? pickBand(ratio, m2) : null;
    if (r1) return { label: r1.label, why: scoreShare != null ? `가점 ${scoreShare}% · 추첨 ${100 - scoreShare}% — 우리 가점 ${score?.total ?? "?"}점이라 추첨 노림` : "1순위" };
    if (maybe("rank2")) return { label: "일반 2순위", why: "1순위 미달 시에만 기회" };
  }
  const first = options.find((o) => o.ok !== false);
  return first ? { label: first.label, why: first.why } : { label: "해당 없음", why: "넣을 수 있는 유형이 없음" };
}
