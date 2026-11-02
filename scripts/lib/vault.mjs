// 암호 금고 (현황판 16번 2차, 15번이 재사용). 브라우저·Node 공용(WebCrypto).
// 자물쇠·열쇠 방식: 자물쇠(공개키)는 저장소에 공개, 열쇠(비밀키)는 부부 비밀번호로 잠가 둔다.
// - 잠그기(seal): 자물쇠만 있으면 누구나 가능 → Claude가 비밀번호 없이 채팅에서 기록을 넣는다
// - 풀기(open): 비밀번호로 열쇠를 꺼내야 가능 → 부부만
// 기록은 고치지 않고 새 줄로 쌓는다. 같은 key의 가장 최근 줄(at 기준)이 현재 값이다.

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const KDF_ITER = 600000; // 비밀번호 → 열쇠 잠금 키 (PBKDF2-SHA256, OWASP 2023 권장치)
export const MIN_PASSWORD = 12;

const b64 = (buf) => { const u = new Uint8Array(buf); let s = ""; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const rand = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const ECDH = { name: "ECDH", namedCurve: "P-256" };

async function passwordKey(password, salt, iter) {
  const base = await subtle.importKey("raw", enc.encode(password.normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, base,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export function checkPassword(password) {
  if (typeof password !== "string" || [...password].length < MIN_PASSWORD) return `비밀번호는 ${MIN_PASSWORD}자 이상이어야 합니다`;
  return null;
}

// 처음 한 번: 자물쇠·열쇠를 만들고 열쇠를 비밀번호로 잠근다. 결과(keys.json)는 공개해도 된다.
export async function createKeys(password, { iter = KDF_ITER } = {}) {
  const bad = checkPassword(password);
  if (bad) throw new Error(bad);
  const pair = await subtle.generateKey(ECDH, true, ["deriveKey"]);
  const pub = await subtle.exportKey("jwk", pair.publicKey);
  const priv = await subtle.exportKey("pkcs8", pair.privateKey);
  const salt = rand(16), iv = rand(12);
  const k = await passwordKey(password, salt, iter);
  const wrapped = await subtle.encrypt({ name: "AES-GCM", iv }, k, priv);
  return {
    schema: 1,
    note: "자물쇠(public)는 공개, 열쇠(private)는 부부 비밀번호로 잠김. 비밀번호 없이는 열 수 없다.",
    created: new Date().toISOString(),
    public: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y },
    private: { kdf: "PBKDF2-SHA256", iter, salt: b64(salt), iv: b64(iv), ct: b64(wrapped) },
  };
}

// 비밀번호로 열쇠를 꺼낸다. 틀리면 Error("비밀번호가 맞지 않습니다").
export async function unlock(keys, password) {
  const p = keys.private;
  const k = await passwordKey(password, unb64(p.salt), p.iter);
  let raw;
  try { raw = await subtle.decrypt({ name: "AES-GCM", iv: unb64(p.iv) }, k, unb64(p.ct)); }
  catch { throw new Error("비밀번호가 맞지 않습니다"); }
  return subtle.importKey("pkcs8", raw, ECDH, false, ["deriveKey"]);
}

const shared = (priv, pubKey) =>
  subtle.deriveKey({ name: "ECDH", public: pubKey }, priv, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);

// 기록 한 줄 잠그기: 자물쇠만 필요. record = { key, type, data, by }
export async function seal(keys, record) {
  const pub = await subtle.importKey("jwk", { ...keys.public, ext: true }, ECDH, false, []);
  const eph = await subtle.generateKey(ECDH, true, ["deriveKey"]);
  const k = await shared(eph.privateKey, pub);
  const iv = rand(12);
  const body = { ...record, at: record.at || new Date().toISOString() };
  const ct = await subtle.encrypt({ name: "AES-GCM", iv }, k, enc.encode(JSON.stringify(body)));
  const e = await subtle.exportKey("jwk", eph.publicKey);
  return { epk: { x: e.x, y: e.y }, iv: b64(iv), ct: b64(ct) };
}

export async function openEntry(privKey, entry) {
  const epk = await subtle.importKey("jwk", { kty: "EC", crv: "P-256", ...entry.epk, ext: true }, ECDH, false, []);
  const k = await shared(privKey, epk);
  const raw = await subtle.decrypt({ name: "AES-GCM", iv: unb64(entry.iv) }, k, unb64(entry.ct));
  return JSON.parse(dec.decode(raw));
}

// 전체 기록을 풀어 key별 최신 값으로 합친다. data가 null이면 지운 것.
export async function openLog(privKey, log) {
  const rows = [];
  let broken = 0;
  for (const e of log.entries || []) {
    try { rows.push(await openEntry(privKey, e)); } catch { broken += 1; }
  }
  rows.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const state = {};
  for (const r of rows) {
    if (r.data === null) delete state[r.key];
    else state[r.key] = r;
  }
  return { state, rows, broken };
}

export const emptyLog = () => ({
  schema: 1,
  note: "잠긴 기록. 한 줄 = 한 번의 변경. 부부 비밀번호로만 열린다.",
  entries: [],
});
