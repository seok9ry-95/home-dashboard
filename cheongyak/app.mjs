// 청약 탭 (현황판 16번). 공고·규칙은 공개 데이터, 부부 정보·관심 표시·넣은 기록·확정 매뉴얼은 잠긴 기록(data/private)에서 연다.
import { judgeNotice, applyOverrides, displaySchedule, sectorOf, monthsBetween } from "../scripts/lib/judge.mjs";
import { unlock, openLog, seal } from "../scripts/lib/vault.mjs";

const REPO = "seok9ry-95/home-dashboard";
const RAW = `https://raw.githubusercontent.com/${REPO}/main/`;
const API = `https://api.github.com/repos/${REPO}/contents/`;

// 판정 입력: 잠금 해제 전에는 비어 있음
let DATA, RULES, OVERRIDES, KEYS = null, LOG = { entries: [] };
let PEOPLE = [], HOUSEHOLD = { married: false, engaged: false, children_under2: 0, pregnant: false, minor_children: 0, parent65_3y: false };
let LEASE_END = null, MANUALS = {};
const V = { priv: null, rows: {}, token: null, subs: [] };

// 공개 데이터는 최신 원본(raw) → 실패하면 같은 사이트 사본
async function getJson(path, { fresh = false } = {}) {
  const tries = fresh
    ? [[`${API}${path}?ref=main&t=${Date.now()}`, { headers: { Accept: "application/vnd.github.raw+json" }, cache: "no-store" }], [`${RAW}${path}`, {}], [`../${path}`, {}]]
    : [[`${RAW}${path}`, {}], [`../${path}`, {}]];
  for (const [url, opt] of tries) {
    try { const r = await fetch(url, opt); if (r.ok) return await r.json(); } catch {}
  }
  return null;
}

// 열쇠를 이 기기에 기억: 꺼낼 수 없는 형태(CryptoKey)로 IndexedDB에 둔다. 비밀번호는 저장하지 않는다
const idb = (mode, fn) => new Promise((res, rej) => {
  const o = indexedDB.open("home-dashboard", 1);
  o.onupgradeneeded = () => o.result.createObjectStore("kv");
  o.onerror = () => rej(o.error);
  o.onsuccess = () => { const tx = o.result.transaction("kv", mode); const q = fn(tx.objectStore("kv")); tx.oncomplete = () => res(q?.result); tx.onerror = () => rej(tx.error); };
});
const remembered = async () => { try { return await idb("readonly", (s) => s.get("priv")); } catch { return null; } };
const remember = async (k) => { try { await idb("readwrite", (s) => s.put(k, "priv")); } catch {} };
const forget = async () => { try { await idb("readwrite", (s) => s.delete("priv")); } catch {} };

function flash(msg, bad = true) {
  const el = document.getElementById("lock-msg");
  el.textContent = msg; el.hidden = false; el.style.color = bad ? "var(--warn)" : "var(--muted)";
  clearTimeout(flash.t); flash.t = setTimeout(() => { el.hidden = true; }, 6000);
}

async function applyVault() {
  const { state: st, broken } = await openLog(V.priv, LOG);
  V.rows = st;
  const prof = st.profile?.data;
  if (prof) { PEOPLE = prof.people; HOUSEHOLD = prof.household; LEASE_END = prof.lease_end || null; }
  MANUALS = {}; state.interest = {}; V.subs = [];
  for (const [k, r] of Object.entries(st)) {
    if (r.type === "manual") MANUALS[r.data.notice_id] = r.data.text;
    if (r.type === "interest") state.interest[k.slice(9)] = r.data;
    if (r.type === "sub") V.subs.push(r.data);
  }
  V.token = st.token?.data?.token || null;
  if (broken) flash(`열지 못한 기록 ${broken}줄이 있습니다(다른 열쇠로 잠김)`);
}

// GitHub 파일 내용은 base64. 한글이 있어 UTF-8로 변환
const toB64 = (s) => { const b = new TextEncoder().encode(s); let o = ""; for (let i = 0; i < b.length; i += 8192) o += String.fromCharCode(...b.subarray(i, i + 8192)); return btoa(o); };
const fromB64 = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, "")), (c) => c.charCodeAt(0)));
const subsOf = (id) => V.subs.filter((s) => s.notice_id === id);

function renderLock() {
  const on = Boolean(V.priv);
  document.getElementById("unlock-form").hidden = on || !KEYS;
  document.getElementById("unlocked").hidden = !on;
  document.getElementById("subs-sec").hidden = !on;
  document.getElementById("token-sec").hidden = !on;
  if (!KEYS) flash("아직 열쇠가 없습니다. 처음 설정(../setup.html)을 먼저 해 주세요.", false);
  if (!on) return;
  document.getElementById("lock-status").textContent = `🔓 열림 · 기록 ${LOG.entries.length}줄 · ${V.token ? "관심 표시 부부 공유 중" : "관심 표시 저장 연결 필요(아래)"}`;
  document.getElementById("token-state").textContent = V.token ? "연결됨" : "연결 안 됨";
  document.getElementById("token-help").hidden = Boolean(V.token);
  const subs = [...V.subs].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  document.getElementById("subs").innerHTML = subs.length ? subs.map((s) => `<div class="sub-row num">
      <span class="muted">${s.date ? md(s.date) : "-"}</span><span><b>${esc(s.name)}</b> · ${esc(s.who)} · ${esc(s.supply)}${s.type ? ` · ${esc(s.type)}` : ""}</span>
      <span class="muted">결과</span><span>${esc(s.result || "발표 전")}${s.winner_date ? ` <span class="muted">(발표 ${md(s.winner_date)})</span>` : ""}</span>
    </div>`).join("") : `<p class="empty">아직 넣은 청약이 없습니다.</p>`;
}

// 잠긴 기록 한 줄을 저장소 log.json 끝에 붙인다(토큰 필요). 동시에 저장하면 한 번 다시 시도
async function append(record, token = V.token) {
  if (!token) throw new Error("관심 표시 저장 연결이 필요합니다");
  const entry = await seal(KEYS, record);
  const url = `${API}data/private/log.json`;
  const h = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
  for (let i = 0; i < 2; i++) {
    const g = await fetch(`${url}?ref=main&t=${Date.now()}`, { headers: h, cache: "no-store" });
    if (g.status === 401 || g.status === 403) throw new Error("토큰이 맞지 않거나 만료됐습니다");
    if (!g.ok) throw new Error(`기록 파일을 읽지 못했습니다(${g.status})`);
    const meta = await g.json();
    const log = JSON.parse(fromB64(meta.content));
    log.entries.push(entry);
    const body = JSON.stringify(log, null, 1) + "\n";
    const p = await fetch(url, { method: "PUT", headers: h, body: JSON.stringify({
      message: `잠긴 기록 추가 (${record.type})`, sha: meta.sha, branch: "main",
      content: toB64(body),
    }) });
    if (p.ok) { LOG = log; return; }
    if (p.status !== 409 && p.status !== 422) throw new Error(`저장하지 못했습니다(${p.status})`);
  }
  throw new Error("다른 기기와 동시에 저장돼 실패했습니다. 다시 눌러 주세요");
}

async function saveInterest(id, value) {
  const prev = state.interest[id];
  if (value) state.interest[id] = value; else delete state.interest[id];
  render();
  try {
    document.body.classList.add("saving");
    await append({ key: `interest:${id}`, type: "interest", data: value });
    await applyVault(); render(); renderLock();
  } catch (e) {
    if (prev) state.interest[id] = prev; else delete state.interest[id];
    render(); flash(e.message);
  } finally { document.body.classList.remove("saving"); }
}

async function onUnlock(priv, keep) {
  V.priv = priv;
  if (keep) await remember(priv);
  LOG = (await getJson("data/private/log.json", { fresh: true })) || LOG;
  await applyVault();
  renderLock(); render();
}

async function boot() {
  [DATA, RULES, OVERRIDES, KEYS, LOG] = await Promise.all([
    getJson("data/cheongyak.json"), getJson("data/cheongyak-rules.json"), getJson("data/cheongyak-overrides.json"),
    getJson("data/private/keys.json", { fresh: true }), getJson("data/private/log.json", { fresh: true }),
  ]);
  LOG = LOG || { entries: [] };
  if (!DATA || !RULES) { document.getElementById("cards").innerHTML = `<p class="empty">청약 데이터를 불러오지 못했습니다. 잠시 뒤 새로고침해 주세요.</p>`; return; }
  OVERRIDES = OVERRIDES || { items: {} };
  state.near = false;
  init();
  renderLock();

  document.getElementById("unlock-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pw = document.getElementById("pw"), btn = document.getElementById("unlock-btn");
    btn.disabled = true; btn.textContent = "여는 중…";
    try { await onUnlock(await unlock(KEYS, pw.value), document.getElementById("remember").checked); pw.value = ""; }
    catch (err) { flash(err.message); }
    finally { btn.disabled = false; btn.textContent = "열기"; }
  });
  document.getElementById("lock-btn").addEventListener("click", async () => {
    await forget(); V.priv = null; V.token = null; PEOPLE = []; MANUALS = {}; LEASE_END = null; state.interest = {}; state.near = false; V.subs = [];
    renderLock(); render();
  });
  document.getElementById("token-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const t = document.getElementById("token").value.trim();
    if (!/^github_pat_/.test(t)) return flash("github_pat_로 시작하는 Fine-grained 토큰을 넣어 주세요");
    try {
      await append({ key: "token", type: "token", data: { token: t } }, t);
      document.getElementById("token").value = "";
      await applyVault(); renderLock(); render(); flash("연결됐습니다. 이제 관심 표시가 부부에게 같이 보입니다.", false);
    } catch (err) { flash(err.message); }
  });

  const saved = KEYS && await remembered();
  if (saved) { try { await onUnlock(saved, false); } catch { await forget(); } }
}

const $ = (id) => document.getElementById(id);
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const state = { married: store.get("cy.married", false), near: store.get("cy.near", false), all: store.get("cy.all", false), month: null,
  interest: {}, view: store.get("cy.view", "all"), filters: new Set(store.get("cy.filters", [])), open: new Set(), page: 1, pageKey: "", list: [] };
const PER_PAGE = 6;
// 카테고리 필터: 지역은 OR, 나머지는 AND
const canDo = (r, key) => r.j.people.some((p) => p.options.some((o) => o.key === key && o.ok !== false));
const FILTERS = [
  { id: "ours", label: "★ 넣을 만함", test: (r) => r.ours },
  { id: "seoul", label: "서울", region: true, test: (r) => r.it.sido === "서울" },
  { id: "gyeonggi", label: "경기", region: true, test: (r) => r.it.sido === "경기" },
  { id: "public", label: "공공", test: (r) => r.it.kind === "apt" && r.j.sector === "public" },
  { id: "private", label: "민영", test: (r) => r.it.kind === "apt" && r.j.sector === "private" },
  { id: "youth", label: "청년 특공 가능", test: (r) => canDo(r, "youth") },
  { id: "newlywed", label: "신혼부부 특공 가능", test: (r) => canDo(r, "newlywed") },
  { id: "first", label: "생애최초 특공 가능", test: (r) => canDo(r, "first") },
  { id: "rank1", label: "일반 1순위 가능", test: (r) => canDo(r, "rank1") },
  { id: "cap", label: "분양가상한제", test: (r) => Boolean(r.it.flags?.분양가상한제) },
  { id: "spec", label: "투기과열", test: (r) => Boolean(r.it.flags?.투기과열) },
  { id: "under9", label: "9억 이하", test: (r) => !r.dim },
];
function passFilters(r) {
  const on = FILTERS.filter((f) => state.filters.has(f.id));
  const regions = on.filter((f) => f.region), others = on.filter((f) => !f.region);
  if (regions.length && !regions.some((f) => f.test(r))) return false;
  if (!others.every((f) => f.test(r))) return false;
  const mark = state.interest[r.it.id];
  if (state.view === "yes" && mark !== "yes") return false;
  if (state.view === "no" && mark !== "no") return false;
  return true;
}

const won = (m) => m == null ? "-" : m >= 10000 ? `${(m / 10000).toFixed(m % 10000 === 0 ? 0 : 1)}억` : `${m.toLocaleString("ko-KR")}만`;
const md = (s) => s ? `${+s.slice(5, 7)}/${+s.slice(8, 10)}` : "?";
const ymIndex = (ym) => +ym.slice(0, 4) * 12 + +ym.slice(5, 7) - 1;
const kst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

function moveGap(ym) {
  if (!ym || !LEASE_END) return null;
  const g = ymIndex(ym) - ymIndex(LEASE_END);
  return { g, text: g === 0 ? "전세 만기 달" : g < 0 ? `만기 ${-g}개월 전` : `만기 ${g}개월 뒤` };
}
function priceRange(it) {
  const ps = (it.types || []).map((t) => t.price_top_manwon).filter((p) => p > 0);
  if (!ps.length) return { min: null, max: null, text: "-" };
  const min = Math.min(...ps), max = Math.max(...ps);
  return { min, max, text: min === max ? won(max) : `${won(min)}~${won(max)}` };
}

function prepare() {
  const hh = { ...HOUSEHOLD, married: state.married, engaged: !state.married, married_since: state.married ? kst() : null };
  return DATA.items.map((raw) => {
    const it = applyOverrides(raw, OVERRIDES);
    const j = judgeNotice(it, PEOPLE, hh, RULES);
    const price = priceRange(it);
    const dim = price.min != null && price.min > RULES.dim_price_manwon;
    const ours = !dim && it.kind === "apt" && j.people.some((p) => p.options.some((o) => o.ok === true));
    return { it, j, price, dim, ours, sched: displaySchedule(it), gap: moveGap(it.move_in) };
  }).filter((x) => (state.all || x.it.kind === "apt") && (!state.near || (x.gap && Math.abs(x.gap.g) <= 12)));
}

function eventsByDay(rows) {
  const map = new Map();
  const push = (d, e) => { if (!map.has(d)) map.set(d, []); map.get(d).push(e); };
  for (const r of rows) {
    const short = r.it.name.replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim().slice(0, 14);
    for (const s of r.sched) {
      if (!s.start) continue;
      const cls = r.it.kind !== "apt" ? "other" : !s.certain ? "unsure" : s.key;
      const label = r.it.kind !== "apt" ? (r.it.kind === "remndr" ? "무순위" : "임의") : s.certain ? s.label : "접수 끝·공고문";
      const days = [];
      if (!s.certain) days.push(s.end);
      else { for (let d = s.start; d <= s.end; d = addDay(d)) days.push(d); if (days.length > 3) days.splice(1, days.length - 2); }
      for (const d of days) push(d, { r, cls, label, short });
    }
  }
  return map;
}
function addDay(d) { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); }

function renderCalendar(rows) {
  const [y, m] = state.month;
  $("month").textContent = `${y}년 ${m}월`;
  const map = eventsByDay(rows);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const start = new Date(first); start.setUTCDate(1 - ((first.getUTCDay() + 6) % 7));
  const today = kst();
  const parts = ["월", "화", "수", "목", "금"].map((d) => `<div class="dow">${d}</div>`);
  for (let d = new Date(start); ; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10), dow = d.getUTCDay();
    if (d.getUTCMonth() !== m - 1 && d > first && dow === 1) break;
    if (dow === 0 || dow === 6) continue;
    const ev = (map.get(iso) || []).sort((a, b) => (b.r.ours - a.r.ours) || (a.r.dim - b.r.dim));
    const out = d.getUTCMonth() !== m - 1;
    const shown = ev.slice(0, 6).map((e) => `<button class="chip ${e.cls}${e.r.dim ? " dim" : ""}" data-id="${e.r.it.id}" title="${e.r.it.name}">${e.r.ours ? '<span class="pick">★ </span>' : ""}${e.label} · ${e.short}</button>`).join("");
    const more = ev.length > 6 ? `<span class="more">외 ${ev.length - 6}건</span>` : "";
    parts.push(`<div class="day${out ? " out" : ""}${iso === today ? " today" : ""}${ev.length ? "" : " empty-day"}"><span class="dnum">${+iso.slice(8)}${window.innerWidth <= 640 ? ` (${"일월화수목금토"[dow]})` : ""}</span>${shown}${more}</div>`);
  }
  $("grid").innerHTML = parts.join("");
}

function nextDate(r) {
  const today = kst();
  const ds = r.sched.flatMap((s) => [s.start, s.end]).filter(Boolean).filter((d) => d >= today).sort();
  return ds[0] || null;
}

function renderCards(rows, total) {
  const [, m] = state.month;
  const inMonth = monthRows(rows);
  // 우리 적합도순: 관심 없음은 맨 뒤 → 관심 있음 → ★ 넣을 만함 → 9억 이하 → 입주월이 전세 만기에 가까운 순 → 접수 임박순
  const rank = (r) => { const m = state.interest[r.it.id]; return m === "no" ? 2 : m === "yes" ? 0 : 1; };
  const gapOf = (r) => (r.gap ? Math.abs(r.gap.g) : 999);
  inMonth.sort((a, b) => (rank(a) - rank(b)) || (b.ours - a.ours) || (a.dim - b.dim) || (gapOf(a) - gapOf(b)) || String(nextDate(a) || "9").localeCompare(String(nextDate(b) || "9")));
  $("list-title").textContent = inMonth.length === total ? `${m}월 일정이 있는 단지 ${total}곳` : `${m}월 일정이 있는 단지 ${inMonth.length}곳 (전체 ${total}곳)`;
  state.list = inMonth.map((r) => r.it.id);
  const key = JSON.stringify([state.month, [...state.filters].sort(), state.view, state.married, state.near, state.all]);
  if (key !== state.pageKey) { state.pageKey = key; state.page = 1; }
  const pages = Math.max(1, Math.ceil(inMonth.length / PER_PAGE));
  state.page = Math.min(Math.max(1, state.page), pages);
  if (!inMonth.length) { $("cards").innerHTML = `<p class="empty">이 달에는 고른 조건에 맞는 공고가 없습니다. 필터를 줄여 보세요.</p>`; $("pager").innerHTML = ""; return; }
  const from = (state.page - 1) * PER_PAGE;
  $("cards").innerHTML = inMonth.slice(from, from + PER_PAGE).map(card).join("");
  $("pager").innerHTML = pages === 1 ? "" :
    `<button data-page="${state.page - 1}" aria-label="이전 페이지"${state.page === 1 ? " disabled" : ""}>‹</button>`
    + Array.from({ length: pages }, (_, i) => `<button data-page="${i + 1}"${i + 1 === state.page ? ' aria-current="page"' : ""}>${i + 1}</button>`).join("")
    + `<button data-page="${state.page + 1}" aria-label="다음 페이지"${state.page === pages ? " disabled" : ""}>›</button>`
    + `<span class="info">${from + 1}~${Math.min(from + PER_PAGE, inMonth.length)}번째 / ${inMonth.length}곳</span>`;
}

function card(r) {
  const { it, j } = r;
  const sector = j.sector === "public" ? "공공" : "민영";
  const kind = it.kind === "apt" ? it.house_detail === "국민" ? (/(신혼희망)/.test(it.name) ? "신혼희망타운" : "공공분양") : "민영 분양" : it.kind === "remndr" ? "무순위" : "임의공급";
  const sched = r.sched.map((s) => s.start ? `${s.label} ${md(s.start)}${s.end && s.end !== s.start ? `~${md(s.end)}` : ""}${s.certain ? "" : "(공고문 확인)"}` : `${s.label} 공고문 확인`).join(" · ");
  const regs = [it.flags?.투기과열 && "투기과열", it.flags?.분양가상한제 && "분양가상한제"].filter(Boolean);
  const who = j.people.map((p) => {
    const opts = p.options.map((o) => `<span class="o${o.ok === false ? " no" : o.ok === "check" ? " check" : ""}" title="${o.why}">${o.label}</span>`).join("");
    const conds = p.options.filter((o) => o.ok === "check").map((o) => `<li>${o.label}: ${o.why}</li>`).join("");
    const score = p.score ? ` · 가점 ${p.score.total}점${p.score.missing.length ? `(${p.score.missing.join(", ")} 빠짐)` : ""}` : "";
    return `<div class="who"><div><b>${p.label}</b></div><div class="opts">${opts}</div>${conds ? `<ul class="why">${conds}</ul>` : ""}<div class="reco">추천 <strong>${p.pick.label}</strong> — ${p.pick.why}${score}</div></div>`;
  }).join("");
  const mark = state.interest[it.id];
  const open = state.open.has(it.id);
  return `<article class="card${r.dim ? " dim" : ""}${mark === "no" ? " no-interest" : ""}" id="c-${it.id}">
    <div class="card-row">
      ${V.priv ? `<div class="marks" role="group" aria-label="관심 표시">
        <button class="mark yes" data-mark="yes" data-id="${it.id}" aria-pressed="${mark === "yes"}">관심 있음</button>
        <button class="mark no" data-mark="no" data-id="${it.id}" aria-pressed="${mark === "no"}">관심 없음</button>
      </div>` : "<span></span>"}
      <span class="tags">${subsOf(it.id).length ? `<span class="tag done">넣음 ${subsOf(it.id).length}건</span>` : ""}${r.ours ? '<span class="tag ours">★ 넣을 만함</span>' : ""}</span>
    </div>
    <div class="top">
      <div class="tags"><span class="tag">${sector}</span><span class="tag">${kind}</span><span class="tag">${it.sido} ${it.sigungu || ""}</span>${regs.map((x) => `<span class="tag">${x}</span>`).join("")}${r.dim ? '<span class="tag warn">9억 초과</span>' : ""}${it.schedule_override ? '<span class="tag">날짜 공고문 보정</span>' : ""}</div>
      <div class="name">${it.name}</div>
    </div>
    <dl class="facts num">
      <dt>분양가</dt><dd>${r.price.text} <span class="muted small">(주택형별 최고가)</span></dd>
      <dt>일정</dt><dd>${sched || "-"}</dd>
      <dt>입주</dt><dd>${it.move_in ? `${it.move_in.replace("-", ".")}${r.gap ? ` · ${r.gap.text}` : ""}` : "-"}</dd>
      <dt>세대수</dt><dd>${it.total_households ?? "-"}세대</dd>
    </dl>
    <button class="toggle" data-open="${it.id}" aria-expanded="${open}">${open ? "접기 ▴" : `${PEOPLE.length ? PEOPLE.map((q) => q.label).join("·") : "우리"} 청약 전략 ▾`}</button>
    <div class="detail"${open ? "" : " hidden"}>
      ${V.priv ? who : '<div class="who small muted">🔒 잠금을 풀면 우리 청약 전략이 보입니다</div>'}
      ${V.priv ? j.notes.map((n) => `<div class="note">${n}</div>`).join("") : ""}
      <a href="${it.notice_url}" target="_blank" rel="noopener">공고문 보기(청약홈) ↗</a>
      ${V.priv ? manualBlock(r) : ""}
    </div>
  </article>`;
}

// 공고 접수 매뉴얼: 확정본(채팅에서 만든 것)이 있으면 그것, 없으면 판정으로 자동 초안
const WD = "일월화수목금토";
const mdw = (d) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}(${WD[new Date(d + "T00:00:00Z").getUTCDay()]})`;
const span = (rg) => !rg?.start ? null : rg.end && rg.end !== rg.start ? `${mdw(rg.start)}~${mdw(rg.end)}` : mdw(rg.start);
function siteOf(it) {
  const h = it.homepage || "";
  if (h.includes("i-sh.co.kr")) return "www.i-sh.co.kr/app";
  if (h.includes("lh.or.kr")) return "apply.lh.or.kr (LH청약플러스)";
  return "www.applyhome.co.kr (청약홈)";
}
function optionDate(it, o) {
  const s = it.schedule || {};
  const unsure = it.kind === "apt" && sectorOf(it) === "public" && !s.special && !it.schedule_override;
  if (unsure) return "날짜 공고문 확인";
  if (it.kind !== "apt") return span(s.receipt || s.general) || "날짜 공고문 확인";
  if (o.key === "rank1") {
    const local = o.label.includes("해당지역");
    return span((local ? s.rank1_by_area?.["해당지역"] : s.rank1_by_area?.["기타지역"]) || s.rank1) || "날짜 공고문 확인";
  }
  if (o.key === "rank2") return span(s.rank2) || "날짜 공고문 확인";
  return span(s.special) || "날짜 공고문 확인";
}
function draftManual(r) {
  const { it, j } = r;
  const short = it.name.replace(/\(.*?\)/g, "").trim();
  const rows = new Map();
  for (const p of j.people) for (const o of p.options) {
    if (o.ok !== true && !(o.ok === "check" && o.label === p.pick.label)) continue; // 가능한 유형 + 확인이 남은 추천 유형
    const base = o.label.replace(/\(.*?\)/, "");
    const k = `${o.key}|${base}`;
    if (!rows.has(k)) rows.set(k, { date: optionDate(it, o), label: o.label.startsWith("일반") ? base.replace("일반 ", "일반공급 ") : base, who: [] });
    rows.get(k).who.push(p.label);
  }
  const sched = [...rows.values()].sort((a, b) => a.date.localeCompare(b.date))
    .map((x) => `- ${x.date}: ${x.label} → ${x.who.join("·")}${x.who.length > 1 && !x.label.startsWith("일반") ? " 각자" : ""}`);
  const people = j.people.map((p) => {
    const me = PEOPLE.find((q) => q.key === p.key) || {};
    const need = RULES.rank1.local_priority_years[it.sido] ?? 0;
    const here = me.residence?.sido === it.sido;
    const months = here ? monthsBetween(me.residence.since, j.on) : null;
    const where = !here ? `${it.sido} 거주 아님 (${me.residence?.sido ?? "-"} 거주)` : months >= need * 12 ? `${it.sido} ${need}년 이상 (${me.residence.since.replace("-", ".")} 전입)` : `${it.sido} ${need}년 미만 ⚠️ (${me.residence.since.replace("-", ".")} 전입, '${need}년 이상' 고르면 부적격)`;
    return [`[${p.label}]`, `- 지역: ${where}`, `- 세대: ${me.householder ? "세대주" : "세대원"}`, `- 통장: ${me.account?.payments ?? "?"}회 이상`, `- 추천: ${p.pick.label}`];
  }).flat();
  const conds = j.people.flatMap((p) => p.options.filter((o) => o.ok === "check").map((o) => `- ${p.label} ${o.label}: ${o.why}`));
  return [
    `[${short} 청약 접수 매뉴얼]`, "",
    "📅 일정 (접수 시간은 공고문 확인)", ...(sched.length ? sched : ["- 넣을 수 있는 유형이 없습니다"]),
    "※ 주택형은 공고문 보고 정하기", "※ 마감 전까지 수정·삭제 가능", "",
    "✅ 접수 전 준비", "1. 인증서 휴대폰에 준비 + 로그인 테스트 (2개 이상 권장)", "2. 청약홈에서 청약통장 순위확인서 확인", "",
    "📱 접수 순서", `1. ${siteOf(it)} 접속`, `2. '${short}' → 신청하기`, "3. 인증서 로그인", "4. 공급 유형 선택 (특별공급 / 일반공급)", "5. 주택형 선택", "6. 청약신청서 작성 (아래 입력값)", "7. 청약완료까지 누르고, 신청내역에서 접수 확인!", "",
    "✍️ 입력값", ...people, "",
    "⚠️ 주의", "- 주소는 등본 주소 그대로 (우편번호 포함)", "- 헷갈리는 점수는 낮은 쪽 선택 (높게 적으면 당첨돼도 부적격)", "- 특별공급은 1인 1건만", ...j.notes.map((n) => `- ${n}`), ...conds, "",
    "※ 자동으로 만든 초안입니다. 공고문과 다르면 공고문을 따르세요.",
  ].join("\n");
}
const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function manualBlock(r) {
  const fixed = MANUALS?.[r.it.id];
  const text = fixed || draftManual(r);
  return `<div class="manual">
    <div class="manual-head"><b>공고 접수 매뉴얼</b><span class="badge${fixed ? " fixed" : ""}">${fixed ? "확정본" : "자동 초안"}</span><button class="copy" data-copy="${r.it.id}">카톡용 복사</button></div>
    <pre id="m-${r.it.id}">${esc(text)}</pre>
  </div>`;
}

function renderBasis() {
  const age = (b) => b ? `${new Date().getFullYear() - +b.slice(0, 4) - 1}~${new Date().getFullYear() - +b.slice(0, 4)}세` : "-";
  if (!V.priv) {
    $("basis").innerHTML = [`부부 정보는 잠겨 있습니다. 잠금을 풀면 판정 기준(세대·전입·통장·소득세 납부 연수)이 보입니다.`,
      `청약 규칙표 ${RULES.version} · 점검일 ${RULES.checked}`,
      `공공분양 특공 날짜는 청약홈 데이터에 없어 '공고문 확인'으로 표시. 넣을 단지만 공고문 날짜로 보정(${Object.keys(OVERRIDES.items).length}곳)`].map((x) => `<li>${x}</li>`).join("");
    return;
  }
  const items = PEOPLE.map((p) => `${p.label}: ${p.householder ? "세대주" : "세대원(동거인)"} · ${p.residence.sido} ${p.residence.since.replace("-", ".")} 전입 · 통장 ${p.account.payments}회 이상 · 무주택 · 청년 소득·자산 기준 ${p.youth_income_ok && p.youth_assets_ok ? "통과" : "확인 필요"} · 소득세 납부 연수 ${p.income_tax_years ?? "확인 필요"}`);
  items.push(`부부: ${state.married ? "혼인신고 후(가정)" : "혼인신고 전 · 예비신혼 가능"} · 자녀·임신 없음`);
  items.push(`청약 규칙표 ${RULES.version} · 점검일 ${RULES.checked} · 고덕강일 공고문으로 확인한 항목 외에는 원문 재확인 필요`);
  items.push(`공공분양 특공 날짜는 청약홈 데이터에 없어 '공고문 확인'으로 표시. 넣을 단지만 공고문 날짜로 보정(${Object.keys(OVERRIDES.items).length}곳)`);
  $("basis").innerHTML = items.map((x) => `<li>${x}</li>`).join("");
}

function monthRows(rows) {
  const [y, m] = state.month;
  const key = `${y}-${String(m).padStart(2, "0")}`;
  return rows.filter((r) => r.sched.some((s) => (s.start && s.start.startsWith(key)) || (s.end && s.end.startsWith(key))));
}
function renderFilters(all) {
  const base = monthRows(all);
  $("fchips").innerHTML = FILTERS.map((f) => `<button class="fchip" data-f="${f.id}" aria-pressed="${state.filters.has(f.id)}">${f.label}<span class="c">${base.filter(f.test).length}</span></button>`).join("")
    + (state.filters.size ? `<button class="fchip reset" data-f="reset">필터 지우기</button>` : "");
  for (const [id, v] of [["i-all", "all"], ["i-yes", "yes"], ["i-no", "no"]]) $(id).setAttribute("aria-pressed", String(state.view === v));
}
function render() {
  const all = prepare();
  const rows = all.filter(passFilters);
  renderFilters(all);
  renderCalendar(rows); renderCards(rows, monthRows(all).length); renderBasis();
  for (const [id, on] of [["m-before", !state.married], ["m-after", state.married], ["mv-all", !state.near], ["mv-near", state.near], ["k-apt", !state.all], ["k-all", state.all]]) $(id).setAttribute("aria-pressed", String(on));
}

function init() {
  const c = new Date(DATA.collected_at);
  $("asof").textContent = `청약홈 기준 ${DATA.collected_at.slice(0, 16).replace("T", " ")} 수집 · ${DATA.items.length}건`;
  const hours = (Date.now() - c.getTime()) / 3600e3;
  if (hours > 36) { $("stale").hidden = false; $("stale").textContent = `오래된 정보: 마지막 수집 후 ${Math.floor(hours)}시간이 지났습니다. 넣기 전에 청약홈에서 일정을 확인하세요.`; }
  const t = kst(); state.month = [+t.slice(0, 4), +t.slice(5, 7)];
  const set = (k, v) => { state[k] = v; store.set(`cy.${k}`, v); render(); };
  $("m-before").onclick = () => set("married", false); $("m-after").onclick = () => set("married", true);
  $("mv-all").onclick = () => set("near", false); $("mv-near").onclick = () => { if (!LEASE_END) return flash("잠금을 풀어야 전세 만기를 알 수 있습니다"); set("near", true); };
  $("k-apt").onclick = () => set("all", false); $("k-all").onclick = () => set("all", true);
  $("prev").onclick = () => { let [y, m] = state.month; m--; if (!m) { m = 12; y--; } state.month = [y, m]; render(); };
  $("next").onclick = () => { let [y, m] = state.month; m++; if (m > 12) { m = 1; y++; } state.month = [y, m]; render(); };
  const setView = (v) => { state.view = v; store.set("cy.view", v); render(); };
  $("i-all").onclick = () => setView("all"); $("i-yes").onclick = () => setView("yes"); $("i-no").onclick = () => setView("no");
  $("fchips").addEventListener("click", (e) => {
    const b = e.target.closest(".fchip"); if (!b) return;
    const f = b.dataset.f;
    if (f === "reset") state.filters.clear(); else state.filters.has(f) ? state.filters.delete(f) : state.filters.add(f);
    store.set("cy.filters", [...state.filters]); render();
  });
  $("cards").addEventListener("click", (e) => {
    const cp = e.target.closest(".copy");
    if (cp) {
      const pre = document.getElementById(`m-${cp.dataset.copy}`);
      const done = (msg) => { cp.textContent = msg; setTimeout(() => { cp.textContent = "카톡용 복사"; }, 1800); };
      const selectIt = () => { const rg = document.createRange(); rg.selectNodeContents(pre); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(rg); done("선택됨 · 길게 눌러 복사"); };
      try { navigator.clipboard.writeText(pre.textContent).then(() => done("복사됨"), selectIt); } catch { selectIt(); }
      return;
    }
    const m = e.target.closest(".mark");
    if (m) { saveInterest(m.dataset.id, state.interest[m.dataset.id] === m.dataset.mark ? null : m.dataset.mark); return; }
    const t = e.target.closest(".toggle");
    if (t) { const id = t.dataset.open; state.open.has(id) ? state.open.delete(id) : state.open.add(id); render(); }
  });
  $("pager").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-page]"); if (!b || b.disabled) return;
    state.page = +b.dataset.page; render();
    $("list-title").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  });
  $("grid").addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b) return;
    state.open.add(b.dataset.id);
    const idx = state.list.indexOf(b.dataset.id);
    if (idx >= 0) state.page = Math.floor(idx / PER_PAGE) + 1;
    render();
    const el = document.getElementById(`c-${b.dataset.id}`); if (!el) return;
    el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    el.classList.add("flash"); setTimeout(() => el.classList.remove("flash"), 1600);
  });
  render();
}

boot();
