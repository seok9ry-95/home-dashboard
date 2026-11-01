// 청약홈 분양정보를 받아 서울·경기 공고만 골라 JSON 파일 하나로 쓴다.
// 사용: node scripts/collect-cheongyak.mjs <출력 파일>
// 하나라도 실패하면 파일을 쓰지 않고 종료 코드 1로 끝난다(기존 데이터 보호).
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  SERVICE, KINDS, SIDO, WINDOW_DAYS,
  kstToday, kstNowIso, addDays, buildItem, inWindow, modelKey, sortItems,
} from "./lib/cheongyak.mjs";

const OUT = process.argv[2] ?? "data/cheongyak.next.json";
const BASE = (process.env.CHEONGYAK_API_ENDPOINT ?? "https://api.odcloud.kr/api").replace(/\/+$/, "");
const PER_PAGE = Number(process.env.CHEONGYAK_PER_PAGE ?? 500);
const MAX_PAGES = Number(process.env.CHEONGYAK_MAX_PAGES ?? 100);
const RETRY_MS = Number(process.env.CHEONGYAK_RETRY_MS ?? 5000);
const log = (...a) => console.log("[수집]", ...a);

function apiKey() {
  let key = (process.env.CHEONGYAK_API_KEY ?? "").trim();
  if (!key) throw fatal("비밀값 CHEONGYAK_API_KEY가 비어 있습니다. 저장소 Settings → Secrets and variables → Actions에서 확인하세요.");
  // Encoding 키를 넣었어도 동작하게 한 번 풀어 둔다
  if (key.includes("%")) {
    try { key = decodeURIComponent(key); } catch { /* 그대로 사용 */ }
  }
  return key;
}

function fatal(message) {
  const e = new Error(message);
  e.fatal = true;
  return e;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(op, page, key) {
  const url = `${BASE}/${SERVICE}/${op}?page=${page}&perPage=${PER_PAGE}&serviceKey=${encodeURIComponent(key)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    if (res.status === 401 || /SERVICE_KEY|인증/.test(text)) {
      throw fatal(`${op}: 인증키가 거절됐습니다(http ${res.status}). 새 키는 작동까지 1~2시간 걸릴 수 있습니다.`);
    }
    throw new Error(`${op} ${page}쪽: JSON이 아닌 응답(http ${res.status})`);
  }
  if (typeof json.code === "number" && json.code < 0) {
    throw fatal(`${op}: API 오류 ${json.code} ${json.msg ?? ""}`.trim());
  }
  if (!res.ok) throw new Error(`${op} ${page}쪽: http ${res.status}`);
  if (!Array.isArray(json.data)) throw new Error(`${op} ${page}쪽: data 배열 없음`);
  return json;
}

async function withRetry(label, fn, attempts = 4) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (e.fatal || i >= attempts) throw e;
      log(`${label} 실패(${i}/${attempts}), 재시도: ${e.message}`);
      await sleep(RETRY_MS * i);
    }
  }
}

async function fetchAll(op, key) {
  const rows = [];
  let total = null;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const json = await withRetry(`${op} ${page}쪽`, () => fetchPage(op, page, key));
    total ??= Number(json.totalCount ?? json.matchCount ?? 0);
    rows.push(...json.data);
    if (json.data.length === 0 || rows.length >= total) break;
  }
  // 일부만 받은 채로 저장하지 않는다
  if (total && rows.length < total) throw new Error(`${op}: ${total}건 중 ${rows.length}건만 받음`);
  return rows;
}

async function main() {
  const key = apiKey();
  const today = kstToday();
  const items = [];
  const counts = {};

  for (const kind of KINDS) {
    const details = await fetchAll(kind.detail, key);
    const models = await fetchAll(kind.model, key);
    const byKey = new Map();
    for (const m of models) {
      const k = modelKey(m);
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(m);
    }
    const kept = details
      .map((row) => buildItem(row, kind, byKey.get(modelKey(row)) ?? []))
      .filter((it) => it.name && SIDO.includes(it.sido) && inWindow(it, today));
    counts[kind.key] = kept.length;
    items.push(...kept);
    log(`${kind.label}: 전체 ${details.length}건(주택형 ${models.length}줄) → 서울·경기·기간 안 ${kept.length}건`);
  }

  sortItems(items);
  const payload = {
    schema: 1,
    source: "청약홈 분양정보 조회 서비스(한국부동산원, 공공데이터포털)",
    collected_at: kstNowIso(),
    base_date: today,
    window_from: addDays(today, -WINDOW_DAYS),
    sido: SIDO,
    counts: { ...counts, total: items.length },
    coverage: {
      with_types: items.filter((i) => i.types.length > 0).length,
      with_price: items.filter((i) => i.price_max_manwon != null).length,
    },
    items,
  };

  await mkdir(path.dirname(path.resolve(OUT)), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload, null, 1) + "\n");
  log(`저장 대기 파일 작성: ${OUT} (${items.length}건, 기준일 ${today})`);
}

main().catch((e) => {
  console.error(`[수집 실패] ${e.message}`);
  process.exit(1);
});
