// 수집 전에 도는 테스트. 실제 청약홈 대신 가짜 서버를 띄워 수집 스크립트를 끝까지 돌려 본다.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  toIsoDate, toYm, num, sidoOf, buildItem, inWindow, kstToday, addDays, KINDS,
} from "../scripts/lib/cheongyak.mjs";
import { checkPayload } from "../scripts/check-cheongyak.mjs";

const run = promisify(execFile);
const today = kstToday();
const d = (n) => addDays(today, n); // 오늘 기준 상대 날짜
const compact = (iso) => iso.replaceAll("-", "");
const APT = KINDS.find((k) => k.key === "apt");
const REMNDR = KINDS.find((k) => k.key === "remndr");

test("날짜 표기 두 가지를 모두 ISO로 맞춘다", () => {
  assert.equal(toIsoDate("2026-11-04"), "2026-11-04");
  assert.equal(toIsoDate("20261104"), "2026-11-04");
  assert.equal(toIsoDate("2026.11.04"), "2026-11-04");
  assert.equal(toIsoDate("20261332"), null);
  assert.equal(toIsoDate(""), null);
  assert.equal(toIsoDate(null), null);
  assert.equal(toYm("202812"), "2028-12");
  assert.equal(toYm("2028-13"), null);
});

test("숫자는 문자열·콤마가 섞여도 읽는다", () => {
  assert.equal(num("45,000"), 45000);
  assert.equal(num(78900), 78900);
  assert.equal(num(""), null);
  assert.equal(num("없음"), null);
});

test("시·도는 공급지역명, 없으면 주소로 판단한다", () => {
  assert.equal(sidoOf({ SUBSCRPT_AREA_CODE_NM: "서울" }), "서울");
  assert.equal(sidoOf({ HSSPLY_ADRES: "경기도 하남시 감일동 1" }), "경기");
  assert.equal(sidoOf({ HSSPLY_ADRES: "서울특별시 강동구 고덕동 1" }), "서울");
  assert.equal(sidoOf({ SUBSCRPT_AREA_CODE_NM: "부산" }), "부산");
});

test("APT 공고: 순위별 접수일과 주택형별 분양가를 묶는다", () => {
  const row = {
    HOUSE_MANAGE_NO: "2026000100", PBLANC_NO: "2026000100", HOUSE_NM: "테스트자이",
    HOUSE_SECD_NM: "APT", HOUSE_DTL_SECD_NM: "민영", SUBSCRPT_AREA_CODE_NM: "서울",
    HSSPLY_ADRES: "서울특별시 강동구 고덕동 1", TOT_SUPLY_HSHLDCO: 300,
    RCRIT_PBLANC_DE: "2026-10-24",
    SPSPLY_RCEPT_BGNDE: "2026-11-02", SPSPLY_RCEPT_ENDDE: "2026-11-02",
    GNRL_RNK1_CRSPAREA_RCPTDE: "20261103", GNRL_RNK1_CRSPAREA_ENDDE: "20261103",
    GNRL_RNK1_ETC_GG_RCPTDE: "20261103", GNRL_RNK1_ETC_GG_ENDDE: "20261103",
    GNRL_RNK2_CRSPAREA_RCPTDE: "20261104", GNRL_RNK2_CRSPAREA_ENDDE: "20261104",
    PRZWNER_PRESNATN_DE: "2026-11-10", MVN_PREARNGE_YM: "202903",
    SPECLT_RDN_EARTH_AT: "Y", PARCPRC_ULS_AT: "N",
  };
  const models = [
    { MODEL_NO: "02", HOUSE_TY: "084.9500A", SUPLY_AR: "112.3", SUPLY_HSHLDCO: 40, SPSPLY_HSHLDCO: 30, NWWDS_HSHLDCO: 10, LTTOT_TOP_AMOUNT: "98,000" },
    { MODEL_NO: "01", HOUSE_TY: "059.9800A", SUPLY_AR: "80.1", SUPLY_HSHLDCO: 50, SPSPLY_HSHLDCO: 40, LFE_FRST_HSHLDCO: 12, LTTOT_TOP_AMOUNT: "79000" },
  ];
  const it = buildItem(row, APT, models);
  assert.equal(it.id, "apt-2026000100-2026000100");
  assert.equal(it.sido, "서울");
  assert.equal(it.sigungu, "강동구");
  assert.deepEqual(it.schedule.special, { start: "2026-11-02", end: "2026-11-02" });
  assert.deepEqual(it.schedule.rank1, { start: "2026-11-03", end: "2026-11-03" });
  assert.deepEqual(it.schedule.rank2, { start: "2026-11-04", end: "2026-11-04" });
  // RCEPT_* 가 비어 있으면 특공~2순위 범위로 채운다
  assert.deepEqual(it.schedule.receipt, { start: "2026-11-02", end: "2026-11-04" });
  assert.equal(it.schedule.winner_date, "2026-11-10");
  assert.equal(it.move_in, "2029-03");
  assert.equal(it.flags.투기과열, true);
  assert.equal(it.flags.분양가상한제, false);
  assert.equal(it.types[0].type, "059.9800A"); // 주택형 번호순 정렬
  assert.deepEqual(it.types[0].special_by_kind, { 생애최초: 12 });
  assert.equal(it.price_max_manwon, 98000);
});

test("무순위 공고: 접수일이 일반접수 칸에만 있어도 읽는다", () => {
  const row = {
    HOUSE_MANAGE_NO: "2026910001", PBLANC_NO: "2026910001", HOUSE_NM: "테스트 무순위",
    HSSPLY_ADRES: "경기도 화성시 동탄 1", RCRIT_PBLANC_DE: "20261028",
    GNRL_RCEPT_BGNDE: "20261105", GNRL_RCEPT_ENDDE: "20261105",
  };
  const it = buildItem(row, REMNDR, []);
  assert.equal(it.sido, "경기");
  assert.deepEqual(it.schedule.receipt, { start: "2026-11-05", end: "2026-11-05" });
  assert.equal(it.flags, null);
  assert.equal(it.price_max_manwon, null);
});

test("보관 기간: 앞으로 일정이 있거나 지난 60일 공고만 남긴다", () => {
  const mk = (announce, end, winner = null) => ({ announce_date: announce, schedule: { receipt: { end }, winner_date: winner } });
  assert.equal(inWindow(mk(d(-100), d(3)), today), true); // 접수 예정
  assert.equal(inWindow(mk(d(-30), d(-20)), today), true); // 지난 60일 안
  assert.equal(inWindow(mk(d(-100), d(-90), d(1)), today), true); // 발표 예정
  assert.equal(inWindow(mk(d(-100), d(-90)), today), false); // 끝난 지 오래
});

function validPayload(items) {
  return {
    schema: 1, collected_at: new Date().toISOString(), base_date: today,
    counts: { apt: items.filter((i) => i.kind === "apt").length, total: items.length }, items,
  };
}
const goodItem = (id, extra = {}) => ({
  id, kind: "apt", name: `단지${id}`, sido: "서울", announce_date: d(-5),
  schedule: { receipt: { start: d(1), end: d(3) }, winner_date: d(10) },
  price_max_manwon: 80000, types: [{ type: "059" }], ...extra,
});

test("검사: 정상 데이터는 통과한다", () => {
  const { errors } = checkPayload(validPayload([goodItem("a"), goodItem("b")]));
  assert.deepEqual(errors, []);
});

test("검사: 0건·서울경기 밖·날짜 오류·급감은 막는다", () => {
  assert.ok(checkPayload(validPayload([])).errors.length > 0);
  assert.ok(checkPayload(validPayload([goodItem("a", { sido: "부산" })])).errors.some((e) => e.includes("서울·경기")));
  assert.ok(checkPayload(validPayload([goodItem("a", { schedule: { receipt: { start: "11/04" } } })])).errors.length > 0);
  assert.ok(checkPayload(validPayload([goodItem("a"), goodItem("a")])).errors.some((e) => e.includes("중복")));
  const prev = { counts: { total: 50 } };
  assert.ok(checkPayload(validPayload([goodItem("a")]), prev).errors.some((e) => e.includes("급감")));
});

// ---- 가짜 청약홈 서버로 수집 스크립트 전체 실행 ----
function fakeApplyhome(tables) {
  const calls = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const op = url.pathname.split("/").pop();
    calls.push({ op, page: url.searchParams.get("page"), key: url.searchParams.get("serviceKey") });
    if (url.searchParams.get("serviceKey") !== "test-key") {
      res.writeHead(401).end("SERVICE_KEY_IS_NOT_REGISTERED_ERROR");
      return;
    }
    const rows = tables[op] ?? [];
    const page = Number(url.searchParams.get("page"));
    const per = Number(url.searchParams.get("perPage"));
    const data = rows.slice((page - 1) * per, page * per);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ page, perPage: per, totalCount: rows.length, currentCount: data.length, data }));
  });
  return new Promise((resolve) => server.listen(0, () => resolve({ server, calls, port: server.address().port })));
}

const SCRIPT = path.resolve(import.meta.dirname, "../scripts/collect-cheongyak.mjs");

test("가짜 서버: 여러 쪽을 끝까지 받고 서울·경기만 저장한다", async () => {
  const aptRow = (no, addr, area) => ({
    HOUSE_MANAGE_NO: no, PBLANC_NO: no, HOUSE_NM: `단지${no}`, HSSPLY_ADRES: addr, SUBSCRPT_AREA_CODE_NM: area,
    RCRIT_PBLANC_DE: d(-3), RCEPT_BGNDE: compact(d(2)), RCEPT_ENDDE: compact(d(4)),
  });
  const tables = {
    getAPTLttotPblancDetail: [
      aptRow("1", "서울특별시 송파구 1", "서울"),
      aptRow("2", "경기도 성남시 1", "경기"),
      aptRow("3", "부산광역시 해운대구 1", "부산"),
    ],
    getAPTLttotPblancMdl: [
      { HOUSE_MANAGE_NO: "1", PBLANC_NO: "1", MODEL_NO: "01", HOUSE_TY: "059", LTTOT_TOP_AMOUNT: 85000 },
      { HOUSE_MANAGE_NO: "1", PBLANC_NO: "1", MODEL_NO: "02", HOUSE_TY: "084", LTTOT_TOP_AMOUNT: 99000 },
      { HOUSE_MANAGE_NO: "2", PBLANC_NO: "2", MODEL_NO: "01", HOUSE_TY: "059", LTTOT_TOP_AMOUNT: 70000 },
    ],
    getRemndrLttotPblancDetail: [
      { HOUSE_MANAGE_NO: "9", PBLANC_NO: "9", HOUSE_NM: "무순위단지", HSSPLY_ADRES: "경기도 화성시 1",
        RCRIT_PBLANC_DE: compact(d(-1)), SUBSCRPT_RCEPT_BGNDE: d(1), SUBSCRPT_RCEPT_ENDDE: d(1) },
    ],
  };
  const { server, calls, port } = await fakeApplyhome(tables);
  const dir = await mkdtemp(path.join(tmpdir(), "cy-"));
  const out = path.join(dir, "out.json");
  try {
    await run(process.execPath, [SCRIPT, out], {
      env: { ...process.env, CHEONGYAK_API_KEY: "test-key", CHEONGYAK_API_ENDPOINT: `http://127.0.0.1:${port}`, CHEONGYAK_PER_PAGE: "2" },
    });
    const data = JSON.parse(await readFile(out, "utf8"));
    assert.deepEqual(data.items.map((i) => i.name).sort(), ["단지1", "단지2", "무순위단지"]);
    assert.equal(data.counts.total, 3);
    assert.equal(data.items.find((i) => i.name === "단지1").price_max_manwon, 99000);
    // 3건 + 2건씩 → APT 상세는 2쪽까지 받아야 한다
    assert.equal(calls.filter((c) => c.op === "getAPTLttotPblancDetail").length, 2);
    assert.deepEqual(checkPayload(data).errors, []);
  } finally {
    server.close();
  }
});

test("가짜 서버: 인증키가 틀리면 파일을 쓰지 않고 실패한다", async () => {
  const { server, port } = await fakeApplyhome({});
  const dir = await mkdtemp(path.join(tmpdir(), "cy-"));
  const out = path.join(dir, "out.json");
  try {
    await assert.rejects(
      run(process.execPath, [SCRIPT, out], {
        env: { ...process.env, CHEONGYAK_API_KEY: "wrong", CHEONGYAK_API_ENDPOINT: `http://127.0.0.1:${port}`, CHEONGYAK_RETRY_MS: "1" },
      }),
      (e) => e.stderr.includes("인증키"),
    );
    await assert.rejects(readFile(out, "utf8"));
  } finally {
    server.close();
  }
});
