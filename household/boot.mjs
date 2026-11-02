// 가계 화면 잠금 해제 (현황판 15번). 청약 탭과 같은 자물쇠·열쇠, 같은 '이 기기에서 기억'을 쓴다.
import { unlock, openLog } from "../scripts/lib/vault.mjs";
import { assemble, fillNames } from "../scripts/lib/household.mjs";

const REPO = "seok9ry-95/home-dashboard";
const RAW = `https://raw.githubusercontent.com/${REPO}/main/`;
const API = `https://api.github.com/repos/${REPO}/contents/`;
const $ = (id) => document.getElementById(id);

// 잠긴 기록은 최신본을 바로 읽는다(Pages 배포 지연 회피). 안 되면 Pages 사본
async function getJson(path) {
  const tries = [
    [`${API}${path}?ref=main&t=${Date.now()}`, { headers: { Accept: "application/vnd.github.raw+json" }, cache: "no-store" }],
    [`${RAW}${path}?t=${Date.now()}`, { cache: "no-store" }],
    [`./${path}`, { cache: "no-store" }],
  ];
  for (const [url, opt] of tries) {
    try { const r = await fetch(url, opt); if (r.ok) return await r.json(); } catch {}
  }
  return null;
}

// 청약 탭과 같은 저장소(IndexedDB "home-dashboard" / kv / priv) — 한 번 열면 두 화면 다 열림
const idb = (mode, fn) => new Promise((res, rej) => {
  const o = indexedDB.open("home-dashboard", 1);
  o.onupgradeneeded = () => o.result.createObjectStore("kv");
  o.onerror = () => rej(o.error);
  o.onsuccess = () => { const tx = o.result.transaction("kv", mode); const q = fn(tx.objectStore("kv")); tx.oncomplete = () => res(q?.result); tx.onerror = () => rej(tx.error); };
});
const remembered = async () => { try { return await idb("readonly", (s) => s.get("priv")); } catch { return null; } };
const remember = async (k) => { try { await idb("readwrite", (s) => s.put(k, "priv")); } catch {} };
const forget = async () => { try { await idb("readwrite", (s) => s.delete("priv")); } catch {} };

const msg = (t) => { $("hh-msg").textContent = t || ""; };
let KEYS = null, LOG = null, started = false;

async function start(priv) {
  if (started) return;
  const { state, broken } = await openLog(priv, LOG || { entries: [] });
  const D = assemble(state);
  if (!D) throw new Error("가계 기록이 아직 없습니다. Claude에게 이전 작업을 요청해 주세요");
  window.__HH = D;
  window.__HH_BROKEN = broken;
  // 이름 자리 채우기: 본문 → 코드 순서
  const names = D.names;
  for (const el of [...document.body.children]) {
    if (el.id === "hh-lock" || el.tagName === "SCRIPT" || el.tagName === "STYLE") continue;
    if (el.outerHTML.includes("⟦")) el.outerHTML = fillNames(el.outerHTML, names);
  }
  const code = await (await fetch(`household/app.js?v=${Date.now()}`, { cache: "no-store" })).text();
  started = true;
  document.body.classList.remove("hh-locked");
  const s = document.createElement("script");
  s.textContent = fillNames(code, names);
  document.body.appendChild(s);
  addCheongyakMenu();
}

// 데스크톱 왼쪽 메뉴에 청약 추가(휴대폰은 더보기 안에 있음)
function addCheongyakMenu() {
  const menu = document.getElementById("menu");
  if (!menu) return;
  // 화면을 옮길 때 메뉴가 다시 그려지므로 빠지면 다시 붙인다
  if (!addCheongyakMenu.watching) {
    addCheongyakMenu.watching = true;
    new MutationObserver(() => addCheongyakMenu()).observe(menu, { childList: true });
  }
  if (menu.querySelector('[href="cheongyak/"]')) return;
  const a = document.createElement("a");
  a.className = "mi"; a.href = "cheongyak/"; a.style.textDecoration = "none"; a.style.color = "inherit";
  a.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5h14v15H5zM5 9h14M9 3v4M15 3v4M8.5 13h2M13.5 13h2M8.5 16.5h2"/></svg>청약`;
  menu.appendChild(a);
}

async function boot() {
  [KEYS, LOG] = await Promise.all([getJson("data/private/keys.json"), getJson("data/private/log.json")]);
  if (!KEYS) { msg("열쇠 파일을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요"); $("hh-btn").disabled = true; return; }
  const saved = await remembered();
  if (saved) {
    $("hh-intro").textContent = "이 기기에서 기억한 열쇠로 여는 중…";
    try { await start(saved); return; } catch (e) { await forget(); msg(e.message); }
    $("hh-intro").textContent = "우리 가계 숫자는 잠겨 있어요. 부부 비밀번호(청약 탭과 같은 것)로 열어 주세요.";
  }
  $("hh-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pw = $("hh-pw"), btn = $("hh-btn");
    btn.disabled = true; btn.textContent = "여는 중…"; msg("");
    try {
      const priv = await unlock(KEYS, pw.value);
      if ($("hh-remember").checked) await remember(priv);
      pw.value = "";
      await start(priv);
    } catch (err) { msg(err.message); }
    finally { btn.disabled = false; btn.textContent = "열기"; }
  });
}

boot();
