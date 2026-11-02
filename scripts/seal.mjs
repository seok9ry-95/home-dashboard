// 기록을 잠가서 data/private/log.json 끝에 붙인다. 비밀번호가 필요 없다(자물쇠만 사용).
// 사용: node scripts/seal.mjs <기록.json>   ← 기록 파일은 저장소 밖(또는 .gitignore된 곳)에 둔다
// 기록 파일 형식: [{ "key": "sub:...", "type": "sub", "data": {...}, "by": "Claude" }, ...]
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { seal, emptyLog } from "./lib/vault.mjs";

const [input] = process.argv.slice(2);
if (!input) { console.error("사용: node scripts/seal.mjs <기록.json>"); process.exit(1); }

const root = new URL("../", import.meta.url);
const keys = JSON.parse(await readFile(new URL("data/private/keys.json", root)));
const logUrl = new URL("data/private/log.json", root);
let log;
try { log = JSON.parse(await readFile(logUrl)); } catch { log = emptyLog(); }

const records = JSON.parse(await readFile(input));
for (const r of Array.isArray(records) ? records : [records]) {
  if (!r.key || !r.type || !("data" in r)) throw new Error(`key·type·data가 필요합니다: ${JSON.stringify(Object.keys(r))}`);
  log.entries.push(await seal(keys, r));
}
await mkdir(new URL("data/private/", root), { recursive: true });
await writeFile(logUrl, JSON.stringify(log, null, 1) + "\n");
console.log(`잠금 ${records.length ?? 1}줄 추가 → 전체 ${log.entries.length}줄`);
