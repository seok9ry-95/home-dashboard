# home-dashboard

부부 내집마련 대시보드. 기준 문서는 PRD(Claude Docs)이며, 이 저장소는 원본 코드와 데이터를 담는다.

## 청약 데이터 자동 수집 (현황판 14번)

- 출처: 공공데이터포털 「한국부동산원_청약홈 분양정보 조회 서비스」
- 범위: 서울·경기 아파트 — APT(민영·국민·신혼희망타운), 무순위·잔여세대, 임의공급, 주택형별 세대수·분양가
- 보관: 접수·발표·계약 일정이 남은 공고 + 지난 60일 공고. 이전 기록은 Git 변경 이력에 남는다
- 결과 파일: `data/cheongyak.json` (`collected_at` = 수집 시각, 36시간 지나면 화면에서 '오래된 정보' 경고)
- 실행: `.github/workflows/collect-cheongyak.yml` — 매일 06:20·18:20(KST), Actions 화면에서 수동 실행 가능
- 순서: 코드 테스트 → 수집 → 데이터 검사 → 통과할 때만 저장. 실패하면 기존 데이터 유지

| 비밀값 이름 | 값 |
|---|---|
| `CHEONGYAK_API_KEY` | 공공데이터포털 인증키(Decoding) |

인증키는 비밀값에만 넣고 코드·채팅·커밋에 쓰지 않는다.

```
npm test                       # 가짜 서버로 수집·검사 로직 테스트
```

공공분양(SH·LH·GH)은 청약홈 데이터에 없어 현황판 17번에서 따로 다룬다.

## 청약 유형 판정 (현황판 16번)

- 규칙표: `data/cheongyak-rules.json` — 숫자·기준과 출처·점검일. 규칙이 바뀌면 이 표만 고친다
- 판정: `scripts/lib/judge.mjs` — 부부 각자 넣을 수 있는 유형, 민영 가점, 추천 1개와 이유 (브라우저·Node 공용)
- 공공분양 날짜 보정: `data/cheongyak-overrides.json` — 청약홈 데이터에 특공 일정이 없어서, 넣을 단지만 공고문 날짜로 덮어쓴다(D22)
- 기준값 테스트: `test/judge.test.mjs` — 고덕강일3단지 판정. 공개 저장소라 실제 개인 정보 대신 조건만 같은 가상 인물을 쓴다
- 화면: `cheongyak/` (GitHub Pages: https://seok9ry-95.github.io/home-dashboard/cheongyak/) — 1차 미리보기와 같은 화면, 공고는 저장소 데이터를 실시간으로 읽는다

## 잠긴 기록 (16번 2차, 15번 재사용)

공개 저장소이므로 개인 정보는 평문으로 올리지 않는다. 자물쇠·열쇠 방식(ECDH P-256 + AES-GCM, 열쇠는 PBKDF2-SHA256 60만 회로 부부 비밀번호에 잠김).

- `data/private/keys.json` — 자물쇠(공개)와 비밀번호로 잠긴 열쇠. `setup.html`에서 부부가 만든다
- `data/private/log.json` — 잠긴 기록. 한 줄 = 한 번의 변경, 같은 key는 가장 최근 줄이 현재 값(data:null은 삭제)
- 기록 종류: `profile`(판정용 부부 정보) · `sub:*`(넣은 청약) · `manual:*`(확정 매뉴얼) · `interest:*`(관심 표시) · `token`(관심 표시 저장용 GitHub 토큰)
- Claude는 비밀번호 없이 잠가서 추가: `node scripts/seal.mjs <기록.plain.json>` (`*.plain.json`은 커밋 금지)
- 화면은 비밀번호로 열고, '이 기기에서 기억'은 꺼낼 수 없는 열쇠만 브라우저에 보관(비밀번호는 저장하지 않음)

## 가계 화면 (현황판 15번)

- 주소: https://seok9ry-95.github.io/home-dashboard/ — 청약 탭과 같은 부부 비밀번호로 연다. 한 기기에서 한 번 '기억'하면 두 화면 다 바로 열림
- 공개 코드: `index.html`(화면 모양 + 잠금 화면), `household/app.js`(계산·화면 코드), `household/boot.mjs`(잠금 해제·데이터 합치기). **숫자와 실명은 없다** — 이름 자리는 `⟦H⟧ ⟦W⟧ ⟦h⟧ ⟦w⟧`로 두고 잠금을 풀면 채운다
- 데이터: `data/private/log.json`의 `hh:*` 기록 (`scripts/lib/household.mjs`가 합침)
  - `hh:<항목>` — asOf·names·target·income·savingTarget·assets·fixed·pledges·pledgeDate·settledBy·settleStart 등. 바뀌면 그 항목 전체를 새 줄로
  - `hh:installments|annual|fixedEnds:<이름>` — 할부·연간 비용·끝나는 달은 **한 건 = 한 줄**. 새 건은 새 줄, 끝난 건은 `data: null` 한 줄. 다른 건은 건드리지 않는다
  - `hh:months:<YYYY-MM>` — 월별 수입·소비 한 줄
  - `hh:detail|fixedList|oneOff|settlements:<YYYY-MM>` — 그달 가맹점 상세·고정비 목록·일회성·결산 기록
- 테스트: `test/household.test.mjs` — 잠갔다 풀어 합치기, 새 달 추가, 공개 파일에 데이터·실명이 없는지

### 월 결산 반영 (Claude)

1. 채팅으로 받은 뱅크샐러드 파일·가계부 합계를 분류해 **바뀐 항목·새 달·새 건 줄만** `*.plain.json`(저장소 밖)으로 만든다
2. `node scripts/seal.mjs <파일.plain.json>` → `log.json`에 잠긴 줄 추가 (비밀번호 불필요)
3. `npm test` 통과 후 커밋·푸시. 화면은 잠긴 기록을 최신본으로 바로 읽는다
4. Claude는 잠긴 기록을 열 수 없으므로 지난 값이 필요한 '목록 통째 다시 쓰기'는 하지 않는다. 목록은 건별 줄로만 더하고 뺀다
- 테스트: 할부 추가·종료 시 다른 할부가 사라지지 않는지, 이름 겹침·빈 이름이면 멈추는지
