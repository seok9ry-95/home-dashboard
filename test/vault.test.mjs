// 암호 금고 테스트 (현황판 16번 2차). 테스트용 비밀번호·가상 기록만 쓴다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createKeys, unlock, seal, openLog, checkPassword, emptyLog } from "../scripts/lib/vault.mjs";

const PW = "테스트용 비밀번호 문장 1234";
const fast = { iter: 1000 }; // 테스트만 빠르게. 실제는 600,000회

test("비밀번호 기준: 12자 미만은 거절", () => {
  assert.ok(checkPassword("짧은비번"));
  assert.equal(checkPassword(PW), null);
});

test("잠근 기록은 맞는 비밀번호로만 풀린다", async () => {
  const keys = await createKeys(PW, fast);
  const log = emptyLog();
  log.entries.push(await seal(keys, { key: "sub:x", type: "sub", data: { name: "가상단지" } }));
  const priv = await unlock(keys, PW);
  const { state, broken } = await openLog(priv, log);
  assert.equal(broken, 0);
  assert.equal(state["sub:x"].data.name, "가상단지");
  await assert.rejects(unlock(keys, PW + "x"), /비밀번호가 맞지 않습니다/);
});

test("잠근 결과에 평문이 남지 않는다", async () => {
  const keys = await createKeys(PW, fast);
  const e = await seal(keys, { key: "k", type: "t", data: { secret: "가상단지-평문확인" } });
  const text = JSON.stringify({ keys, e });
  assert.ok(!text.includes("가상단지"));
  assert.ok(!text.includes(PW));
});

test("같은 key는 가장 최근 줄이 이기고, data:null은 지운다", async () => {
  const keys = await createKeys(PW, fast);
  const log = emptyLog();
  log.entries.push(await seal(keys, { key: "interest:a", type: "interest", data: "yes", at: "2026-11-02T10:00:00Z" }));
  log.entries.push(await seal(keys, { key: "interest:a", type: "interest", data: "no", at: "2026-11-02T11:00:00Z" }));
  log.entries.push(await seal(keys, { key: "interest:b", type: "interest", data: "yes", at: "2026-11-02T10:00:00Z" }));
  log.entries.push(await seal(keys, { key: "interest:b", type: "interest", data: null, at: "2026-11-02T12:00:00Z" }));
  const { state } = await openLog(await unlock(keys, PW), log);
  assert.equal(state["interest:a"].data, "no");
  assert.equal(state["interest:b"], undefined);
});

// 저장소에 올라간 금고 파일은 정해진 칸(암호문)만 갖는다 → 평문이 섞여 올라가는 것을 막는다
test("저장소 금고 파일은 암호문 칸만 갖는다", async () => {
  let keys, log;
  try { keys = JSON.parse(await readFile(new URL("../data/private/keys.json", import.meta.url))); } catch { return; }
  assert.deepEqual(Object.keys(keys.public).sort(), ["crv", "kty", "x", "y"]);
  assert.deepEqual(Object.keys(keys.private).sort(), ["ct", "iter", "iv", "kdf", "salt"]);
  assert.ok(keys.private.iter >= 600000);
  try { log = JSON.parse(await readFile(new URL("../data/private/log.json", import.meta.url))); } catch { return; }
  for (const e of log.entries) {
    assert.deepEqual(Object.keys(e).sort(), ["ct", "epk", "iv"]);
    assert.match(e.ct, /^[A-Za-z0-9+/=]+$/);
  }
});
