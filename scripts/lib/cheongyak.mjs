// 청약홈 분양정보(한국부동산원) 응답을 우리 데이터 모양으로 바꾸는 순수 함수 모음.
// 네트워크를 쓰지 않으므로 테스트에서 그대로 검증할 수 있다.

export const SERVICE = "ApplyhomeInfoDetailSvc/v1";

// 수집하는 공고 종류. 오피스텔·도시형은 PRD 범위(아파트) 밖이라 넣지 않는다.
export const KINDS = [
  { key: "apt", label: "APT", detail: "getAPTLttotPblancDetail", model: "getAPTLttotPblancMdl" },
  { key: "remndr", label: "무순위·잔여세대", detail: "getRemndrLttotPblancDetail", model: "getRemndrLttotPblancMdl" },
  { key: "opt", label: "임의공급", detail: "getOptLttotPblancDetail", model: "getOptLttotPblancMdl" },
];

export const SIDO = ["서울", "경기"];
export const WINDOW_DAYS = 60; // 지난 60일 공고까지 보관(발표일 확인용)

export function kstToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
}

export function kstNowIso(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().replace(/\.\d{3}Z$/, "+09:00");
}

export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// "2026-08-24" · "20260824" · "2026.08.24" → "2026-08-24", 그 밖은 null
export function toIsoDate(value) {
  if (value == null) return null;
  const digits = String(value).replace(/\D/g, "");
  if (digits.length !== 8) return null;
  const iso = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || !d.toISOString().startsWith(iso)) return null;
  return iso;
}

// "202812" · "2028-12" → "2028-12"
export function toYm(value) {
  if (value == null) return null;
  const digits = String(value).replace(/\D/g, "");
  if (digits.length < 6) return null;
  const m = Number(digits.slice(4, 6));
  if (m < 1 || m > 12) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}`;
}

export function clean(value) {
  if (value == null) return null;
  const s = String(value).replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

export function num(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

const yes = (v) => clean(v)?.toUpperCase() === "Y";

// 시·도: 공급지역명이 있으면 그것, 없으면 주소 앞부분으로 판단
export function sidoOf(row) {
  const area = clean(row.SUBSCRPT_AREA_CODE_NM);
  if (area) {
    for (const s of SIDO) if (area.startsWith(s)) return s;
  }
  const addr = clean(row.HSSPLY_ADRES) ?? "";
  if (/^서울/.test(addr)) return "서울";
  if (/^경기/.test(addr)) return "경기";
  return area ?? null;
}

export function sigunguOf(address) {
  const parts = (clean(address) ?? "").split(" ");
  return parts.length > 1 ? parts[1] : null;
}

function minDate(...vals) {
  const ds = vals.map(toIsoDate).filter(Boolean).sort();
  return ds[0] ?? null;
}
function maxDate(...vals) {
  const ds = vals.map(toIsoDate).filter(Boolean).sort();
  return ds.at(-1) ?? null;
}
function range(start, end) {
  return start || end ? { start: start ?? null, end: end ?? null } : null;
}

function scheduleOf(row, kindKey) {
  const special = range(toIsoDate(row.SPSPLY_RCEPT_BGNDE), toIsoDate(row.SPSPLY_RCEPT_ENDDE));
  const winner_date = toIsoDate(row.PRZWNER_PRESNATN_DE);
  const contract = range(toIsoDate(row.CNTRCT_CNCLS_BGNDE), toIsoDate(row.CNTRCT_CNCLS_ENDDE));

  if (kindKey === "apt") {
    const rank1 = range(
      minDate(row.GNRL_RNK1_CRSPAREA_RCPTDE, row.GNRL_RNK1_ETC_GG_RCPTDE, row.GNRL_RNK1_ETC_AREA_RCPTDE),
      maxDate(row.GNRL_RNK1_CRSPAREA_ENDDE, row.GNRL_RNK1_ETC_GG_ENDDE, row.GNRL_RNK1_ETC_AREA_ENDDE),
    );
    const rank2 = range(
      minDate(row.GNRL_RNK2_CRSPAREA_RCPTDE, row.GNRL_RNK2_ETC_GG_RCPTDE, row.GNRL_RNK2_ETC_AREA_RCPTDE),
      maxDate(row.GNRL_RNK2_CRSPAREA_ENDDE, row.GNRL_RNK2_ETC_GG_ENDDE, row.GNRL_RNK2_ETC_AREA_ENDDE),
    );
    const receipt = range(
      toIsoDate(row.RCEPT_BGNDE) ?? minDate(special?.start, rank1?.start, rank2?.start),
      toIsoDate(row.RCEPT_ENDDE) ?? maxDate(special?.end, rank1?.end, rank2?.end),
    );
    return { receipt, special, rank1, rank2, general: null, winner_date, contract };
  }

  // 무순위·임의공급: 접수일 필드가 공고마다 한쪽만 채워져 있어 우선순위로 고른다
  const general = range(toIsoDate(row.GNRL_RCEPT_BGNDE), toIsoDate(row.GNRL_RCEPT_ENDDE));
  const receipt = range(
    toIsoDate(row.SUBSCRPT_RCEPT_BGNDE) ?? minDate(special?.start, general?.start),
    toIsoDate(row.SUBSCRPT_RCEPT_ENDDE) ?? maxDate(special?.end, general?.end),
  );
  return { receipt, special, rank1: null, rank2: null, general, winner_date, contract };
}

// 주택형별 특별공급 세대수(APT 응답에만 있음). 값이 없는 칸은 넣지 않는다.
const SPECIAL_FIELDS = {
  다자녀: "MNYCH_HSHLDCO",
  신혼부부: "NWWDS_HSHLDCO",
  생애최초: "LFE_FRST_HSHLDCO",
  청년: "YGMN_HSHLDCO",
  신생아: "NWBB_HSHLDCO",
  노부모부양: "OLD_PARNTS_SUPORT_HSHLDCO",
  기관추천: "INSTT_RECOMEND_HSHLDCO",
  이전기관: "TRANSR_INSTT_ENFSN_HSHLDCO",
  기타: "ETC_HSHLDCO",
};

export function typeOf(m) {
  const special_by_kind = {};
  for (const [label, field] of Object.entries(SPECIAL_FIELDS)) {
    const v = num(m[field]);
    if (v != null) special_by_kind[label] = v;
  }
  return {
    model_no: clean(m.MODEL_NO),
    type: clean(m.HOUSE_TY),
    area_m2: num(m.SUPLY_AR),
    general_households: num(m.SUPLY_HSHLDCO),
    special_households: num(m.SPSPLY_HSHLDCO),
    special_by_kind: Object.keys(special_by_kind).length ? special_by_kind : null,
    price_top_manwon: num(m.LTTOT_TOP_AMOUNT),
  };
}

export function buildItem(row, kind, modelRows = []) {
  const types = modelRows
    .map(typeOf)
    .sort((a, b) => (a.model_no ?? "").localeCompare(b.model_no ?? "", "ko", { numeric: true }));
  const prices = types.map((t) => t.price_top_manwon).filter((p) => p != null && p > 0);
  const address = clean(row.HSSPLY_ADRES);
  return {
    id: `${kind.key}-${clean(row.HOUSE_MANAGE_NO) ?? ""}-${clean(row.PBLANC_NO) ?? ""}`,
    kind: kind.key,
    kind_label: kind.label,
    house_type: clean(row.HOUSE_SECD_NM),
    house_detail: clean(row.HOUSE_DTL_SECD_NM),
    sale_type: clean(row.RENT_SECD_NM),
    name: clean(row.HOUSE_NM),
    sido: sidoOf(row),
    sigungu: sigunguOf(address),
    address,
    total_households: num(row.TOT_SUPLY_HSHLDCO),
    announce_date: toIsoDate(row.RCRIT_PBLANC_DE),
    schedule: scheduleOf(row, kind.key),
    move_in: toYm(row.MVN_PREARNGE_YM),
    flags:
      kind.key === "apt"
        ? {
            투기과열: yes(row.SPECLT_RDN_EARTH_AT),
            조정대상: yes(row.MDAT_TRGET_AREA_SECD),
            분양가상한제: yes(row.PARCPRC_ULS_AT),
            공공주택지구: yes(row.PUBLIC_HOUSE_EARTH_AT),
            대규모택지: yes(row.LRSCL_BLDLND_AT),
          }
        : null,
    builder: clean(row.CNSTRCT_ENTRPS_NM) ?? clean(row.BSNS_MBY_NM),
    phone: clean(row.MDHS_TELNO),
    homepage: clean(row.HMPG_ADRES),
    notice_url: clean(row.PBLANC_URL),
    price_max_manwon: prices.length ? Math.max(...prices) : null,
    types,
  };
}

// 보관 기준: 접수·발표·계약 중 하나라도 오늘 이후이거나, 공고일이 지난 60일 안
export function inWindow(item, today, days = WINDOW_DAYS) {
  const from = addDays(today, -days);
  const s = item.schedule ?? {};
  const upcoming = [s.receipt?.end, s.winner_date, s.contract?.end].some((d) => d && d >= today);
  return upcoming || (item.announce_date != null && item.announce_date >= from);
}

export function modelKey(row) {
  return `${clean(row.HOUSE_MANAGE_NO) ?? ""}-${clean(row.PBLANC_NO) ?? ""}`;
}

export function sortItems(items) {
  return items.sort(
    (a, b) =>
      (a.schedule?.receipt?.start ?? "9999").localeCompare(b.schedule?.receipt?.start ?? "9999") ||
      (a.name ?? "").localeCompare(b.name ?? "", "ko"),
  );
}
