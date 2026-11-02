// 내집마련 대시보드 가계 화면 (현황판 15번). 숫자·실명은 이 파일에 없다.
// 잠금을 풀면 household/boot.mjs가 window.__HH(가계 데이터)를 만들고, ⟦H⟧ 같은 이름 자리를 채운 뒤 이 코드를 실행한다.
// ---- 원래 화면 스크립트 1/4 ----

// ===== 데이터 (단위: 원 · 자산 2026-10-31 두 사람 뱅크샐러드 내보내기(11/01) · 연소득은 원천징수영수증) =====
const DATA = window.__HH;

const RULES = { LTV: { 서울: { 일반: .4, 생애최초: .7, 신생아특례: .7 }, 경기: { 일반: .7, 생애최초: .7, 신생아특례: .7 } }, cap: 60000, DSR: .4, stress: .03, nbCap: 40000, nbHouse: 90000, nbIncome: 13000, nbDTI: .6 };
const ASSUME = { rate: .0466, nbRate: .03, years: 30, cost: .04, rateAsOf: '2026-08 은행 주담대 평균(한국은행)', rateChecked: '2026-10-11', rulesChecked: '2026-10-05' };   // 10/11 A안: 4.2% → 4.66%
// ===== 계산 기준 버전 (현황판 11 · 기준이 바뀔 때만 올림, 화면 수정과 분리) — 집값은 같은 자산(assetsAsOf)에서 다시 계산한 기록값(만원) =====
const BASIS = {
  zoneChecked: '2026-10-10', creditChecked: '2026-10-11', savingDecided: '2026-10-10',
  history: [
    { v: '2026.10-2', from: '2026-10-11', assetsAsOf: '2026-10-09', buy: 71900,
      changes: ['주담대 금리 가정 4.2% → 4.66% (2026-08 한국은행 평균)', '신용대출 규칙 추가: 연소득 100%·1억 상한, 시뮬레이터 토글(기본 꺼짐이라 기본 집값엔 영향 없음)', '월 상환 예측 금리(최소·중간·최대) 추가'],
      why: '4.2%는 근거가 오래됐고 낙관적이라 집값이 실제보다 높게 나왔음' },
    { v: '2026.10-1', from: '2026-10-10', assetsAsOf: '2026-10-09', buy: 74100,
      changes: ['첫 기준: 대출 규칙표(10/05 조사), 금리 4.2%, 만기 30년, 부대비용 4%', '월 저축 270만 확정 (이전 화면의 300만은 근거 없던 값)', '규제지역 = 토지거래허가구역 범위(서울 25구 + 경기 12곳)'],
      why: '계산기·대시보드·PRD 숫자를 하나로 맞춤' },
  ],
};
const PV = (r, n, p) => r === 0 ? p * n : p * (1 - Math.pow(1 + r, -n)) / r;
const PMT = (r, n, v) => r === 0 ? v / n : v * r / (1 - Math.pow(1 + r, -n));
function loan(s, inc) {
  const income = s.incomeBasis === '남편 단독' ? inc.H : inc.H + inc.W, n = ASSUME.years * 12, nb = s.type === '신생아특례';
  const ltv = s.price * RULES.LTV[s.region][s.type];
  const cap = nb ? Math.min(RULES.cap, RULES.nbCap) : RULES.cap;
  const repay = nb ? PV(ASSUME.nbRate / 12, n, income * RULES.nbDTI / 12) : PV((ASSUME.rate + RULES.stress) / 12, n, income * RULES.DSR / 12);
  const blocked = nb && (s.price > RULES.nbHouse || income > RULES.nbIncome);
  const amount = blocked ? 0 : Math.min(ltv, cap, repay);
  const reason = blocked ? '특례 조건' : amount === ltv ? 'LTV' : amount === cap ? '금액 상한' : '소득(DSR)';
  return { amount, ltv, repay, reason, cash: s.price * (1 + ASSUME.cost) - amount, monthly: PMT((nb ? ASSUME.nbRate : ASSUME.rate) / 12, n, amount) };
}
function affordable(s, inc, future) { let lo = 0, hi = 300000; for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (loan({ ...s, price: mid }, inc).cash <= future) lo = mid; else hi = mid; } return lo; }

// ===== 파생 값 =====
const M = v => v / 10000;                                   // 원 → 만원
const A = DATA.assets;
const sumP = p => p.cash + p.invest + p.sub + p.etc;
const finH = M(sumP(A.H)), finW = M(sumP(A.W));
const jeonseNet = M(A.jeonse.deposit - A.jeonse.loan);
const netNow = finH + finW + jeonseNet;
const inc = { H: M(DATA.income.H), W: M(DATA.income.W) };
const T = { ...DATA.target, price: M(DATA.target.price) };
const asOf = new Date(DATA.asOf + 'T00:00:00');
const [ty, tm] = T.date.split('-').map(Number);
const monthsLeft = Math.max(1, (ty - asOf.getFullYear()) * 12 + tm - (asOf.getMonth() + 1));
const save = M(DATA.savingTarget);
const future = netNow + save * monthsLeft;
const L8 = loan(T, inc);
const canBuy = affordable(T, inc, future);
const needNow = Math.max(0, L8.cash - netNow);
const needPerMonth = needNow / monthsLeft;
const gapAtTarget = Math.max(0, L8.cash - future);
const monthsToGoal = save > 0 ? Math.ceil(needNow / save) : Infinity;
const extraMonths = Math.max(0, monthsToGoal - monthsLeft);

// ===== 포맷 =====
const eok = v => (v / 10000).toFixed(Math.abs(v) >= 100000 ? 1 : 2).replace(/\.?0+$/, '') + '억';
const amt = v => Math.abs(v) >= 10000 ? eok(v) : man(v);
const eok1 = v => (v / 10000).toFixed(1) + '억';
const man = v => Math.round(v).toLocaleString('ko-KR') + '만';
const sman = v => (v > 0 ? '+' : v < 0 ? '−' : '') + man(Math.abs(v));
const ym = s => { const [y, m] = s.split('-'); return `${y}.${m}`; };
const mon = s => Number(s.split('-')[1]);
const yearsMonths = n => { const y = Math.floor(n / 12), m = n % 12; return (y ? y + '년 ' : '') + (m ? m + '개월' : '').trim(); };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = s => document.querySelector(s);
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 1800); }
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

// ===== 호버/터치 공용: 마우스는 올리면 보이고, 손가락은 탭하면 고정, 바깥을 탭하면 닫힘 =====
const HOVERS = [];
function hoverable(sel, key, get, set) {
  const el = $(sel), pick = e => { const c = e.target.closest(`[data-${key}]`); return c ? +c.dataset[key] : null; };
  el.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; const v = pick(e); if (v !== get()) set(v); });
  el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && get() !== null) set(null); });
  el.addEventListener('pointerup', e => { if (e.pointerType === 'mouse') return; const v = pick(e); if (v !== null && v !== get()) set(v); });
  el.addEventListener('contextmenu', e => e.preventDefault());
  HOVERS.push({ el, get, set });
}
document.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') return; HOVERS.forEach(h => { if (!h.el.contains(e.target) && h.get() !== null) h.set(null); }); });

// 툴팁이 그래프 밖으로 나가지 않게: 막대 옆(넓은 화면) 또는 막대 위 가운데(좁은 화면)에 두고 그래프 폭 안으로 당김
function clampTip(sel) {
  const box = $(sel), tip = box.querySelector('.cl.on .tip'); if (!tip) return;
  const col = tip.parentElement, b = box.getBoundingClientRect(), c = col.getBoundingClientRect();
  tip.style.right = 'auto'; tip.style.left = '0px';
  const tw = tip.offsetWidth, colX = c.left - b.left, narrow = b.width < 640;
  let x = narrow ? colX + c.width / 2 - tw / 2 : (colX + c.width / 2 + 34 + tw <= b.width ? colX + c.width / 2 + 34 : colX + c.width / 2 - 34 - tw);
  x = Math.max(0, Math.min(x, b.width - tw));
  tip.style.left = (x - colX) + 'px';
  if (narrow) tip.style.top = '0px';
}

// ===== 메뉴 =====
const MENUS = [
  ['홈', 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z', true],
  ['시뮬레이터', 'M4 7h9M17 7h3M4 17h3M11 17h9M13 7a2 2 0 1 0 4 0a2 2 0 1 0-4 0M7 17a2 2 0 1 0 4 0a2 2 0 1 0-4 0'],
  ['월 결산', 'M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM4 10h16M8 3v5M16 3v5'],
  ['계산 기준', 'M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M9.5 13h6M9.5 17h6'],
];
const icon = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
$('#menu').innerHTML = MENUS.map(([l, d, on]) => on
  ? `<span class="mi on" aria-current="page">${icon(d)}${l}</span>`
  : `<button class="mi soon" type="button" data-soon="${l}" title="다음 단계에서 열려요">${icon(d)}${l}</button>`).join('');
document.addEventListener('click', e => { const s = e.target.closest('[data-soon]'); if (s) toast(`${s.dataset.soon} 화면은 다음 단계에서 열려요`); });

// ===== 보는 사람 =====
let viewer = store.get('nest-viewer') === 'W' ? 'W' : 'H';
function renderViewer() {
  $('#viewerName').textContent = `${DATA.names[viewer]} 보는 중`;
  $('#avH').className = 'av h' + (viewer === 'H' ? ' ring-h' : '');
  $('#avW').className = 'av w' + (viewer === 'W' ? ' ring-w' : '');
}
$('#viewer').addEventListener('click', () => { viewer = viewer === 'H' ? 'W' : 'H'; store.set('nest-viewer', viewer); renderViewer(); });

// ===== 다짐 / 다음 결산 =====
const settledNow = !!(DATA.settlements || {})[DATA.asOf.slice(0, 7)];   // 자산 기준달 결산이 끝났으면 다음 달 다짐·결산을 보여줌
const curMonth = settledNow ? asOf.getMonth() % 12 + 2 - (asOf.getMonth() === 11 ? 12 : 0) : asOf.getMonth() + 1;
$('#pledgeTitle').textContent = `${curMonth}월 다짐`;
$('#pledges').innerHTML = [['H', '남편', 'h'], ['W', '아내', 'w']].map(([k, role, c]) => {
  const t = DATA.pledges[k];
  return `<div class="pl-row"><span class="av ${c}">${DATA.names[k][0]}</span><span class="pl-role">${role}</span>
    <span class="pl-text ${t ? 'set' : 'empty'}">${t ? esc(t) + ` <span style="font-size:11px;color:var(--ph);font-weight:400">${DATA.pledgeDate}</span>` : `아직 없어요 · ${DATA.names[k]}의 다짐 한 가지를 채팅에 알려주세요`}</span></div>`;
}).join('');
const nextM = curMonth === 12 ? 1 : curMonth + 1;
$('#ctaT1').textContent = `${curMonth}월 결산 · ${String(nextM).padStart(2, '0')}.01~${String(nextM).padStart(2, '0')}.03`;

// ===== 히어로 =====
const pct = Math.round(canBuy / T.price * 100);
$('#goalLegend').textContent = `목표 ${eok(T.price)}`;
$('#goalSentence').innerHTML = `<span class="hl">${ty}년 ${tm}월</span>까지 <span class="hl">${esc(T.label)}</span> <span class="amt">${eok(T.price)}</span> <span class="rest">아파트</span>`;
$('#leftPill').textContent = `${monthsLeft}개월 남음`;
const gap = Math.max(0, T.price - canBuy);
$('#eq').innerHTML = `
  <div class="eqi"><span class="op" aria-hidden="true"></span><div><div class="t">목표</div><div class="v">${eok(T.price)}</div><div class="s">${T.type} · 소득 ${T.incomeBasis}</div></div></div>
  <div class="eqi"><span class="op" aria-hidden="true">−</span><div><div class="t">지금 추세로 살 수 있는 집</div><div class="v" style="color:var(--good)">${eok1(canBuy)}</div><div class="s">월 ${man(save)} 저축 가정 · 목표의 ${pct}%</div></div></div>
  <div class="eqi"><span class="op" aria-hidden="true">=</span><div><div class="t">목표와의 격차</div><div class="v" style="color:${gap ? 'var(--warn)' : 'var(--good)'}">${gap ? eok1(gap) : '달성'}</div><div class="s">${extraMonths ? `이 추세면 <b style="color:var(--warn)">+${yearsMonths(extraMonths)}</b> · ` : ''}월 <b style="color:var(--ink)">${man(Math.ceil(needPerMonth))}</b>이면 제때</div></div></div>`;

// 집값 추이: 지금부터 목표일까지 3개월 간격 예상
const steps = []; for (let k = 0; k <= monthsLeft; k += 3) steps.push(k); if (steps[steps.length - 1] !== monthsLeft) steps.push(monthsLeft);
const gData = steps.map(k => {
  const d = new Date(asOf.getFullYear(), asOf.getMonth() + k, 1);
  const a = netNow + save * k, price = affordable(T, inc, a), ln = loan({ ...T, price }, inc).amount;
  return { k, label: `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, '0')}`, title: k === 0 ? `${asOf.getFullYear()}년 ${asOf.getMonth() + 1}월 · 현재 (지금 산다면)` : `${d.getFullYear()}년 ${d.getMonth() + 1}월 · 예상`, a, price, ln };
});
let gHover = null;
function renderG() {
  const box = $('#gChart'), GMAX = Math.ceil(Math.max(T.price * 1.1, ...gData.map(g => g.a + g.ln)) / 10000) * 10000;
  const H = 200, B = 226, y = v => B - v / GMAX * H, act = gHover ?? (box.clientWidth >= 640 ? 0 : -1);
  const tickVals = []; for (let v = 0; v <= GMAX; v += GMAX > 80000 ? 20000 : 10000) tickVals.push(v);
  let h = tickVals.map(v => `<div class="tick${v ? '' : ' zero'}" style="top:${y(v)}px"><span>${v / 10000}억</span></div>`).join('');
  h += `<div class="goal-line" style="top:${y(T.price)}px"><span>목표 ${eok(T.price)}</span></div>`;
  h += `<div class="cols">` + gData.map((g, i) => {
    const now = i === 0, on = act === i, hl = on || now;
    const ha = g.a / GMAX * H, hn = Math.max(0, g.ln / GMAX * H - 3);
    const tipSide = i >= gData.length - 2 ? 'right' : 'left';
    return `<div class="cl${on ? ' on' : ''}${now ? ' cur' : ' future'}" data-g="${i}">
      <div class="vtop" style="bottom:${24 + ha + hn + 9}px">${now ? '지금 ' + eok1(g.price) : Math.round(g.price / T.price * 100) + '%'}</div>
      <div class="stack" style="bottom:24px"><div style="height:${ha}px;background-color:${hl ? 'var(--lime)' : 'var(--lime2)'};background-image:${now ? 'var(--hatch)' : 'none'};opacity:${now || on ? 1 : .75}"></div><div style="height:${hn}px;background:${hl ? 'var(--ink)' : '#C9C9C6'};opacity:${now || on ? 1 : .75}"></div></div>
      <div class="lab">${now ? '현재' : g.label}</div>
      <div class="tip" style="top:${Math.max(0, y(g.a + g.ln) - 70)}px;${tipSide}:calc(50% + 34px)">
        <div class="tt">${g.title}</div>
        <div class="tg"><i style="background:var(--good)"></i><span>살 수 있는 집</span><b>${eok1(g.price)}</b>
          <i></i><span>목표 달성률</span><b style="color:var(--good)">${Math.round(g.price / T.price * 100)}%</b>
          <i style="background:var(--lime)"></i><span>${g.k ? '예상 자산' : '현재 자산'}</span><b>${eok(g.a)}</b>
          <i style="background:var(--ink)"></i><span>대출 가능</span><b>${eok1(g.ln)}</b></div></div></div>`;
  }).join('') + `</div>`;
  box.innerHTML = h;
  clampTip('#gChart');
}
hoverable('#gChart', 'g', () => gHover, v => { gHover = v; renderG(); });
$('#gNote').textContent = `현재 순자산 ${eok(netNow)}(${DATA.asOf.replace(/-/g, '.')} 기준)에 월 ${man(save)}씩 더한 예상이에요. 대출은 ${T.region} ${T.type}·소득 ${T.incomeBasis}, DSR 40%·스트레스 금리 3%p 기준. 규칙은 2026-10 2차 자료라 계약 전 은행 확인이 필요해요.`;

// ===== 월별 =====
const ANN_M = M((DATA.annual || []).reduce((a, x) => a + x[2], 0) / 12);   // 연간 정기비용 ÷ 12 (만원)
const MS = DATA.months.map(r => { const g = M((r.giftH || 0) + (r.giftW || 0)), i = M(r.incH + r.incW) + g, x = M(r.expH + r.expW);
  const o = (DATA.oneOff || {})[r.m] || { H: 0, W: 0, ann: 0 }, one = M(o.H + o.W), annPaid = M(o.ann || 0);
  const locked = M(r.locked || 0), base = (i - g) - (x - one - annPaid + ANN_M) - locked;   // 쓸 수 있는 저축 = 전체 저축 − 묶인 저축(종신보험·퇴직연금)   // 쓸 수 있는 저축: 축의금·일회성 지출 빼고, 연간 비용은 12로 나눠 반영
  return { ...r, gift: g, inc: i, exp: x, sav: i - x, one, annPaid, base, locked }; });
const SET = MS.filter(r => !r.partial);
const last = SET[SET.length - 1], prev = SET[SET.length - 2];
const R3 = SET.slice(-3), base3 = R3.reduce((a, r) => a + r.base, 0) / R3.length;
const dpct = (a, b) => b ? (a - b) / Math.abs(b) * 100 : 0;
const arrow = (up) => `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="${up ? 'M4 17l6-6 4 4 6-8M14 7h6v6' : 'M4 7l6 6 4-4 6 8M14 17h6v-6'}"/></svg>`;
function kpi(label, v, p, goodWhenUp) {
  const up = v >= p, good = goodWhenUp ? up : !up, flip = p <= 0 || v <= 0;
  const delta = flip ? `${up ? '+' : '−'}${man(Math.abs(v - p))}` : `${Math.abs(dpct(v, p)).toFixed(1)}%`;
  return `<div><div class="kl">${label}</div><div class="kv">${Math.round(v).toLocaleString('ko-KR')}<small>만</small></div>
    <div class="kd"><span class="${good ? 'up' : 'dn'}" style="display:flex;align-items:center;gap:3px">${arrow(up)}${delta}</span> 전월 대비</div></div>`;
}
$('#kpis').innerHTML = kpi(`${mon(last.m)}월 수입`, last.inc, prev.inc, true) + kpi(`${mon(last.m)}월 소비`, last.exp, prev.exp, false) + kpi(`${mon(last.m)}월 쓸 수 있는 저축`, last.base, prev.base, true);

let fView = store.get('nest-fview') === '수입·소비' ? '수입·소비' : '저축', fHover = null, fPeriod = '월';
// 기간 묶음: 결산된 달로 분기·반기·연을 만들고, 완성된 묶음이 2개 이상일 때만 연다
const PER = { 월: 1, 분기: 3, 반기: 6, 연: 12 };
const gKey = (m, p) => { const [y, mo] = m.split('-').map(Number); return p === '월' ? m : p === '분기' ? `${y}Q${Math.ceil(mo / 3)}` : p === '반기' ? `${y}H${mo <= 6 ? 1 : 2}` : `${y}`; };
const gLabel = (k, p) => p === '월' ? `${mon(k)}월` : p === '연' ? k : `${k.slice(2, 4)}${k.slice(4)}`;
const gTitle = (k, p) => p === '월' ? `${k.replace('-', '년 ')}월` : p === '분기' ? `${k.slice(0, 4)}년 ${k.slice(5)}분기` : p === '반기' ? `${k.slice(0, 4)}년 ${k.endsWith('1') ? '상' : '하'}반기` : `${k}년`;
function series(p) {
  const map = new Map();
  MS.forEach(r => { const k = gKey(r.m, p); const g = map.get(k) || { k, inc: 0, exp: 0, sav: 0, gift: 0, one: 0, base: 0, n: 0, partial: false, memos: [] };
    g.inc += r.inc; g.exp += r.exp; g.sav += r.sav; g.gift += r.gift; g.one += r.one; g.base += r.base; g.n += r.partial ? 0 : 1; g.partial = g.partial || !!r.partial; if (r.memo && p === '월') g.memos.push(r.memo); map.set(k, g); });
  return [...map.values()].map(g => ({ ...g, partial: g.partial || g.n < PER[p], label: gLabel(g.k, p) + (g.partial || g.n < PER[p] ? '·진행' : ''), title: gTitle(g.k, p) + (g.partial || g.n < PER[p] ? ' · 진행 중' : (p === '월' ? ' 결산' : '')), memo: g.memos.join(' · ') }));
}
function unlockAt(p) {
  if (p === '월') return null;
  const lastM = SET[SET.length - 1].m; let [y, mo] = lastM.split('-').map(Number);
  const settled = SET.map(r => r.m);
  for (let i = 0; i < 60; i++) {
    const done = new Map(); settled.forEach(m => { const k = gKey(m, p); done.set(k, (done.get(k) || 0) + 1); });
    if ([...done.values()].filter(n => n >= PER[p]).length >= 2) return i === 0 ? null : `${y}년 ${mo}월`;
    mo++; if (mo > 12) { mo = 1; y++; } settled.push(`${y}-${String(mo).padStart(2, '0')}`);
  }
  return '나중';
}
function renderPeriods() {
  $('#fPeriods').innerHTML = Object.keys(PER).map(p => { const u = unlockAt(p);
    return u ? `<button type="button" aria-disabled="true" data-lock="${p} 보기는 ${u} 결산 후 열려요" title="${u} 결산 후 열려요">${p}</button>`
             : `<button type="button" data-period="${p}" aria-pressed="${p === fPeriod}">${p}</button>`; }).join('');
}
$('#fPeriods').addEventListener('click', e => { const b = e.target.closest('[data-period]'); if (b) { fPeriod = b.dataset.period; fHover = null; renderPeriods(); renderF(); } });
document.addEventListener('click', e => { const l = e.target.closest('[data-lock]'); if (l) toast(l.dataset.lock); });
function renderF() {
  $('#vSav').setAttribute('aria-pressed', fView === '저축'); $('#vFlow').setAttribute('aria-pressed', fView !== '저축');
  $('#fLegend').innerHTML = fView === '저축'
    ? `<span><i style="background:var(--lime)"></i>쓸 수 있는 저축(+)</span><span><i style="background:var(--orange)"></i>마이너스</span><span style="color:var(--ph)">축의금·일회성 지출 제외</span>`
    : `<span><i style="background:var(--lemon)"></i>수입</span><span><i style="background:var(--orange)"></i>소비</span>`;
  const SER = series(fPeriod);
  const isSav = fView === '저축', H = 186, B = 226, cur = SER.length - 1;
  const hi = isSav ? Math.max(0, ...SER.map(r => r.base)) : Math.max(...SER.map(r => Math.max(r.inc, r.exp)));
  const lo = isSav ? Math.min(0, ...SER.map(r => r.base)) : 0;
  const span = (hi - lo) || 1, zeroY = B - (0 - lo) / span * H, py = v => B - (v - lo) / span * H;
  const step = span > 20000 ? 10000 : span > 8000 ? 5000 : span > 2000 ? 1000 : 500; const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1; v += step) ticks.push(v);
  let h = ticks.map(v => `<div class="tick${v ? '' : ' zero'}" style="top:${py(v)}px"><span>${v === 0 ? '0' : (v < 0 ? '−' : '') + (Math.abs(v) >= 10000 ? (Math.abs(v) / 10000).toFixed(1) + '억' : (Math.abs(v) >= 1000 ? (Math.abs(v) / 1000) + '천' : Math.abs(v)))}</span></div>`).join('');
  h += `<div class="cols">` + SER.map((r, i) => {
    const on = fHover === i, isCur = i === cur, hl = on || isCur, side = i >= SER.length - 2 ? 'right' : 'left';
    let bars;
    if (isSav) {
      const hgt = Math.max(3, Math.abs(r.base) / span * H), top = r.base >= 0 ? zeroY - hgt : zeroY;
      bars = `<div style="position:absolute;left:50%;transform:translateX(-50%);width:min(50px,70%);top:${top}px;height:${hgt}px;border-radius:5px;background-color:${r.base >= 0 ? (hl ? 'var(--lime)' : 'var(--lime2)') : (hl ? 'var(--orange)' : '#FBD3AE')};background-image:${isCur ? 'var(--hatch)' : 'none'}"></div>`;
    } else {
      const hi1 = Math.max(3, r.inc / span * H), hx = Math.max(3, r.exp / span * H);
      bars = `<div style="position:absolute;left:50%;transform:translateX(-50%);bottom:24px;width:min(50px,70%);display:flex;gap:3px;align-items:flex-end">
        <div style="flex:1;height:${hi1}px;border-radius:5px;background-color:${hl ? 'var(--lemon)' : '#F8F0A8'};background-image:${isCur ? 'var(--hatch)' : 'none'}"></div>
        <div style="flex:1;height:${hx}px;border-radius:5px;background:${hl ? 'var(--orange)' : '#FBD3AE'}"></div></div>`;
    }
    const rate = r.inc ? Math.round((isSav ? r.base / (r.inc - r.gift) : r.exp / r.inc) * 100) : 0;
    const tipTop = Math.max(0, Math.min(py(Math.max(isSav ? r.base : r.sav, 0)), isSav ? zeroY : py(Math.max(r.inc, r.exp))) - 10);
    const d = (a, b, inv) => { if (prev === undefined || b === undefined) return ''; const p = dpct(a, b); const good = inv ? p <= 0 : p >= 0; return `<em style="font-style:normal;font-size:11px;font-weight:600;color:${good ? 'var(--good)' : 'var(--warn)'}">${p > 0 ? '+' : ''}${p.toFixed(0)}%</em>`; };
    const pr = SER[i - 1];
    return `<div class="cl${on ? ' on' : ''}${isCur ? ' cur' : ''}" data-f="${i}">${bars}
      <div class="lab">${r.label}</div>
      <div class="tip" style="top:${tipTop}px;${side}:calc(50% + 34px);min-width:200px">
        <div class="tt">${r.title}</div>
        <div class="tg" style="grid-template-columns:auto 1fr auto auto">
          <i style="background:var(--lime)"></i><span>쓸 수 있는 저축</span><b>${sman(r.base)}</b><em style="font-style:normal;font-size:11px;font-weight:600;color:${r.base >= save * (r.n || 1) ? 'var(--good)' : 'var(--warn)'}">${r.partial ? '' : r.base >= save * (r.n || 1) ? '달성' : '미달'}</em>
          <i></i><span>실제 저축</span><b>${sman(r.sav)}</b>${pr ? d(r.sav, pr.sav) : '<em></em>'}
          <i></i><span>${isSav ? '저축률' : '소비율'}</span><b>${rate}%</b><em></em>
          <i style="background:var(--lemon)"></i><span>수입</span><b>${man(r.inc)}</b>${pr ? d(r.inc, pr.inc) : '<em></em>'}
          ${r.gift ? `<i></i><span>└ 축의금</span><b>${man(r.gift)}</b><em></em>` : ''}
          <i style="background:var(--orange)"></i><span>소비</span><b>${man(r.exp)}</b>${pr ? d(r.exp, pr.exp, true) : '<em></em>'}
          ${r.one ? `<i></i><span>└ 일회성</span><b>${man(r.one)}</b><em></em>` : ''}</div>
        ${r.memo ? `<div class="memo">${esc(r.memo)}</div>` : ''}</div></div>`;
  }).join('') + `</div>`;
  $('#fChart').innerHTML = h;
  clampTip('#fChart');
}
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { fView = b.dataset.view; fHover = null; store.set('nest-fview', fView); renderF(); }));
hoverable('#fChart', 'f', () => fHover, v => { fHover = v; renderF(); });

// ===== 저축 목표 / 레버 =====
const savPct = Math.max(0, Math.min(100, base3 / save * 100));
$('#savBar').style.width = savPct + '%';
$('#savNow').innerHTML = `최근 3개월 평균 ${sman(base3)} <span style="color:${base3 >= save ? 'var(--good)' : 'var(--warn)'}">${base3 >= save ? '달성' : '미달'}</span>`;
$('#savGoal').textContent = '목표 ' + man(save);
$('#savMonths').innerHTML = R3.map(r => `<span class="sm ${r.base >= save ? 'ok' : 'no'}"><b>${mon(r.m)}월</b> ${sman(r.base)}</span>`).join('');
$('#savNote').textContent = `달성 여부는 최근 3개월 평균으로 보고, 달마다도 표시해요. 제때 ${eok(T.price)}에 닿으려면 월 ${man(Math.ceil(needPerMonth))}이 필요해요. 고정비(사라지는 돈)는 연간 비용 ÷ 12 포함 월 약 ${man(M(DATA.fixed.total) + ANN_M)}이에요.`;

// ===== 소비 구성 =====
const CATS = [['house', '주거·통신', 'var(--orange)'], ['food', '식비·카페', 'var(--orange2)'], ['move', '교통·자동차', 'var(--lemon)'], ['shop', '쇼핑·생활', 'var(--lime2)'], ['trip', '여행·여가', 'var(--lime)'], ['etc', '보험·금융·기타', '#E4E4E1']];
let spMonth = SET.length - 1, spHover = null, spMode = 'all', spOpen = null;
function donut(segs, total, hover, r, w) {
  const C = 2 * Math.PI * r; let acc = 0;
  return `<svg viewBox="0 0 150 150" aria-hidden="true">` + segs.map((s, i) => {
    const len = s.v / total * C, off = -acc; acc += len;
    const on = hover === i, dim = hover !== null && !on;
    return `<circle cx="75" cy="75" r="${r}" fill="none" stroke="${s.color}" stroke-width="${on ? w + 6 : w}" stroke-dasharray="${Math.max(len - 2, 0)} ${C}" stroke-dashoffset="${off}" opacity="${dim ? .4 : 1}"></circle>`;
  }).join('') + `</svg>`;
}
const FGRPS = [['주거', 'var(--orange)'], ['할부', 'var(--orange2)'], ['보험', 'var(--lemon)'], ['통신', 'var(--lime2)'], ['구독', 'var(--lime)'], ['가족', '#CFC8B8'], ['공과금', '#E4E4E1']];
const whoTag = w => `<span class="who ${w || 'N'}" title="${w ? DATA.names[w] : ''}">${w ? DATA.names[w][0] : '·'}</span>`;
function itemRow(n, w, amt, extra) { return `<div class="di">${whoTag(w)}<span class="nm">${esc(n)}</span>${extra || ''}<span class="am">${amt < 10000 ? amt.toLocaleString('ko-KR') + '원' : amt < 100000 ? (amt / 10000).toFixed(1).replace(/\.0$/, '') + '만' : man(M(amt))}</span></div>`; }
function renderSpend() {
  const r = SET[spMonth];
  $('#spMonths').innerHTML = SET.map((x, i) => `<button type="button" data-sp="${i}" aria-pressed="${i === spMonth}">${mon(x.m)}월</button>`).join('');
  document.querySelectorAll('#spMode [data-spm]').forEach(b => b.setAttribute('aria-pressed', b.dataset.spm === spMode));
  let segs, total, center, list = '';
  if (spMode === 'fixed') {
    const fl = [...(DATA.fixedList[r.m] || []), ...(DATA.annual || []).map(a => [a[0], a[1], Math.round(a[2] / 12), a[3], `연 ${(a[2] / 10000).toFixed(1).replace(/\.0$/, '')}만 ÷ 12 · ${a[4]} 납부`])].sort((a, b) => b[2] - a[2]);
    segs = FGRPS.map(([g, color]) => ({ key: g, label: g, color, v: M(fl.filter(x => x[3] === g).reduce((a, x) => a + x[2], 0)) })).filter(x => x.v > 0);
    total = segs.reduce((a, x) => a + x.v, 0);
    $('#spSub').textContent = `${r.m.replace('-', '년 ')}월 · 매달 같은 곳에 나가는 돈(사라지는 돈)`;
    const pick = spOpen && segs.find(x => x.key === spOpen) ? spOpen : null;
    const items = fl.filter(x => !pick || x[3] === pick);
    list = `<div class="dlist"><div class="dh">${pick ? pick + ' 고정비' : '고정비 전체'} <span>${items.length}건 · ${man(M(items.reduce((a, x) => a + x[2], 0)))} · 큰 순서</span></div>
      ${items.map(x => itemRow(x[0], x[1], x[2], `${x[4] ? `<span class="fx" style="background:var(--line2);color:var(--desc)">${x[4]}</span>` : ''}${(DATA.fixedEnds || {})[x[0]] ? `<span class="fx" style="background:var(--orangebg);color:var(--warn)">${DATA.fixedEnds[x[0]]}</span>` : ''}<span class="fgrp">${x[3]}</span>`)).join('')}
      <div class="note" style="margin-top:8px">소비 ${man(M(r.expH + r.expW))} 중 고정비 ${Math.round(total / M(r.expH + r.expW) * 100)}%. ${(() => { const ins = fl.filter(x => x[3] === '할부').reduce((a, x) => a + x[2], 0), endAmt = fl.filter(x => (DATA.fixedEnds || {})[x[0]]).reduce((a, x) => a + x[2], 0); return `할부 ${man(M(ins))}이 고정비의 ${Math.round(M(ins) / total * 100)}%예요.` + (endAmt ? ` 완납·종료되는 할부 ${man(M(endAmt))}이 11월부터 빠지면 그만큼 저축 여력이 생겨요.` : ''); })()} 1년에 한 번 나가는 비용은 12로 나눠 넣었어요.</div></div>`;
  } else {
    segs = CATS.map(([k, label, color]) => ({ key: k, label, color, v: M(r.cat[k] || 0) })).filter(x => x.v > 0);
    total = segs.reduce((a, x) => a + x.v, 0);
    $('#spSub').textContent = `${r.m.replace('-', '년 ')}월 · 항목을 누르면 어디에 썼는지 보여요`;
    const pick = spOpen && segs.find(x => x.key === spOpen) ? segs.find(x => x.key === spOpen) : null;
    if (pick) {
      const items = (DATA.detail[r.m] || {})[pick.key] || [];
      list = `<div class="dlist"><div class="dh">${pick.label} <span>${man(pick.v)} · 큰 순서 · <b style="color:var(--limeink);background:var(--lime2);border-radius:4px;padding:0 4px;font-weight:700">고정</b> = 매달 나가는 돈</span></div>
        ${items.map(x => itemRow(x[0], x[1], x[2], `${x[4] === 1 ? '<span class="fx">고정</span>' : x[4] === 2 ? '<span class="fx" style="background:var(--lemon);color:var(--ink)">일회성</span>' : ''}<span class="cnt">${x[3]}건</span>`)).join('')}</div>`;
    } else { const ol = ((DATA.oneOff || {})[r.m] || {}).list || [];
      list = (ol.length ? `<div class="dlist"><div class="dh">일회성 지출 <span>${man(r.one)} · 쓸 수 있는 저축 계산에서 빠짐</span></div>
        ${ol.slice(0, 6).map(x => itemRow(x[0], x[1], x[2], `<span class="fgrp">${x[3]}</span>`)).join('')}${ol.length > 6 ? `<div class="note" style="margin-top:6px">그 외 ${ol.length - 6}건 ${man(M(ol.slice(6).reduce((a, x) => a + x[2], 0)))}</div>` : ''}</div>` : '')
        + `<div class="note" style="margin-top:12px">위 항목을 누르면 가맹점별 금액이 펼쳐져요. 고정비만 보려면 ‘고정비’를 누르세요.</div>`; }
  }
  const hv = spHover !== null && segs[spHover] ? segs[spHover] : null;
  $('#spend').innerHTML = `<div class="donut">${donut(segs, total, spHover, 60, 18)}<div class="c"><b>${man(hv ? hv.v : total)}</b><span>${hv ? `${hv.label} · ${Math.round(hv.v / total * 100)}%` : `${mon(r.m)}월 ${spMode === 'fixed' ? '고정비' : '소비 합계'}`}</span></div></div>
    <div class="dl">${segs.map((x, i) => `<div class="dr${spHover === i || spOpen === x.key ? ' on' : ''}${spHover !== null && spHover !== i ? ' dim' : ''}" data-sh="${i}" data-open="${x.key}" role="button" tabindex="0" aria-expanded="${spOpen === x.key}"><i style="background:${x.color}"></i><div class="n"><div><span>${x.label}<span class="chev">${spOpen === x.key ? '▴' : '▾'}</span></span><span><span style="color:var(--mute)">${man(x.v)}</span> <b>${Math.round(x.v / total * 100)}%</b></span></div></div></div>`).join('')}</div>`;
  $('#spDetail').innerHTML = list;
}
$('#spMonths').addEventListener('click', e => { const b = e.target.closest('[data-sp]'); if (b) { spMonth = +b.dataset.sp; spHover = null; renderSpend(); } });
$('#spMode').addEventListener('click', e => { const b = e.target.closest('[data-spm]'); if (b) { spMode = b.dataset.spm; spOpen = null; spHover = null; renderSpend(); } });
$('#spend').addEventListener('click', e => { const d = e.target.closest('[data-open]'); if (d) { spOpen = spOpen === d.dataset.open ? null : d.dataset.open; renderSpend(); } });
$('#spend').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset.open) { e.preventDefault(); spOpen = spOpen === e.target.dataset.open ? null : e.target.dataset.open; renderSpend(); } });
hoverable('#spend', 'sh', () => spHover, v => { spHover = v; renderSpend(); });

// ===== 우리 자산 =====
const ASEG = [
  { label: '전세 자기자금', v: jeonseNet, color: 'var(--ink)', sub: `보증금 ${eok(M(A.jeonse.deposit))} − 버팀목 ${eok(M(A.jeonse.loan))}` },
  { label: '예·적금·통장', v: M(A.H.cash + A.W.cash), color: 'var(--lime)', sub: `⟦H⟧ ${amt(M(A.H.cash))} · ⟦W⟧ ${amt(M(A.W.cash))}` },
  { label: '주식', v: M(A.H.invest + A.W.invest), color: 'var(--lime2)', sub: `⟦H⟧ ${amt(M(A.H.invest))} · ⟦W⟧ ${amt(M(A.W.invest))}` },
  { label: '청약', v: M(A.H.sub + A.W.sub), color: 'var(--lemon)', sub: `⟦H⟧ ${amt(M(A.H.sub))} · ⟦W⟧ ${amt(M(A.W.sub))}` },
  { label: '페이머니 등', v: M(A.H.etc + A.W.etc), color: '#E4E4E1', sub: '포인트 포함' },
];
let aHover = null;
function renderAssets() {
  const total = ASEG.reduce((a, s) => a + s.v, 0), hv = aHover !== null ? ASEG[aHover] : null;
  $('#assets').innerHTML = `<div class="donut">${donut(ASEG, total, aHover, 50, 16)}<div class="c"><b>${amt(hv ? hv.v : total)}</b><span>${hv ? `${hv.label} · ${Math.round(hv.v / total * 100)}%` : '순자산'}</span></div></div>
    <div class="dl">${ASEG.map((s, i) => `<div class="dr${aHover === i ? ' on' : ''}${aHover !== null && aHover !== i ? ' dim' : ''}" data-ah="${i}"><i style="background:${s.color}"></i><div class="n"><div><span>${s.label}</span><b>${amt(s.v)}</b></div><div class="s">${s.sub}</div></div></div>`).join('')}</div>`;
}
hoverable('#assets', 'ah', () => aHover, v => { aHover = v; renderAssets(); });
$('#assetSub').textContent = `합산 ${eok(netNow)} · 전세대출 차감`;
$('#asOf').textContent = DATA.asOf.slice(5).replace('-', '.') + ' 기준';
$('#emer').textContent = eok(M(A.emergency));
const sh = Math.round(finH / (finH + finW) * 100);
$('#contrib').innerHTML = `<div class="p"><div class="av h">⟦h⟧</div><div><div style="font-size:13px;font-weight:600">⟦H⟧</div><div class="note">${amt(finH)} · ${sh}%</div></div></div>
  <div class="p"><div class="av w" style="margin:0">⟦w⟧</div><div><div style="font-size:13px;font-weight:600">⟦W⟧</div><div class="note">${amt(finW)} · ${100 - sh}%</div></div></div>`;
$('#ratio').innerHTML = `<i style="flex:${sh};background:var(--ink)"></i><i style="flex:${100 - sh};background:var(--lime)"></i>`;

// ===== 결산 기록 =====
let hN = 3;
function renderHRange() {
  $('#hRange').innerHTML = [3, 6, 12].map(n => SET.length >= n || n === 3
    ? `<button type="button" data-hn="${n}" aria-pressed="${n === hN}">${n}개월</button>`
    : `<button type="button" aria-disabled="true" data-lock="${n}개월 기록은 결산이 ${n}번 쌓이면 열려요">${n}개월</button>`).join('');
}
$('#hRange').addEventListener('click', e => { const b = e.target.closest('[data-hn]'); if (b) { hN = +b.dataset.hn; renderHRange(); renderHist(); } });
function renderHist() { $('#hist').innerHTML = SET.slice(-hN).reverse().map(r => `<div class="hr"><div class="hm${r.base >= save ? ' ok' : ''}">${mon(r.m)}</div>
  <div class="mid"><div>${mon(r.m)}월 결산</div><div>${(DATA.settlements || {})[r.m] ? DATA.settledBy : '결산 방식 도입 전 기록'}${r.memo ? ' · ' + esc(r.memo) : ''}</div></div>
  <div class="rt"><div>평소 ${sman(r.base)}</div><div style="color:${r.base >= save ? 'var(--good)' : 'var(--warn)'}">${r.base >= save ? '목표 달성' : '목표 미달'}</div></div></div>`).join(''); }

// ===== 빔글석굴 (이 화면 숫자로 답하는 규칙형 도우미) =====
const top2 = (() => { const r = last, t = M(r.expH + r.expW); return CATS.map(([k, l]) => [l, M(r.cat[k] || 0)]).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([l, v]) => `${l} ${Math.round(v / t * 100)}%(${man(v)})`).join(', '); })();
const Lsolo = loan({ ...T, incomeBasis: '남편 단독' }, inc);
function reply(q) {
  const t = q.replace(/\s/g, '');
  if (/대출|DSR|한도|LTV|상환/.test(t)) return `${T.region} ${eok(T.price)} ${T.type} 기준, 두 사람 소득 합산(${man(inc.H + inc.W)})이면 대출 ${eok1(L8.amount)}까지 가능해요. LTV 한도(${eok1(L8.ltv)})보다 소득 한도에 먼저 막혀요. 월 상환은 약 ${man(Math.round(L8.monthly))}이에요.\n⟦H⟧ 단독 소득이면 ${eok1(Lsolo.amount)}로 줄어서, 혼인신고 후 합산이 유리해요.`;
  if (/목표|달성|언제|가능|얼마나|집값/.test(t)) return `월 ${man(save)}씩 모으면 ${ym(T.date)}에 살 수 있는 집은 ${eok1(canBuy)}, 목표의 ${pct}%예요.\n${eok(T.price)}에 제때 닿으려면 월 ${man(Math.ceil(needPerMonth))}이 필요하고, 지금 페이스면 ${yearsMonths(extraMonths) || '0개월'} 더 걸려요. 레버는 월 저축 늘리기, 전세 연장(${eok1(canBuyExt)}), 목표 조정 순으로 보세요.`;
  if (/저축|모아|모으/.test(t)) return `${mon(last.m)}월 쓸 수 있는 저축은 ${sman(last.base)}이에요(축의금 ${man(last.gift)}·일회성 지출 ${man(last.one)} 제외). 축의금·일회성까지 넣은 실제 저축은 ${sman(last.sav)}이에요.\n최근 3개월 평균 쓸 수 있는 저축은 ${sman(base3)}로 목표 ${man(save)} ${base3 >= save ? '달성' : '미달'}이에요. 고정비는 월 약 ${man(M(DATA.fixed.total) + ANN_M)}이고, 10월에 할부 4건이 끝나요.`;
  if (/소비|지출|줄이|식비|고정비|관리비/.test(t)) return `${mon(last.m)}월 소비 ${man(last.exp)} 중 ${top2}가 가장 커요.\n고정비(사라지는 돈)는 월 약 ${man(M(DATA.fixed.total))}: ${DATA.fixed.items.map(([l, v]) => `${l} ${man(M(v))}`).join(', ')}. 변동비는 부부 가계부로 관리해요.`;
  if (/자산|예적금|적금|투자|주식|청약|연금/.test(t)) return `순자산은 ${eok(netNow)}이에요. 전세 자기자금 ${eok(jeonseNet)}, 예·적금·통장 ${eok(ASEG[1].v)}, 주식 ${eok(ASEG[2].v)}, 청약 ${eok(ASEG[3].v)}.\n퇴직연금 ${eok(M(A.emergency))}는 묶인 자산이라 순자산에서 뺐어요.`;
  if (/결산|입력|갱신|파일/.test(t)) return `매달 말일~다음 달 3일에 뱅크샐러드 가계부 탭 → 톱니바퀴 → 파일로 받기(지난달 1일~말일)로 받은 파일 2개를 Claude 채팅에 올려주세요. 이 화면이 같은 링크로 갱신돼요.`;
  return `목표·대출·저축·소비·자산 중 무엇이 궁금하세요? "대출 한도 얼마야?"나 "고정비 얼마야?"처럼 물어보셔도 돼요.`;
}
const chat = [{ me: false, text: `안녕하세요, 빔글석굴이에요. ${DATA.asOf.slice(5).replace('-', '월 ')}일 기준으로 ${ym(T.date)}에 살 수 있는 집은 ${eok1(canBuy)}이고, 목표 ${eok(T.price)}까지 ${eok1(Math.max(0, T.price - canBuy))} 남았어요. 뭐가 궁금하세요?` }];
let typing = false;
function renderChat() {
  $('#log').innerHTML = chat.map(m => `<div class="msg${m.me ? ' me' : ''}"><div class="bub">${esc(m.text)}</div></div>`).join('') + (typing ? '<div class="msg"><div class="bub">···</div></div>' : '');
  const l = $('#log'); l.scrollTop = l.scrollHeight;
}
function send(q) { q = (q || '').trim(); if (!q || typing) return; chat.push({ me: true, text: q }); typing = true; renderChat(); setTimeout(() => { chat.push({ me: false, text: reply(q) }); typing = false; renderChat(); }, 450); }
$('#chips').innerHTML = ['대출 한도 얼마야?', '목표 달성 가능해?', '고정비 얼마야?', '자산 구성은?'].map(c => `<button type="button" data-q="${c}">${c}</button>`).join('');
$('#chips').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) send(b.dataset.q); });
$('#askForm').addEventListener('submit', e => { e.preventDefault(); const i = $('#askInput'); send(i.value); i.value = ''; });

// ===== 결산 방법 시트 =====
const sheet = $('#sheet');
document.querySelectorAll('[data-open="settle"]').forEach(b => b.addEventListener('click', () => { sheet.hidden = false; $('#sheetX').focus(); }));
$('#sheetX').addEventListener('click', () => { sheet.hidden = true; });
sheet.addEventListener('click', e => { if (e.target === sheet) sheet.hidden = true; });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) sheet.hidden = true; });

renderViewer(); renderG(); renderPeriods(); renderF(); renderHRange(); renderHist(); renderSpend(); renderAssets(); renderChat();

;
// ---- 원래 화면 스크립트 2/4 ----

// ===== 월 결산 (Claude Design '둥지 월 결산' 10/13) =====
// 입력은 채팅에서 하고 이 화면은 보기 · 고르기 · 기록만 해요. 바꿀 내용은 '복사'로 채팅에 내보내요.
// 상태: pre(첫 결산 전) · pending(지난달 결산 파일 대기) · short/ok(결산 결과). #settle-demo-<상태>로 예시 화면을 볼 수 있어요.
(function () {
const STL = $('#stl');
const SS = DATA.settlements || {};
const START = DATA.settleStart || '2026-10';
const e2 = v => (v / 10000).toFixed(2) + '억';
const em = v => { const n = Math.round(Math.abs(v)), e = Math.floor(n / 10000), r = n % 10000; return (v < 0 ? '−' : '') + (e ? e + '억' + (r ? ' ' + r.toLocaleString('ko-KR') + '만' : '') : r.toLocaleString('ko-KR') + '만'); };
const mw = v => (v < 0 ? '−' : '') + Math.round(Math.abs(v)).toLocaleString('ko-KR') + '만원';
const mn = v => (v < 0 ? '−' : '') + Math.round(Math.abs(v)).toLocaleString('ko-KR') + '만';
const ymAdd = (m, k) => { let [y, mo] = m.split('-').map(Number); mo += k; while (mo > 12) { mo -= 12; y++; } while (mo < 1) { mo += 12; y--; } return `${y}-${String(mo).padStart(2, '0')}`; };
const lastDay = m => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo, 0).getDate(); };
const window3 = m => { const n = ymAdd(m, 1); return `${m.slice(5)}.${lastDay(m)} ~ ${n.slice(5)}.03`; };
const sumP = p => p.cash + p.invest + p.sub + p.etc;
const netOf = a => M(sumP(a.H) + sumP(a.W) + a.jeonse.deposit - a.jeonse.loan);
const leftFrom = d => { const dt = new Date(d + 'T00:00:00'); return Math.max(1, (ty - dt.getFullYear()) * 12 + tm - (dt.getMonth() + 1)); };
const buyAt = (net, d) => affordable(T, inc, net + save * leftFrom(d));
const md = d => d.slice(5).replace('-', '.');
const IC = {
  lever: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9M13 7a2 2 0 1 0 4 0a2 2 0 1 0-4 0M7 17a2 2 0 1 0 4 0a2 2 0 1 0-4 0"/></svg>',
  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
  ok: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
  wait: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>',
  arrow: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  chev: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  copy: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 9h10v10H9zM5 15V5h10"/></svg>',
  pen: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/></svg>',
};
const TIPS = {
  usual: ['쓸 수 있는 저축', '평소 수입 − 평소 소비 − 묶인 저축. 집 살 때 쓸 수 있는 돈만 목표와 비교해요. 축의금처럼 그달만 있는 돈은 빼고, 연간 비용은 12로 나눠 넣어요.'],
  locked: ['묶인 저축', '종신보험(10년 이상 못 쓰는 돈)과 퇴직연금 추가납입. 저축이지만 집값 계산과 목표 비교에서는 빼요.'],
  floor: ['내림 표시', '소수점 아래는 버려요. 목표에 못 미치면 99%까지만 보여요.'],
  avg3: ['3개월 평균', '최근 3번 결산한 쓸 수 있는 저축의 평균이에요. 분기 인센티브로 달마다 출렁이는 걸 걸러 봐요.'],
  buy: ['살 수 있는 집값', `목표일(${ty}.${tm}) 예상 자산과 대출로 살 수 있는 가장 비싼 집이에요. 규제지역 · ${T.type} · 소득 ${T.incomeBasis} · 월 저축 ${man(save)} 기준.`],
  net: ['순자산', '가진 돈 − 빚(전세대출). 묶인 자산(퇴직연금)은 빼고 계산해요.'],
  fixed: ['고정비', '매달 같은 곳으로 나가서 사라지는 돈이에요. 주거 · 보험 · 통신 · 할부 · 구독 · 가족계.'],
  oneoff: ['일회성', '그달만 있는 수입 · 지출이에요. 쓸 수 있는 저축 계산에서 빠져요.'],
  jeonse: ['전세 자기자금', '전세보증금 중 대출을 뺀 우리 돈이에요. 이사할 때 돌려받아요.'],
  sub: ['청약', '주택청약종합저축. 생애최초 · 특별공급 자격에 쓰여요.'],
  pay: ['페이머니', '간편결제 앱에 충전해 둔 돈이에요.'],
  pension: ['묶인 자산 (퇴직연금)', 'DC · IRP 퇴직연금. 중도인출 조건과 세금이 있어 순자산 · 집값 계산에서 빼요.'],
  legacy: ['결산 방식 도입 전 기록', '10월 전에는 자산을 달마다 기록하지 않아 집값 변화를 알 수 없어요. 쓸 수 있는 저축은 홈과 같은 값이에요.'],
};
const ii = id => `<button type="button" class="ii" data-tip="${id}" aria-label="설명"><span>i</span></button>`;

// ----- 기록: 결산된 달(홈과 같은 MS 값) + 새 결산이면 집값 변화 -----
function records() {
  return SET.map(r => {
    const s = SS[r.m];
    return { m: r.m, base: r.base, inc: r.inc - r.gift, sp: r.exp - r.one - r.annPaid + ANN_M, memo: s ? s.memo || '' : r.memo || '',
      buyD: s ? buyAt(netOf(s.assets), s.asOf) - buyAt(netOf(s.prevAssets), s.prevAsOf) : null, legacy: !s };
  });
}

// ----- 결과 화면 값 (실제 결산 · 예시) -----
function vmReal(m) {
  const s = SS[m], r = MS.find(x => x.m === m);
  const spTot = r.exp - r.one - r.annPaid + ANN_M;
  const sp = (s.spend || []).map(([l, v, badge, tip]) => [l, M(v), badge || '', tip || '']);
  const rest = spTot - sp.reduce((a, x) => a + x[1], 0);
  if (Math.abs(rest) >= 1) sp.push(['기타', rest, '', '']);
  return { m, real: true, base: r.base, locked: r.locked || 0, at: s.at, asOf: s.asOf, files: s.files || { H: true, W: true },
    incTot: r.inc - r.gift, inc: [[DATA.names.H + (r.bonusH ? ` (인센티브 ${Math.round(M(r.bonusH))}만 포함)` : ''), M(r.incH)], [DATA.names.W, M(r.incW)]], incOne: (s.incOne || []).map(([l, v]) => [l, M(v)]),
    spTot, sp, spOne: (s.spendOne || []).map(([l, v]) => [l, M(v)]),
    sv: (s.save || []).map(([l, v, tip]) => [l, M(v), tip || '']), checks: s.checks || [],
    memo: s.memo || '', memoBy: s.memoBy || '', memoAt: s.memoAt || '',
    assets: s.assets, prev: s.prevAssets, prevAsOf: s.prevAsOf };
}
function vmDemo(kind) {
  // 예시: 10/09 실제 자산에서 시작해 한 달 쓸 수 있는 저축만큼 늘었다고 가정한 화면 (숫자는 실제가 아니에요)
  const ok = kind === 'ok', base = ok ? 288 : 252;
  const a = JSON.parse(JSON.stringify(A));
  const sv = ok ? [['적금', 120], ['투자', 110], ['청약', 25, 'sub'], ['비상금', 20]] : [['적금', 120], ['투자', 84], ['청약', 25, 'sub'], ['비상금', 20]];
  a.W.cash += 1200000 + 200000; a.H.invest += (ok ? 1100000 : 840000); a.H.sub += 125000; a.W.sub += 125000; a.H.etc -= 60000;
  a.H.cash += (base - sv.reduce((s, x) => s + x[1], 0)) * 10000 + 60000;
  const sp = ok ? [['고정비', 204, '할부 4건 10월 종료', 'fixed'], ['생활비', 48, '', ''], ['용돈', 66, '', ''], ['차량비', 28, '', '']]
                : [['고정비', 204, '할부 4건 10월 종료', 'fixed'], ['생활비', 58, '', ''], ['용돈', 90, '', ''], ['차량비', 30, '', '']];
  return { m: '2026-10', real: false, base, at: '2026-11-01 21:14', asOf: '2026-10-31', files: { H: true, W: true },
    incTot: 634, inc: [[DATA.names.H, 316], [DATA.names.W, 318]], incOne: [['축의금 받음', 50]],
    spTot: 634 - base, sp, spOne: [['축의금 보냄', 20], ['가전 수리', 18]], sv,
    checks: [
      { id: 'c1', tag: '저축으로 추정', title: '머리말 없는 이체 15만원', detail: '10.15 ⟦H⟧ → 토스뱅크 · 받는 쪽 메모가 없어요', guess: '비상금 저축으로 넣었어요' },
      { id: 'c2', tag: '빠진 내역?', title: '가계부 합계와 6% 차이', detail: '⟦W⟧ 카드 내역 214만 vs 가계부 201만', guess: '차이 13만원은 생활비로 넣었어요' },
      { id: 'c3', tag: '새 고정비 후보', title: '음악 구독 9,900원 · 4개월 반복', detail: '7월부터 매달 12일 같은 금액이 나가요', guess: '11월부터 고정비로 볼게요' },
      { id: 'c4', tag: '끝난 할부', title: 'LG 할부 2건 완납', detail: '10월이 마지막 회차', guess: '11월부터 고정비에서 뺄게요' },
    ],
    memo: ok ? '외식을 주 1회로 줄인 달. 11월도 이대로!' : '축의금 시즌이라 일회성이 많았던 달. 11월은 외식 주 1회로!', memoBy: 'W', memoAt: '11.01',
    assets: a, prev: A, prevAsOf: DATA.asOf };
}

// ----- 상태 -----
function stateFor(hash) {
  const demo = (hash.match(/^#settle-demo-(\w+)/) || [])[1];
  const now = new Date(), cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`, prevM = ymAdd(cur, -1);
  if (demo === 'pre') return { st: 'pre', m: '2026-10', demo };
  if (demo === 'pending') return { st: 'pending', m: '2026-10', day: 1, demo };
  if (demo === 'short' || demo === 'ok') return { st: demo, m: '2026-10', vm: vmDemo(demo), demo };
  if (SS[prevM]) { const vm = vmReal(prevM); return { st: vm.base >= save ? 'ok' : 'short', m: prevM, vm }; }
  if (prevM >= START) return { st: 'pending', m: prevM, day: now.getDate() };
  return { st: 'pre', m: cur < START ? START : cur };
}

// ----- 화면 상태 (이 기기에서만) -----
let ans = {}, notes = {}, openRec = null, guideOpen = false, memoEdit = false, draft = '', lastKey = '';

function header(X) {
  const got = X.vm ? X.vm.files : { H: false, W: false };
  const upd = X.vm ? `${md(X.vm.at.slice(0, 10))} ${X.vm.at.slice(11)} 갱신` : X.st === 'pending' ? `마지막 갱신 ${md(DATA.asOf)} · 자산 기준` : `${mon(X.m)}월 진행 중`;
  const chip = k => `<span class="fchip ${got[k] ? 'got' : 'wait'}"><span class="ini">${DATA.names[k][0] === '설' ? '빔' : '석'}</span>${DATA.names[k]}${got[k] ? IC.ok + '받음' : IC.wait + '대기'}</span>`;
  return `<section class="cd hdr full"><div style="min-width:0"><div class="eb">월 결산</div><h1 class="h1">${mon(X.m)}월 결산</h1>
    <div class="meta"><span style="white-space:nowrap">기준일 ${X.m.slice(5)}/${lastDay(X.m)}</span><span>·</span><span style="white-space:nowrap">${upd}</span></div></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${chip('H')}${chip('W')}</div></section>`;
}
const STEPS = m => [
  ['뱅크샐러드에서 파일 받기', '가계부 탭 → 위쪽 톱니바퀴 → ‘파일로 받기’'],
  ['기간은 지난달 1일 ~ 말일', `${mon(m)}월 결산이면 ${m.slice(5)}.01 ~ ${m.slice(5)}.${lastDay(m)} · 두 사람 각자 받아요`],
  ['말일 ~ 다음 달 3일에 채팅으로', '내집마련 대시보드 프로젝트 채팅에 파일 2개와 부부 가계부 그달 합계를 올리면 Claude가 분류해서 이 화면을 채워요'],
];
function guideCard(m, big) {
  const st = STEPS(m);
  if (big) return `<section class="cd full"><div class="eb">다음 결산 방법</div><div style="font-size:26px;font-weight:800;letter-spacing:-0.03em;line-height:1.3;margin-top:4px">첫 결산은 이렇게 해요</div>
    <div style="font-size:14px;color:var(--ink2);margin-top:6px;line-height:1.55">입력은 채팅에서 해요. <b>${window3(m)}</b> 사이에 파일만 보내면 Claude가 분류해서 이 화면을 채워요.</div>
    <div class="steps">${st.map(([t, b], i) => `<div class="step"><span class="n">${i + 1}</span><div style="min-width:0"><div class="st">${t}</div><div class="sb">${b}</div></div></div>`).join('')}</div></section>`;
  return `<section class="cd gd" id="stlGuide" style="padding:6px 20px"><button type="button" data-guide aria-expanded="${guideOpen}"><span><span class="h2" style="display:block">다음 결산 방법</span><span class="s12" style="display:block">${mon(m)}월 결산 · ${window3(m)}에 보내기</span></span><span class="chev" style="transform:${guideOpen ? 'rotate(180deg)' : 'none'}">${IC.chev}</span></button>
    ${guideOpen ? `<div style="display:flex;flex-direction:column;gap:12px;padding:6px 0 16px">${st.map(([t, b], i) => `<div class="gstep"><span class="n">${i + 1}</span><div style="min-width:0"><div style="font-size:14px;font-weight:700;line-height:1.4">${t}</div><div style="font-size:13px;color:var(--ink2);margin-top:2px;line-height:1.5">${b}</div></div></div>`).join('')}</div>` : ''}</section>`;
}
function recCard(rows, full) {
  const body = rows.length ? rows.slice().reverse().map(r => {
    const open = openRec === r.m, ok = r.base >= save;
    return `<div class="rec"><button type="button" data-rec="${r.m}" aria-expanded="${open}">
      <span class="rm">${mon(r.m)}월</span>
      <span style="flex:1 1 0;min-width:0"><span class="s12" style="display:block">쓸 수 있는 저축</span><span style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><b style="font-size:16px;white-space:nowrap">${mw(r.base)}</b><span class="bdg ${ok ? 'ok' : 'sh'}">${ok ? '달성' : '미달'}</span></span></span>
      <span style="flex:none;min-width:60px;text-align:right"><span class="s12" style="display:block">집값</span><b style="font-size:14px;white-space:nowrap">${r.buyD === null ? '—' : (r.buyD >= 0 ? '▲' : '▼') + (Math.abs(r.buyD) / 10000).toFixed(2) + '억'}</b></span>
      <span class="chev" style="transform:${open ? 'rotate(180deg)' : 'none'}">${IC.chev}</span></button>
      ${open ? `<div style="padding:0 0 14px;display:flex;flex-direction:column;gap:10px"><div class="rtiles">
        <div><div class="s12" style="display:flex;align-items:center;gap:6px"><i style="background:var(--lemon)"></i>평소 수입</div><b style="font-size:16px;white-space:nowrap">${mw(r.inc)}</b></div>
        <div><div class="s12" style="display:flex;align-items:center;gap:6px"><i style="background:var(--orange)"></i>평소 소비</div><b style="font-size:16px;white-space:nowrap">${mw(r.sp)}</b></div>
        <div><div class="s12" style="display:flex;align-items:center;gap:6px"><i style="background:var(--lime)"></i>쓸 수 있는 저축</div><b style="font-size:16px;white-space:nowrap">${mw(r.base)}</b></div></div>
        ${r.memo ? `<div style="font-size:14px;color:var(--ink2);line-height:1.5"><span style="color:var(--desc)">메모 · </span>${esc(r.memo)}</div>` : ''}
        ${r.legacy ? `<div class="s12" style="display:flex;align-items:center">결산 방식 도입 전 기록 · 집값 변화 없음${ii('legacy')}</div>` : ''}</div>` : ''}</div>`;
  }).join('') : `<div class="dash" style="margin-top:12px;padding:24px 16px">아직 결산 기록이 없어요<br>첫 파일을 보내면 여기에 달마다 쌓여요</div>`;
  return `<section class="cd ${full ? 'full' : 's2'}"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap"><div class="h2">결산 기록</div><span class="s12">눌러서 펼쳐 보기 · 쓸 수 있는 저축은 홈과 같은 값</span></div><div style="margin-top:8px">${body}</div></section>`;
}

function resultCards(X, rows) {
  const V = X.vm, ok = X.st === 'ok', gap = Math.abs(V.base - save);
  const pct = V.base <= 0 ? 0 : ok ? Math.floor(V.base / save * 100) : Math.min(99, Math.floor(V.base / save * 100));
  const scale = Math.max(save, V.base), barW = Math.max(0, Math.min(V.base, save)) / scale * 100, barGap = ok ? 0 : (save - Math.max(0, V.base)) / scale * 100, tick = save / scale * 100;
  const last3 = rows.slice(-3), avg = last3.reduce((a, r) => a + r.base, 0) / last3.length, hit = last3.filter(r => r.base >= save).length;
  const netN = netOf(V.assets), netP = netOf(V.prev), buyN = buyAt(netN, V.asOf), buyP = buyAt(netP, V.prevAsOf), bD = buyN - buyP, nD = netN - netP;
  const flag = ok
    ? `<div class="flag ok"><span class="fi" style="background:var(--lime);color:var(--limeink)">${IC.check}</span><div class="ft"><b>목표 ${mw(save)}을 ${mw(gap)} 넘겼어요.</b> 최근 ${last3.length}달 중 ${hit}번 달성</div><a href="#simulator">시뮬레이터에서 레버 보기${IC.arrow}</a></div>`
    : `<div class="flag sh"><span class="fi" style="background:var(--orange);color:var(--ink)">${IC.lever}</span><div class="ft"><b>쓸 수 있는 저축이 목표보다 ${mw(gap)} 적어요.</b> 어떤 레버를 당길까?</div><a href="#simulator">시뮬레이터에서 레버 보기${IC.arrow}</a></div>`;
  const res = `<section class="cd full" style="display:flex;flex-direction:column;gap:16px">${flag}
    <div class="res"><div class="mainr">
      <span class="lbl">쓸 수 있는 저축${ii('usual')}</span>
      <div style="display:flex;align-items:baseline;gap:2px 10px;flex-wrap:wrap;margin-top:6px"><span class="bigv">${mw(V.base)}</span><span style="font-size:15px;color:var(--desc);white-space:nowrap">/ 목표 ${mw(save)}</span></div>${V.locked ? `<div class="sub" style="margin-top:6px;display:flex;align-items:center">+ 묶인 저축 ${mw(V.locked)} = 전체 저축 ${mw(V.base + V.locked)}${ii('locked')}</div>` : ''}
      <div style="position:relative;margin-top:16px"><div class="pbar"><div style="width:${barW}%;background:var(--lime)"></div><div style="width:${barGap}%;background:var(--orange2)"></div></div>
        <div style="position:absolute;left:${tick}%;top:-4px;width:2px;height:20px;margin-left:-2px;background:var(--ink);border-radius:1px"></div></div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:4px 12px;flex-wrap:wrap;margin-top:8px">
        <span style="display:flex;align-items:center;font-size:15px;font-weight:700">${pct}%<span style="font-size:12px;font-weight:500;color:var(--desc);margin-left:4px">내림 표시</span>${ii('floor')}</span>
        <span style="font-size:13px;font-weight:600;color:${ok ? 'var(--good)' : 'var(--warn)'}">${mw(gap)} ${ok ? '더' : '덜'} 모았어요</span></div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px 16px;flex-wrap:wrap;margin-top:14px;padding-top:14px;border-top:1px solid var(--line2)">
        <div><span style="font-size:13px;color:var(--desc);display:flex;align-items:center;height:24px">${last3.length}개월 평균${ii('avg3')}</span><b style="font-size:20px;letter-spacing:-0.02em;white-space:nowrap">${mw(avg)}</b></div>
        <div class="dots" aria-label="최근 달성 여부">${last3.map(r => `<div class="dot"><i style="background:${r.base >= save ? 'var(--lime)' : 'var(--orange2)'}"></i><span style="font-size:12px;font-weight:600">${mon(r.m)}월</span><span class="s12" style="white-space:nowrap">${mn(r.base)}</span></div>`).join('')}</div></div>
    </div>
    <div class="kc"><span class="lbl">살 수 있는 집값${ii('buy')}</span><div class="kv3">${e2(buyN)}</div>
      <div style="display:flex;align-items:center;gap:6px 8px;flex-wrap:wrap;margin-top:10px"><span class="sub" style="white-space:nowrap">${e2(buyP)} → ${e2(buyN)}</span><span class="bdg ${bD >= 0 ? 'ok' : 'sh'}">${bD >= 0 ? '▲' : '▼'}${(Math.abs(bD) / 10000).toFixed(2)}억</span></div>
      <div class="s12" style="margin-top:6px">지난 기록(${md(V.prevAsOf)}) 대비 · ${eok(T.price)} 규제지역 기준</div></div>
    <div class="kc"><span class="lbl">순자산${ii('net')}</span><div class="kv3">${em(netN)}</div>
      <div style="display:flex;align-items:center;gap:6px 8px;flex-wrap:wrap;margin-top:10px"><span class="sub">${em(netP)} → ${em(netN)}</span><span class="bdg ${nD >= 0 ? 'ok' : 'sh'}">${nD >= 0 ? '▲' : '▼'}${mn(Math.abs(nD))}</span></div>
      <div class="s12" style="margin-top:6px">지난 기록 대비 · 묶인 자산 뺌</div></div></div></section>`;
  const oneBox = list => list.length ? `<div class="one"><div class="oh"><span style="font-size:13px;font-weight:600;color:var(--desc);display:flex;align-items:center;height:32px">일회성${ii('oneoff')}</span><span class="s12">쓸 수 있는 저축에서 빠져요</span></div>${list.map(([l, v]) => `<div class="or"><span>${esc(l)}</span><span style="white-space:nowrap">${mn(v)}</span></div>`).join('')}</div>` : '';
  const LK = V.locked || 0, svSum = V.sv.reduce((a, x) => a + x[1], 0), svRest = V.base + LK - svSum;
  const buckets = `
  <section class="cd bucket"><div class="bh"><i style="background:var(--lemon)"></i>평소 수입</div><div class="tot">${mw(V.incTot)}</div>
    <div style="margin-top:10px">${V.inc.map(([l, v]) => `<div class="row"><span>${l}</span><b>${mn(v)}</b></div>`).join('')}</div>${oneBox(V.incOne)}</section>
  <section class="cd bucket"><div class="bh"><i style="background:var(--orange)"></i>평소 소비</div><div class="tot">${mw(V.spTot)}</div>
    <div style="margin-top:10px">${V.sp.map(([l, v, badge, tip]) => `<div class="row"><span style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0">${esc(l)}${tip ? ii(tip) : ''}${badge ? `<span class="tag">${esc(badge)}</span>` : ''}</span><b>${mn(v)}</b></div>`).join('')}</div>${oneBox(V.spOne)}</section>
  <section class="cd bucket"><div class="bh"><i style="background:var(--lime)"></i>전체 저축</div><div class="tot">${mw(V.base + LK)}</div>
    <div style="margin-top:10px">${V.sv.map(([l, v, tip]) => `<div class="row"><span style="display:flex;align-items:center">${esc(l)}${tip ? ii(tip) : ''}</span><b>${mn(v)}</b></div>`).join('')}${Math.abs(svRest) >= 1 ? `<div class="row"><span>${svRest > 0 ? '통장에 남음' : '통장에서 꺼냄'}</span><b>${mn(svRest)}</b></div>` : ''}</div>
    <div class="s12" style="margin-top:8px">평소 수입 − 평소 소비 = 전체 저축${LK ? ` · 쓸 수 있는 ${mn(V.base)} + 묶인 ${mn(LK)}` : ''}</div></section>`;
  const answered = V.checks.filter(c => ans[c.id]).length;
  const checks = `<section class="cd s2"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px 12px;flex-wrap:wrap">
      <div><div class="h2">확인해 주세요</div><div class="sub" style="margin-top:2px">Claude가 확실하지 않은 것만 모았어요</div></div>
      ${V.checks.length ? `<span style="height:32px;padding:0 10px;border-radius:9px;background:var(--line2);font-size:13px;font-weight:600;display:flex;align-items:center;white-space:nowrap">${answered}/${V.checks.length} 골랐어요</span>` : ''}</div>
    ${V.checks.length ? `<div style="margin-top:10px">${V.checks.map(c => `<div class="ck"><div style="flex:1 1 280px;min-width:0"><span class="ctag">${esc(c.tag)}</span><div class="ctt">${esc(c.title)}</div><div class="sub" style="margin-top:2px;line-height:1.5">${esc(c.detail)}</div><div style="font-size:13px;color:var(--ink2);margin-top:4px;line-height:1.5">Claude 판단 · ${esc(c.guess)}</div></div>
        <div role="group" aria-label="확인" style="display:flex;gap:6px;flex:none"><button type="button" class="pick y" data-pick="${c.id}" data-v="yes" aria-pressed="${ans[c.id] === 'yes'}">맞아요</button><button type="button" class="pick n" data-pick="${c.id}" data-v="no" aria-pressed="${ans[c.id] === 'no'}">바꿀게요</button></div>
        ${ans[c.id] === 'no' ? `<input type="text" class="inp" data-note="${c.id}" value="${esc(notes[c.id] || '')}" aria-label="어떻게 바꿀지" placeholder="어떻게 바꿀까요? 예: 이 돈은 생활비예요">` : ''}</div>`).join('')}</div>
    <div style="border-top:1px solid var(--line2);padding-top:14px;display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center"><div class="sub" style="flex:1 1 240px;min-width:0;line-height:1.5">고른 결과를 채팅에 붙여 넣으면 Claude가 다시 분류해서 화면을 고쳐요</div>
      <button type="button" class="btn-k" data-copychecks style="flex:1 1 200px;max-width:280px;margin-left:auto"${answered ? '' : ' disabled'}>${IC.copy}확인 결과 복사</button></div>`
    : `<div class="dash" style="margin-top:12px;padding:20px 16px">이번 달은 확인할 게 없어요 · Claude가 모두 분류했어요</div>`}</section>`;
  const snapRows = [['전세 자기자금', x => M(x.jeonse.deposit - x.jeonse.loan), 'jeonse'], ['예적금 · 통장', x => M(x.H.cash + x.W.cash)], ['주식', x => M(x.H.invest + x.W.invest)], ['청약', x => M(x.H.sub + x.W.sub), 'sub'], ['페이머니', x => M(x.H.etc + x.W.etc), 'pay']];
  const snap = `<section class="cd"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap"><div class="h2">자산 스냅샷</div><span class="s12">${md(V.asOf)} 기준 · 지난 기록 대비</span></div>
    <div style="margin-top:10px">${snapRows.map(([l, f, tip]) => { const v = f(V.assets), d = v - f(V.prev); return `<div class="snap"><span style="display:flex;align-items:center;font-size:14px;min-width:0">${l}${tip ? ii(tip) : ''}</span><span class="sv"><b>${em(v)}</b>${Math.abs(d) < 0.5 ? '<span class="s12">변동 없음</span>' : `<span class="${d > 0 ? 'up' : 'dn'}">${d > 0 ? '▲' : '▼'}${mn(Math.abs(d))}</span>`}</span></div>`; }).join('')}</div>
    <div style="margin-top:8px;border-radius:12px;background:var(--sub);padding:8px 12px;display:flex;justify-content:space-between;align-items:center;gap:4px 12px;flex-wrap:wrap"><span style="display:flex;align-items:center;font-size:13px;color:var(--desc)">묶인 자산 · 퇴직연금${ii('pension')}</span><span style="font-size:13px;color:var(--ink2);white-space:nowrap;margin-left:auto"><b>${em(M(V.assets.emergency))}</b> · 순자산에서 빠져요</span></div></section>`;
  return res + buckets + checks + snap;
}
function memoCard(V) {
  const who = V.memoBy ? DATA.names[V.memoBy] : '';
  return `<section class="cd"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><div class="h2">이번 달 메모</div>${memoEdit ? '' : `<button type="button" class="btn-s" data-memo style="margin-right:-6px">${IC.pen}${V.memo ? '메모 고치기' : '메모 쓰기'}</button>`}</div>
    ${memoEdit ? `<input type="text" class="inp" id="stlDraft" value="${esc(draft)}" aria-label="메모" style="display:block;margin-top:10px;height:48px;border-radius:12px;padding:0 14px"><div class="s12" style="margin-top:6px">여기서는 저장되지 않아요 · 복사해서 채팅에 붙여 넣어 주세요</div>
      <div style="display:flex;gap:8px;margin-top:10px"><button type="button" class="btn-w" data-memocancel style="flex:1 1 0">취소</button><button type="button" class="btn-k" data-memocopy style="flex:2 1 0">채팅에 보낼 문구 복사</button></div>`
    : V.memo ? `<div style="font-size:16px;line-height:1.55;margin-top:10px;text-wrap:pretty">${esc(V.memo)}</div><div class="s12" style="margin-top:6px">${who ? who + ' · ' : ''}${V.memoAt ? V.memoAt + ' ' : ''}채팅에서</div>`
    : `<div class="sub" style="margin-top:10px;line-height:1.5">이번 달 한 줄 메모가 없어요</div>`}</section>`;
}

function render() {
  const X = stateFor(location.hash), key = location.hash;
  if (key !== lastKey) { ans = {}; notes = {}; openRec = null; memoEdit = false; guideOpen = X.st === 'pending'; lastKey = key; }
  const rows = records();
  if (X.vm && !X.vm.real) rows.push({ m: X.vm.m, base: X.vm.base, inc: X.vm.incTot, sp: X.vm.spTot, memo: X.vm.memo, buyD: buyAt(netOf(X.vm.assets), X.vm.asOf) - buyAt(netOf(X.vm.prev), X.vm.prevAsOf), legacy: false });
  let h = '';
  if (X.demo) h += `<div class="demo full">예시 화면 · 숫자는 실제가 아니에요 (${{ pre: '첫 결산 전', pending: '결산 미입력', short: '목표 대비 부족', ok: '달성' }[X.st]})<a href="#settle">실제 화면으로</a></div>`;
  if (X.st === 'pending') {
    const late = X.day > 3, dl = late ? `${X.day - 3}일 지남` : `D-${3 - X.day} · ${mon(ymAdd(X.m, 1))}월 3일까지`;
    h += `<section class="pend full"><div style="flex:1 1 300px;min-width:0"><span class="dd">${dl}</span><div class="t">${mon(X.m)}월 결산 파일을 보내주세요</div>
      <div class="d">두 사람 다 뱅크샐러드에서 ${X.m.slice(5)}.01~${X.m.slice(5)}.${lastDay(X.m)} 파일을 받아 채팅에 올려 주세요.${late ? ' 3일이 지나면 내보낸 날을 기준일로 적고 그대로 진행해요.' : ' Claude가 분류해서 이 화면을 채워요.'}</div></div>
      <div style="flex:0 1 auto;margin-left:auto"><button type="button" class="btn-l" data-openguide>보내는 방법</button></div></section>`;
  }
  h += header(X);
  if (X.st === 'pre') {
    h += guideCard(X.m, true);
    h += `<section class="dash full">${mon(X.m)}월 결산이 끝나면 여기에 <b style="color:var(--ink)">쓸 수 있는 저축 · 살 수 있는 집값 · 순자산</b>이 크게 나와요<br><span style="font-size:13px">지금 숫자는 홈에서 볼 수 있어요 · ${md(DATA.asOf)} 자산 기준</span></section>`;
    h += recCard(rows, true);
  } else if (X.st === 'pending') {
    const lr = rows[rows.length - 1];
    h += `<section class="cd full"><div style="font-size:15px;font-weight:700">${mon(X.m)}월 결과는 파일이 오면 채워져요</div><div class="sub" style="margin-top:2px">지금 보이는 숫자는 지난 기록 기준이에요</div>
      <div class="tiles"><div class="tile"><div class="s12">${lr ? mon(lr.m) + '월 ' : ''}쓸 수 있는 저축</div><b>${lr ? mw(lr.base) : '—'}</b></div>
        <div class="tile"><div class="s12">살 수 있는 집값 · ${md(DATA.asOf)}</div><b>${e2(canBuy)}</b></div>
        <div class="tile"><div class="s12">순자산 · ${md(DATA.asOf)}</div><b>${em(netNow)}</b></div></div></section>`;
    h += recCard(rows, false) + `<div class="side">${guideCard(X.m, false)}</div>`;
  } else {
    h += resultCards(X, rows) + recCard(rows, false) + `<div class="side">${memoCard(X.vm)}${guideCard(ymAdd(X.m, 1), false)}</div>`;
  }
  const cur = X.demo || 'real';
  h += `<div class="demos full"><span>다른 상태 미리 보기</span>${[['real', '지금'], ['pre', '첫 결산 전'], ['pending', '결산 미입력'], ['short', '부족'], ['ok', '달성']].map(([k, l]) => `<a href="${k === 'real' ? '#settle' : '#settle-demo-' + k}"${cur === k ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</div>`;
  STL.innerHTML = `<div class="sg">${h}</div>`;
}

// ----- 복사 · 상호작용 -----
function copyText(t) {
  const fb = () => { const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch {} ta.remove(); return ok; };
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(() => true, () => fb());
  return Promise.resolve(fb());
}
STL.addEventListener('click', e => {
  const t = e.target;
  const pk = t.closest('[data-pick]');
  if (pk) { const id = pk.dataset.pick, v = pk.dataset.v; ans[id] = ans[id] === v ? null : v; render(); if (ans[id] === 'no') { const i = STL.querySelector(`[data-note="${id}"]`); if (i) i.focus(); } return; }
  if (t.closest('[data-copychecks]')) {
    const X = stateFor(location.hash), V = X.vm; if (!V) return;
    const lines = V.checks.filter(c => ans[c.id]).map((c, i) => `${i + 1}. ${c.title} → ${ans[c.id] === 'yes' ? '맞아요' : '바꿀게요' + (notes[c.id] ? ': ' + notes[c.id] : '')}`);
    copyText(`[${mon(V.m)}월 결산 확인]\n` + lines.join('\n')).then(ok => toast(ok ? '채팅에 보낼 문구를 복사했어요' : '복사가 막혔어요 · 채팅에 직접 적어 주세요'));
    return;
  }
  const rc = t.closest('[data-rec]'); if (rc) { openRec = openRec === rc.dataset.rec ? null : rc.dataset.rec; render(); return; }
  if (t.closest('[data-guide]')) { guideOpen = !guideOpen; render(); return; }
  if (t.closest('[data-openguide]')) { guideOpen = true; render(); const g = $('#stlGuide'); if (g) g.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if (t.closest('[data-memo]')) { const X = stateFor(location.hash); memoEdit = true; draft = X.vm ? X.vm.memo : ''; render(); const i = $('#stlDraft'); if (i) i.focus(); return; }
  if (t.closest('[data-memocancel]')) { memoEdit = false; render(); return; }
  if (t.closest('[data-memocopy]')) { const X = stateFor(location.hash); copyText(`[${mon(X.m)}월 결산 메모 수정]\n` + draft).then(ok => toast(ok ? '메모 문구를 복사했어요 · 채팅에 붙여 넣어 주세요' : '복사가 막혔어요 · 채팅에 직접 적어 주세요')); memoEdit = false; render(); return; }
});
STL.addEventListener('input', e => { const n = e.target.closest('[data-note]'); if (n) notes[n.dataset.note] = n.value; if (e.target.id === 'stlDraft') draft = e.target.value; });

// ----- ⓘ 설명: 마우스는 올리면, 손가락은 누르면 고정 · 바깥을 누르면 닫힘 -----
const tipEl = document.createElement('div'); tipEl.className = 'simtip'; tipEl.setAttribute('role', 'tooltip'); tipEl.hidden = true; document.body.appendChild(tipEl);
let tipFor = null, pinned = false;
function showTip(btn, pin) {
  const [t, x] = TIPS[btn.dataset.tip] || ['', '']; if (!t) return;
  tipEl.innerHTML = `<b>${t}</b>${x}${pin ? '<small>고정됨 · 바깥을 누르면 닫혀요</small>' : ''}`; tipEl.hidden = false; tipFor = btn; pinned = pin;
  const r = btn.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  tipEl.style.left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 12)) + 'px';
  let top = r.bottom + 4; if (top + h > innerHeight - 76) top = Math.max(12, r.top - h - 4); tipEl.style.top = top + 'px';
}
function closeTip() { tipEl.hidden = true; tipFor = null; pinned = false; }
STL.addEventListener('pointerover', e => { const b = e.target.closest('[data-tip]'); if (b && e.pointerType === 'mouse' && !pinned) showTip(b, false); });
STL.addEventListener('pointerout', e => { const b = e.target.closest('[data-tip]'); if (b && e.pointerType === 'mouse' && !pinned && !b.contains(e.relatedTarget)) closeTip(); });
document.addEventListener('click', e => {
  const b = e.target.closest('#stl [data-tip]');
  if (b) { e.stopPropagation(); e.preventDefault(); if (pinned && tipFor === b) closeTip(); else showTip(b, true); return; }
  if (!tipEl.contains(e.target) && pinned) closeTip();
}, true);
addEventListener('scroll', () => { if (!tipEl.hidden) closeTip(); }, { passive: true });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeTip(); if (memoEdit) { memoEdit = false; render(); } } });

window.__settle = { render, closeTip, stateFor, records, vmDemo, netOf, buyAt };
})();

;
// ---- 원래 화면 스크립트 3/4 ----

// ===== 계산 기준 (현황판 11 · 10/13) — 숫자는 위 RULES·ASSUME·시뮬레이터 CREDIT/PAYRATE에서 바로 읽음. 여기엔 출처·점검일·버전 이력만 =====
(function () {
const BV = $('#bas');
const p = v => +(v * 100).toFixed(2) + '%';
const kor = v => { const e = Math.floor(v / 10000), m = Math.round(v % 10000); return e && m ? `${e}억 ${m.toLocaleString('ko-KR')}만원` : e ? `${e}억` : `${m.toLocaleString('ko-KR')}만원`; };
const e2b = v => (v / 10000).toFixed(2) + '억';
const md = s => { const [, m, d] = s.split('-'); return `${+m}.${+d}`; };
const daysAgo = s => Math.floor((Date.now() - new Date(s + 'T00:00:00')) / 864e5);

// 출처 종류: 점검일·재확인 기준(일)·다음 점검
const K = {
  rules:  { src: '2차 자료(블로그·언론)', date: () => ASSUME.rulesChecked, limit: 90, next: '매주 월 자동 점검' },
  stress: { src: '2차 자료(블로그·언론)', date: () => ASSUME.rulesChecked, limit: 90, next: '1·7월 점검' },
  zone:   { src: '2차 자료 · 계약 직전 구청 공고로 재확인', date: () => BASIS.zoneChecked, limit: 90, next: '매주 월 자동 점검' },
  rate:   { src: () => ASSUME.rateAsOf, date: () => ASSUME.rateChecked, limit: 45, next: '매월 1일 자동 점검' },
  credit: { src: '은행 공시 금리 사이 중간값', date: () => BASIS.creditChecked, limit: 45, next: '매월 1일 자동 점검' },
  ours:   { src: '부부 결정', date: () => BASIS.savingDecided, limit: 0, next: '월 결산 때 확인' },
  base:   { src: '계산 기본값 · 은행 상담 후 수정', date: () => ASSUME.rulesChecked, limit: 0, next: '은행 상담 때' },
};
const val = (o, k) => typeof o[k] === 'function' ? o[k]() : o[k];

function rows() {
  const R = RULES, A = ASSUME, S = window.__sim || {}, C = S.CREDIT || { rate: .053, cap: 10000, years: 10 }, P = S.PAYRATE;
  return {
    loan: [
      { n: '서울(규제지역) 일반 LTV', t: 'LTV: 집값 대비 빌릴 수 있는 비율', v: p(R.LTV.서울.일반), m: '서울 25개구 전역', k: 'rules' },
      { n: '생애최초 LTV', t: '처음 집을 사는 사람에게 주는 비율', v: p(R.LTV.서울.생애최초), m: '6개월 안 전입 의무', k: 'rules' },
      { n: '경기 비규제지역 LTV', v: p(R.LTV.경기.일반), m: '경기 12곳 규제지역은 서울 기준', k: 'rules' },
      { n: '수도권 대출 금액 상한', v: kor(R.cap), m: '시가 15억 이하 주택', k: 'rules' },
      { n: 'DSR (은행권)', t: 'DSR: 연소득 대비 1년 원리금 상환액 비율', v: p(R.DSR), m: '지금 목표에서 대출을 막는 기준', k: 'rules' },
      { n: '스트레스 금리', t: '한도를 계산할 때만 금리에 더하는 값', v: '+' + (R.stress * 100).toFixed(1) + '%p', m: '수도권 주담대 · 실제 이자엔 안 붙음', k: 'stress' },
      { n: '신생아특례 한도', v: kor(R.nbCap), m: '자료마다 4억/5억 달라 낮은 값 적용', k: 'rules' },
      { n: '신생아특례 주택·소득 상한', v: `${kor(R.nbHouse)} · ${kor(R.nbIncome)}`, m: '맞벌이 상향(최대 2억) 언급 있음, 확인 필요', k: 'rules' },
      { n: '신생아특례 DTI', t: 'DTI: 연소득 대비 주담대 원리금 비율', v: p(R.nbDTI), m: 'DSR 대신 적용 · 스트레스 금리 없음', k: 'rules' },
      { n: '신용대출 한도', v: `연소득 100% · 상한 ${kor(C.cap)}`, m: '1억 넘으면 1년간 규제지역 구입 제한 · 주담대 실행 뒤에 받기', k: 'rules' },
    ],
    zone: [
      { n: '규제지역 범위', t: '규제지역이면 일반 LTV가 40%로 낮아짐', v: '서울 25개구 + 경기 12곳', m: '토지거래허가구역 범위 · 2025-10-20 효력', k: 'zone' },
    ],
    assume: [
      { n: '주담대 금리', v: p(A.rate), m: '30년 원리금균등 · 살 수 있는 집값에 바로 영향', k: 'rate' },
      { n: '신생아특례 금리', v: p(A.nbRate), m: '특례 토글을 켰을 때만 사용', k: 'rules' },
      { n: '대출 만기', v: A.years + '년', m: '원리금균등 상환', k: 'base' },
      { n: '부대비용', t: '취득세·중개비·등기 등, 매매가 대비', v: p(A.cost), m: '필요 현금 = 매매가 × (1 + 부대비용) − 대출', k: 'base' },
      { n: '월 저축', v: Math.round(save).toLocaleString('ko-KR') + '만원', m: '고정비 뺀 저축 + 비상금 이체(251~271만)', k: 'ours' },
      { n: '신용대출 금리', v: `${p(C.rate)} · ${C.years}년`, m: '900점 이상 하단 4.3%와 전체 평균 6.33% 사이', k: 'credit' },
      { n: '월 상환 예측 금리', v: P ? `주담대 ${P.mort.map(p).join(' / ')}` : '—', m: P ? `신용대출 ${P.credit.map(p).join(' / ')} · ${P.why.join(' · ')}` : '', k: 'credit' },
    ],
  };
}

function status(k) {
  const o = K[k], d = val(o, 'date'), ago = daysAgo(d), over = o.limit > 0 && ago > o.limit;
  return { d, ago, over, src: val(o, 'src'), next: o.next, limit: o.limit };
}
function rowH(r) {
  const s = status(r.k);
  return `<div class="br">
    <div class="br-n"><b>${r.n}</b>${r.t ? `<span>${r.t}</span>` : ''}</div>
    <div class="br-v">${r.v}</div>
    <div class="br-m">${r.m || ''}</div>
    <div class="br-s"><span>${s.src}</span><span>${r.k === 'ours' ? '결정' : '점검'} ${md(s.d)} · ${s.ago}일 전${s.over ? ` <i class="bd-w">재확인 필요</i>` : ''}</span></div>
  </div>`;
}
function group(title, sub, list) {
  return `<div class="bg"><div class="bg-h"><span>${title}</span>${sub ? `<em>${sub}</em>` : ''}</div>
    <div class="br br-head" aria-hidden="true"><div>항목</div><div>값</div><div>메모</div><div>출처 · 마지막 점검</div></div>
    ${list.map(rowH).join('')}</div>`;
}

function render() {
  const G = rows(), all = [...G.loan, ...G.zone, ...G.assume];
  const overs = [...new Set(all.filter(r => status(r.k).over).map(r => r.n))];
  const cur = BASIS.history[0], prev = BASIS.history[1];
  BV.innerHTML = `
<section class="bc bh">
  <div class="bh-l">
    <div class="eb">계산 기준</div>
    <h1>기준 ${cur.v}</h1>
    <div class="s">${md(cur.from)}부터 적용 · 정책이나 가정이 바뀔 때만 버전을 올려요(화면 수정은 제외)</div>
    <div class="chips">
      ${overs.length ? `<span class="bd-w">재확인 필요 ${overs.length}개 · ${overs.join(', ')}</span>` : `<span class="bd-ok">재확인 필요 없음 · 금리 45일, 규칙 90일 기준</span>`}
      <span class="bd-n">대부분 2차 자료 · 계약 전 은행·주택도시기금 확인</span>
    </div>
  </div>
  <div class="bh-r">
    <div class="eb">이 기준으로 살 수 있는 집값</div>
    <div class="big">${e2b(canBuy)}</div>
    <div class="s">${T.region === '서울' ? '규제지역' : '비규제지역'} · ${T.type} · 소득 ${T.incomeBasis} · 월 저축 ${Math.round(save)}만 · ${DATA.asOf.slice(5).replace('-', '.')} 자산</div>
    ${prev ? `<div class="s">지난 기준(${prev.v})이라면 ${e2b(prev.buy)} · ${md(prev.assetsAsOf)} 자산 기준</div>` : ''}
  </div>
</section>

<section class="bc">
  <div class="sec"><div class="t">정책</div><div class="s">나라와 은행이 정한 규칙 · 규칙 매주 월요일, 스트레스 금리 1·7월 자동 점검 · 바뀌면 보고 후 승인받고 반영</div></div>
  ${group('대출', '', G.loan)}
  ${group('부동산 규제', '', G.zone)}
  <div class="bg"><div class="bg-h"><span>청약</span></div>
    <div class="none">계산에 반영하지 않아요. 당첨은 운이라 숫자로 넣으면 집이 실제보다 가깝게 보여요(D7). 청약 일정과 마감은 머니 미팅에서 PRD 미결정 표로 관리해요.</div></div>
</section>

<section class="bc">
  <div class="sec"><div class="t">가정</div><div class="s">우리가 정한 값 · 금리는 매월 1일 자동 점검</div></div>
  ${group('', '', G.assume)}
</section>

<section class="bc">
  <div class="sec"><div class="t">버전 이력</div><div class="s">집값 변화는 같은 자산(${BASIS.history[0].assetsAsOf.slice(5).replace('-', '.')})으로 다시 계산해 기준만의 효과를 보여줘요</div></div>
  <ol class="vh">${BASIS.history.map((h, i) => { const nx = BASIS.history[i + 1], d = nx ? h.buy - nx.buy : null;
    return `<li class="${i === 0 ? 'cur' : ''}">
      <div class="vh-h"><b>${h.v}</b>${i === 0 ? '<span class="bd-ok">지금</span>' : ''}<span class="dt">${md(h.from)}${i > 0 ? '~' + md(BASIS.history[i - 1].from) : '~'}</span>
        <span class="vb">살 수 있는 집값 <b>${e2b(h.buy)}</b>${d !== null ? ` <i class="${d < 0 ? 'dn' : 'up'}">${d < 0 ? '−' : '+'}${e2b(Math.abs(d))}</i>` : ''}</span></div>
      <ul>${h.changes.map(c => `<li>${c}</li>`).join('')}</ul>
      <div class="why">이유: ${h.why}</div></li>`; }).join('')}</ol>
</section>

<div class="foot">규칙이 바뀌었거나 은행에서 다른 숫자를 들으면 채팅에 알려주세요. 이 표와 PRD를 함께 고치고 버전을 올려요. 대출 규칙은 바뀔 수 있어 계약 전 은행 확인이 필요해요.</div>`;
}

// ----- 더보기 시트 (휴대폰 하단 탭) -----
const more = $('#more');
document.addEventListener('click', e => {
  if (e.target.closest('[data-more]')) { more.hidden = false; $('#moreX').focus(); return; }
  if (e.target.closest('#moreX') || e.target === more || e.target.closest('#more a')) more.hidden = true;
});
addEventListener('keydown', e => { if (e.key === 'Escape') more.hidden = true; });

window.__basis = { render, rows, status };
})();

;
// ---- 원래 화면 스크립트 4/4 ----

// ===== 시뮬레이터 (Claude Design 'NestSimulatorScreen' 10/11 · 계산은 위 엔진 그대로, 만원 단위) =====
(function () {
const SIM = $('#sim'), MAIN = document.querySelector('main');
const RG = { 서울: '규제지역', 경기: '비규제지역' };
const EMG = M(A.emergency);
const e2 = v => (v / 10000).toFixed(2) + '억';
const pl = v => { const x = Math.round(v / 1000) / 10; return (Number.isInteger(x) ? x : x.toFixed(1)) + '억'; };
const mw = v => v <= 0.5 ? '0원' : Math.round(v).toLocaleString('ko-KR') + '만원';
const hz = h => { const [y, m] = h.split('-'); return `${y}.${+m}`; };
const hzLong = h => { const [y, m] = h.split('-'); return `${y}년 ${+m}월`; };
const monthsFor = h => { const [y, m] = h.split('-').map(Number); return Math.max(1, (y - asOf.getFullYear()) * 12 + m - (asOf.getMonth() + 1)); };
const HORIZONS = [[T.date, hz(T.date)], ['2030-01', '2030.1 전세 연장']];
const hasData = finH + finW > 0;
const BASE = () => ({ price: T.price, region: T.region, horizon: T.date, save, cut: 0, incH: inc.H, incW: inc.W, joint: T.incomeBasis === '합산', type: T.type, pension: false, credit: false, cWho: 'H', cAmt: Math.min(10000, Math.round(inc.H / 100) * 100) });
// 신용대출(최후 카드): 연소득 100% · 은행 상한 1억 이내, 주담대 차주가 아닌 사람 명의로 주담대 실행 뒤 받는다고 가정
const CREDIT = { rate: .053, cap: 10000, years: 10 };   // 10/11 A안: 900점 이상 하단 4.3%(2025-11)와 전체 평균 6.33%(2026-08) 사이 중간값
// 월 상환 예측용 금리 시나리오 (최소 · 중간 · 최대)
// 주담대: 900점대 최저 은행 3.86%(2026-07 신규, 은행연합회) · 은행 평균 4.66%(2026-08, 한국은행) · 최근 5년 최고 5.64%(2022-12, 스트레스 금리 기준)
// 신용대출: 900점대 시중은행 하단 4.3%(2025-11) · 중간값 · 전체 평균 6.33%(2026-08, 한국은행)
const PAYRATE = { mort: [.039, .0466, .0564], credit: [.043, .053, .0633], label: ['최소', '중간', '최대'], why: ['금리 좋은 은행', '지금 평균', '최근 5년 최고'] };
const takeHome = (() => { const m = DATA.months.filter(x => !x.partial).slice(-1)[0]; return m ? M(m.incH + m.incW - (m.bonusH || 0)) : 0; })();
const credMax = X => Math.min(CREDIT.cap, Math.floor((X.cWho === 'H' ? X.incH : X.incW) / 100) * 100);
let S = BASE();

const TIPS = {
  tohuh: ['규제지역 (토지거래허가구역)', '서울 25개구 전역 + 경기 12곳(과천, 광명, 성남 분당·수정·중원, 수원 영통·장안·팔달, 안양 동안, 용인 수지, 의왕, 하남). 2년 실거주 의무. 지정은 바뀔 수 있어 계약 직전 구청 공고로 확인해요.'],
  dsr: ['DSR', '1년에 갚는 모든 대출 원리금이 연소득의 40%를 넘지 못해요. 한도를 계산할 때는 금리에 스트레스 금리 +3%p를 더해요.'],
  ltv: ['LTV', '집값 대비 빌릴 수 있는 비율이에요. 규제지역 일반은 40%, 생애최초는 70%까지예요.'],
  cap: ['금액 상한', '수도권 15억 이하 집은 소득·집값과 상관없이 주택담보대출이 최대 6억까지예요.'],
  nb: ['신생아특례', '2년 안에 출산한 가구 대상. 집값 9억·부부 소득 1.3억 이하, 대출은 최대 4억(보수적 적용). 소득은 DSR 대신 DTI 60%로 봐요.'],
  first: ['생애최초', '부부 모두 집을 가져 본 적 없을 때 받는 혜택이에요. 규제지역에서도 LTV가 70%까지 올라가요. 6개월 안에 전입해야 해요.'],
  joint: ['소득 합산', '혼인신고를 하면 두 사람 소득을 합쳐 DSR을 계산해요. 끄면 ⟦H⟧ 소득만으로 계산해요.'],
  pension: ['퇴직연금 (DC·IRP)', '지금은 묶인 자산으로 따로 둬요. 중도인출 조건과 세금이 있어 기본은 빼고 계산해요.'],
  buy: ['살 수 있는 집값', '목표일 예상 자산과 대출로 살 수 있는 가장 비싼 집이에요. 규제·비규제를 함께 보여줘요.'],
  cash: ['필요 현금', '매매가 + 부대비용 − 대출. 집 살 때 우리 돈으로 내야 하는 금액이에요.'],
  gap: ['목표일 부족액', '필요 현금에서 목표일 예상 자산(지금 순자산 + 월 저축 × 남은 달)을 뺀 금액이에요.'],
  save: ['월 저축 필요', '지금 순자산에서 시작해 목표일에 필요 현금을 채우려면 남은 기간 동안 매달 모아야 하는 돈이에요.'],
  cost: ['부대비용', '취득세 · 중개수수료 · 등기비 등. 매매가의 약 4%로 잡았어요.'],
  credit: ['신용대출 (최후 카드)', '연소득의 100%까지, 은행에 따라 최대 1억(국민·하나 2026-06~). 1억을 넘으면 1년간 규제지역 집을 못 사요. 주담대 차주가 아닌 사람 명의로, 주담대 실행 뒤에 받는다고 가정해요. 금리는 은행연합회 공시(900점 이상, 2025-11) 하단 4.3%와 전체 평균 6.33%(2026-08) 사이 5.3%로 잡았어요. 계약 전 은행 확인 필수.'],
};
const ii = (id, label) => `<button type="button" class="ii" data-tip="${id}" aria-label="${label || '설명'}"><span>i</span></button>`;
const SV = {
  target: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>',
  up: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  bank: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10l9-6 9 6M5 10v8M19 10v8M9.5 10v8M14.5 10v8M3 20h18"/></svg>',
  reset: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4"/></svg>',
  check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
  plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  bolt: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
  pen: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/></svg>',
  trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3"/></svg>',
  spark: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.2 6.3L20 10l-5.8 1.7L12 18l-2.2-6.3L4 10l5.8-1.7z"/></svg>',
};

// ----- 계산: 위 loan()/affordable()을 그대로 씀 -----
function calc(X) {
  const months = monthsFor(X.horizon), own = netNow + (X.pension ? EMG : 0), mon = X.save + X.cut, fut = own + mon * months;
  const ic = { H: X.incH, W: X.incW }, s = { price: X.price, region: X.region, type: X.type, incomeBasis: X.joint ? '합산' : '남편 단독' };
  const L = loan(s, ic);
  const buyR = affordable({ ...s, region: '서울' }, ic, fut), buyN = affordable({ ...s, region: '경기' }, ic, fut);
  const nb = X.type === '신생아특례';
  const cause = nb ? (L.reason === 'LTV' ? 'ltv' : L.reason === '소득(DSR)' ? 'dsr' : 'nb') : L.reason === 'LTV' ? 'ltv' : L.reason === '금액 상한' ? 'cap' : 'dsr';
  const credit = X.credit ? Math.min(X.cAmt, credMax(X)) : 0;
  const buyR2 = credit ? affordable({ ...s, region: '서울' }, ic, fut + credit) : buyR, buyN2 = credit ? affordable({ ...s, region: '경기' }, ic, fut + credit) : buyN;
  const short0 = Math.max(0, L.cash - fut), creditUsed = Math.min(credit, short0), gap = short0 - creditUsed;
  return { months, own, mon, fut, L, buyR: buyR2, buyN: buyN2, buy: X.region === '서울' ? buyR2 : buyN2, gap, surplus: Math.max(0, fut - L.cash),
    need: Math.max(0, (L.cash - credit - own) / months), ok: gap <= 0.5, cause, nb, blocked: L.reason === '특례 조건', ic,
    credit, creditUsed, cInt: creditUsed * CREDIT.rate / 12, cPmt: PMT(CREDIT.rate / 12, CREDIT.years * 12, creditUsed) };
}
const condText = X => `${pl(X.price)} · ${RG[X.region]} · ${X.type} · ${hz(X.horizon)}`;
const condFull = X => condText(X) + ` · 월 ${X.save + X.cut}만` + (X.joint ? '' : ' · ⟦H⟧ 단독 소득') + (X.pension ? ' · 퇴직연금 포함' : '') + (X.credit ? ` · 신용대출 ${DATA.names[X.cWho]} ${e2(Math.min(X.cAmt, credMax(X)))}` : '');
const KEYS = ['price', 'region', 'horizon', 'save', 'cut', 'type', 'joint', 'pension', 'credit', 'cWho', 'cAmt'];
const same = (a, b) => KEYS.every(k => a[k] === b[k]) && Math.round(a.incH) === Math.round(b.incH) && Math.round(a.incW) === Math.round(b.incW);
const goalDiff = X => X.price !== T.price || X.region !== T.region || X.horizon !== T.date || X.type !== T.type;

// ----- 화면 뼈대 (레버는 한 번만 만들고, 결과만 다시 그림) -----
const range = (id, min, max, step, color, label) => `<input type="range" id="${id}" min="${min}" max="${max}" step="${step}" aria-label="${label}" style="--c:${color}">`;
SIM.innerHTML = `
<div id="simBan"></div>
<section class="cardw goalbar">
  <div style="min-width:0">
    <div style="font-size:12px;color:var(--desc);font-weight:600">우리 목표</div>
    <h1><span class="g">${pl(T.price)}</span> · ${hzLong(T.date)} 실거주 · ${T.type}${ii('first', '생애최초 설명')}</h1>
  </div>
  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;min-width:0">
    <span class="pill-k" style="background:var(--ink);color:#fff;font-weight:600">${monthsLeft}개월 남음</span>
    <span class="pill-k" style="border:1px solid var(--line);color:var(--ink2)">${T.label.replace(' 실거주', '')} · 소득 ${T.incomeBasis}</span>
  </div>
</section>
<section class="cardw">
  <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
    <div><div class="h-big">레버</div><div class="sub12" style="margin-top:4px">하나씩 바꿔 보면 아래 결과가 달라져요</div></div>
    <button type="button" class="btn-o" id="simReset">${SV.reset}목표 값으로</button>
  </div>
  <div class="lv-row">
    <div class="lv">
      <div class="lv-h"><div class="lv-ic" style="background:var(--sub);color:var(--ink)">${SV.target}</div><div><div class="lv-t">목표 조정</div><div class="sub12">어떤 집을, 언제 살지</div></div></div>
      <div class="fld">
        <div class="fld-h"><span>가격</span><span style="display:flex;align-items:center;gap:6px"><span class="changed" id="lPriceCh" hidden>목표 ${pl(T.price)}에서 바꿈</span><b id="lPrice"></b></span></div>
        <div class="rg-wrap">${range('rPrice', 60000, 100000, 1000, 'var(--ink)', '가격')}<i class="rg-mark" style="left:calc(11px + (100% - 22px) * ${(T.price - 60000) / 40000})"></i></div>
        <div class="ends"><span>6억</span><span style="font-weight:600;color:var(--ink2)">${pl(T.price)} 목표</span><span>10억</span></div>
      </div>
      <div class="fld" style="gap:6px"><span style="font-size:14px;font-weight:600">지역</span>
        <div class="segm" role="radiogroup" aria-label="지역" id="gRegion"><div role="radio" tabindex="0" data-v="서울">규제지역${ii('tohuh', '규제지역 설명')}</div><div role="radio" tabindex="0" data-v="경기">비규제지역</div></div>
      </div>
      <div class="fld" style="gap:6px"><span style="font-size:14px;font-weight:600">입주 시점</span>
        <div class="segm" role="radiogroup" aria-label="입주 시점" id="gHorizon">${HORIZONS.map(([v, l]) => `<div role="radio" tabindex="0" data-v="${v}">${l}</div>`).join('')}</div>
        <div class="sub12">전세 연장은 지금 계약이 첫 계약일 때만 돼요 · 계약서 확인</div>
      </div>
    </div>
    <div class="lv">
      <div class="lv-h"><div class="lv-ic" style="background:var(--lime);color:var(--limeink)">${SV.up}</div><div><div class="lv-t">자산 늘리기</div><div class="sub12">목표일까지 모을 돈</div></div></div>
      <div class="fld">
        <div class="fld-h"><span>월 저축</span><span style="display:flex;align-items:center;gap:6px"><span class="changed" id="lSaveCh" hidden>기준 ${man(save)}에서 바꿈</span><b id="lSave"></b></span></div>
        ${range('rSave', 0, 500, 10, 'var(--lime)', '월 저축')}
        <div class="ends"><span>0</span><span>500만</span></div>
        <div class="sub12">10/10 부부가 정한 기준 · 일회성 지출 뺀 쓸 수 있는 저축</div>
        <div class="sub12">소비를 줄일 계획이면 줄일 금액만큼 월 저축을 올려 보세요</div>
      </div>
    </div>
    <div class="lv">
      <div class="lv-h"><div class="lv-ic" style="background:var(--ink);color:var(--lime)">${SV.bank}</div><div><div class="lv-t">대출 늘리기</div><div class="sub12">은행이 빌려줄 돈</div></div></div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div class="sub12">세전 연봉 · 금액을 직접 넣거나 밀어서 바꿔요 (예: 7,000만원)</div>
        ${['H', 'W'].map(k => `<div class="fld" style="gap:2px">
          <div class="fld-h" style="flex-wrap:nowrap"><span><span class="av22" style="${k === 'H' ? 'background:var(--ink);color:#fff' : 'background:var(--lime);color:var(--limeink)'}">${DATA.names[k][0] === '설' ? '빔' : '석'}</span>${DATA.names[k]} 연봉</span>
          <label style="display:flex;align-items:center;gap:6px;flex:none"><input class="num" type="text" inputmode="numeric" autocomplete="off" id="n${k}" value="${Math.round(inc[k]).toLocaleString('ko-KR')}" aria-label="${DATA.names[k]} 연봉(만원)"><span style="font-size:14px;color:var(--ink2)">만원</span></label></div>
          ${range('r' + k, 3000, 10000, 50, 'var(--lemon)', DATA.names[k] + ' 연봉')}
          <div class="ends"><span>3,000만</span><span>지금 ${man(inc[k])}</span><span>1억</span></div></div>`).join('')}
      </div>
      <div class="sw-row"><div style="min-width:0"><div style="font-size:14px;font-weight:600;display:flex;align-items:center">혼인신고 후 소득 합산${ii('joint', '소득 합산 설명')}</div><div class="sub12" id="lJoint"></div></div>
        <button type="button" class="sw" role="switch" id="swJoint" aria-label="소득 합산"><span></span></button></div>
      <div class="fld" style="gap:6px"><span style="font-size:14px;font-weight:600">대출 유형</span>
        <div class="segm" role="radiogroup" aria-label="대출 유형" id="gType"><div role="radio" tabindex="0" data-v="일반">일반</div><div role="radio" tabindex="0" data-v="생애최초" style="flex-grow:1.3">생애최초${ii('first', '생애최초 설명')}</div><div role="radio" tabindex="0" data-v="신생아특례" style="flex-grow:1.4">신생아특례${ii('nb', '신생아특례 설명')}</div></div>
        <div class="sub12">신생아특례는 기본 꺼짐 · 2년 안에 출산한 가구만 돼요</div>
      </div>
      <div class="sw-row"><div style="min-width:0"><div style="font-size:14px;font-weight:600;display:flex;align-items:center">퇴직연금 포함${ii('pension', '퇴직연금 설명')}</div><div class="sub12">기본 꺼짐 · 켜면 ${man(EMG)}원이 내 돈에 더해져요</div></div>
        <button type="button" class="sw" role="switch" id="swPension" aria-label="퇴직연금 포함"><span></span></button></div>
      <div style="border-top:1px dashed var(--line);margin:-4px 0 -8px"></div>
      <div class="sw-row"><div style="min-width:0"><div style="font-size:14px;font-weight:600;display:flex;align-items:center">신용대출 (최후 카드)${ii('credit', '신용대출 설명')}</div><div class="sub12">기본 꺼짐 · 켜면 잔금 때 모자란 돈을 신용대출로 메워요</div></div>
        <button type="button" class="sw" role="switch" id="swCredit" aria-label="신용대출 포함"><span></span></button></div>
      <div id="creditBox" hidden style="display:flex;flex-direction:column;gap:10px;margin-top:-6px;padding:12px;border-radius:12px;background:var(--sub)">
        <div class="fld" style="gap:6px"><span style="font-size:14px;font-weight:600">누구 명의로</span>
          <div class="segm" role="radiogroup" aria-label="신용대출 명의" id="gWho" style="background:#fff"><div role="radio" tabindex="0" data-v="H">${DATA.names.H}</div><div role="radio" tabindex="0" data-v="W">${DATA.names.W}</div></div></div>
        <div class="fld">
          <div class="fld-h"><span>금액</span><b id="lCredit"></b></div>
          <input type="range" id="rCredit" min="0" max="10000" step="100" aria-label="신용대출 금액" style="--c:var(--desc)">
          <div class="ends"><span>0</span><span id="lCreditMax"></span></div>
        </div>
        <div class="sub12" id="lCreditNote" style="line-height:1.5"></div>
      </div>
    </div>
  </div>
</section>
<div class="res-h"><div style="min-width:0"><div class="h-big">결과</div><div style="font-size:13px;color:var(--desc);margin-top:6px" id="simCond"></div></div><span class="asof">${hasData ? DATA.asOf.slice(5).replace('-', '.') + ' 자산 기준' : '자산 입력 전'}</span></div>
<div class="rcards" id="simCards"></div>
<section class="cardw" id="simPay"></section>
<div style="font-size:12px;color:var(--desc);padding:0 4px;display:flex;gap:6px 8px;flex-wrap:wrap;align-items:center"><span><a href="#basis">계산 기준 ${BASIS.history[0].v}</a> · 대출 규칙 ${ASSUME.rulesChecked} · 금리 가정 ${(ASSUME.rate * 100).toFixed(2)}%(${ASSUME.rateAsOf}) 기준 · 계약 전 은행 확인</span>${(() => { const d = k => Math.floor((Date.now() - new Date(ASSUME[k] + 'T00:00:00')) / 864e5), w = []; if (d('rateChecked') > 45) w.push(`금리 가정 ${d('rateChecked')}일 전 확인`); if (d('rulesChecked') > 90) w.push(`대출 규칙 ${d('rulesChecked')}일 전 확인`); return w.length ? `<span class="bdg-sh">재확인 필요 · ${w.join(' · ')}</span>` : ''; })()}</div>
<div class="two-sec"><section class="cardw wide" id="simCause"></section><section class="cardw" id="simSide"></section></div>
<section class="cardw" id="simScen"></section>
<div class="actbar"><div id="simAct"></div></div>`;

// ----- 레버 입력 -----
const setRange = (id, v) => { const r = $('#' + id); r.value = v; r.style.setProperty('--p', ((v - r.min) / (r.max - r.min) * 100) + '%'); };
function syncLevers() {
  setRange('rPrice', S.price); $('#lPrice').textContent = pl(S.price); $('#lPriceCh').hidden = S.price === T.price;
  setRange('rSave', S.save); $('#lSave').textContent = mw(S.save); $('#lSaveCh').hidden = S.save === save;
  ['H', 'W'].forEach(k => { const v = k === 'H' ? S.incH : S.incW; setRange('r' + k, Math.min(10000, Math.max(3000, v))); const n = $('#n' + k); if (document.activeElement !== n) n.value = Math.round(v).toLocaleString('ko-KR'); });
  [['gRegion', S.region], ['gHorizon', S.horizon], ['gType', S.type]].forEach(([g, v]) => $('#' + g).querySelectorAll('[data-v]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === v))));
  $('#swJoint').setAttribute('aria-checked', String(S.joint)); $('#swPension').setAttribute('aria-checked', String(S.pension));
  $('#swCredit').setAttribute('aria-checked', String(S.credit)); $('#creditBox').hidden = !S.credit;
  const cm = credMax(S), rc = $('#rCredit'); rc.max = cm; setRange('rCredit', Math.min(S.cAmt, cm));
  $('#gWho').querySelectorAll('[data-v]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === S.cWho)));
  $('#lCredit').textContent = mw(Math.min(S.cAmt, cm)); $('#lCreditMax').textContent = `최대 ${man(cm)} (연소득 100%${cm >= CREDIT.cap ? ' · 은행 상한 1억' : ''})`;
  const who = DATA.names[S.cWho];
  $('#lCreditNote').innerHTML = [`금리 ${(CREDIT.rate * 100).toFixed(1)}% 가정(신용점수 900점 이상) · 주담대 실행 <b>뒤에</b> 받아야 주담대 한도가 안 줄어요`,
    !S.joint && S.cWho === 'H' ? `<b style="color:var(--warn)">주담대 차주(${who})와 같은 명의예요.</b> 신용대출이 같은 DSR에 잡혀 은행 심사에서 막힐 수 있어요` : S.joint ? `주담대에 부부 합산 소득을 쓰면, 같은 소득으로 ${who} 신용대출이 되는지는 은행마다 달라요 · 상담 때 확인` : '',
    '1억이 넘으면 1년간 규제지역 집을 못 사요(그래서 1억까지만) · 토허제 지역은 자금조달계획서에 적어야 해요'].filter(Boolean).join('<br>');
  $('#lJoint').textContent = S.joint ? `합산 연소득 ${e2(S.incH + S.incW)} · ${DATA.names.H} ${man(S.incH)} + ${DATA.names.W} ${man(S.incW)}` : `${DATA.names.H} 소득 ${man(S.incH)}만으로 계산 · 혼인신고 전`;
}
function upd(patch) { S = { ...S, ...patch }; syncLevers(); render(); }
$('#rPrice').addEventListener('input', e => upd({ price: +e.target.value }));
$('#rSave').addEventListener('input', e => upd({ save: +e.target.value }));
['H', 'W'].forEach(k => {
  $('#r' + k).addEventListener('input', e => upd({ ['inc' + k]: +e.target.value }));
  // 숫자를 넣는 즉시 막대가 따라 움직이고 결과가 바뀜 (칸을 벗어나면 쉼표 넣어 정리)
  const n = $('#n' + k), val = () => parseInt(n.value.replace(/[^0-9]/g, ''), 10);
  n.addEventListener('input', () => { const v = val(); if (v >= 1000 && v <= 30000) upd({ ['inc' + k]: v }); });
  const commit = () => { const v = val(); if (v >= 1000 && v <= 30000) upd({ ['inc' + k]: v }); else toast('연봉은 1,000만~3억 사이로 넣어 주세요'); n.value = Math.round(k === 'H' ? S.incH : S.incW).toLocaleString('ko-KR'); };
  n.addEventListener('change', commit); n.addEventListener('blur', commit); n.addEventListener('keydown', e => { if (e.key === 'Enter') { commit(); n.blur(); } });
  // 처음 누르면 칸 전체가 선택돼서 바로 새 금액을 칠 수 있음
  n.addEventListener('focus', () => { n.dataset.fresh = '1'; });
  n.addEventListener('pointerup', e => { if (n.dataset.fresh) { e.preventDefault(); n.select(); delete n.dataset.fresh; } });
  n.addEventListener('keydown', () => { delete n.dataset.fresh; });
});
[['gRegion', 'region'], ['gHorizon', 'horizon'], ['gType', 'type']].forEach(([g, key]) => $('#' + g).addEventListener('click', e => { if (e.target.closest('.ii')) return; const b = e.target.closest('[data-v]'); if (b) upd({ [key]: b.dataset.v }); }));
SIM.addEventListener('keydown', e => { const r = e.target.closest('[role=radio]'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); r.click(); } });
$('#swJoint').addEventListener('click', () => upd({ joint: !S.joint }));
$('#swPension').addEventListener('click', () => upd({ pension: !S.pension }));
$('#swCredit').addEventListener('click', () => upd({ credit: !S.credit }));
$('#rCredit').addEventListener('input', e => upd({ cAmt: +e.target.value }));
$('#gWho').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { const X = { ...S, cWho: b.dataset.v }; upd({ cWho: b.dataset.v, cAmt: credMax(X) }); } });
$('#simReset').addEventListener('click', () => { upd(BASE()); toast('목표 값으로 되돌렸어요'); });

// ----- 결과 -----
const dash = '<div class="rc-v" style="color:var(--ph)">—</div>';
function renderBanner() {
  const sN = (DATA.settlements || {})[DATA.asOf.slice(0, 7)] ? 1 : 0, due = new Date(asOf.getFullYear(), asOf.getMonth() + 1 + sN, 3, 23, 59), now = new Date(), dueM = (due.getMonth() + 11) % 12 + 1;
  let h = '';
  if (!hasData) h = `<div class="banner"><div class="bi" style="background:var(--lime);color:var(--limeink)">${SV.plus}</div><div class="bt"><b>먼저 우리 자산을 넣어 주세요</b><div>첫 결산 파일을 올리면 순자산이 채워지고, 레버를 바꿀 때마다 결과가 계산돼요. 목표와 레버는 지금도 둘러볼 수 있어요.</div></div><button type="button" class="btn-lime" data-settle>첫 결산 하기</button></div>`;
  else if (now > due) {
    const late = Math.floor((now - due) / 864e5) + 1, mm = String(due.getMonth() + 1).padStart(2, '0');
    h = `<div class="banner"><div class="bi" style="background:var(--ink);color:var(--lime)">${SV.bolt}</div><div class="bt"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0"><b>${dueM}월 결산이 아직이에요</b><span style="font-size:12px;color:var(--ink2);background:var(--line2);border-radius:6px;padding:2px 8px">마감 ${mm}.03 · ${late}일 지남</span></div><div>아래 결과는 ${asOf.getMonth() + 1}월 ${asOf.getDate()}일 자산 기준이에요. 결산을 넣으면 이 화면이 다시 계산돼요.</div></div><button type="button" class="btn-lime" data-settle>결산하기</button></div>`;
  }
  $('#simBan').innerHTML = h;
}
function renderCards(R) {
  $('#simCond').textContent = condText(S) + ' 조건';
  if (!hasData) {
    $('#simCards').innerHTML = `<div class="rc w2"><span class="rc-l">살 수 있는 집값</span><div class="buy"><div class="on" style="box-shadow:inset 0 0 0 2px var(--zero)"><div class="bl">규제지역</div><div class="bv" style="color:var(--ph)">—</div></div><div class="off"><div class="bl">비규제지역</div><div class="bv" style="color:var(--ph)">—</div></div></div><div class="sub12" style="margin-top:10px">자산을 넣으면 두 지역 값을 나란히 보여드려요</div></div>
      <div class="rc"><span class="rc-l">대출 가능액</span>${dash}<div class="rc-s">결산 후 표시</div></div><div class="rc"><span class="rc-l">필요 현금</span>${dash}<div class="rc-s">매매가 + 부대비용 − 대출</div></div><div class="rc"><span class="rc-l">목표일 부족액</span>${dash}<div class="rc-s">자산 입력 후 계산돼요</div></div><div class="rc w15"><span class="rc-l">월 저축</span>${dash}<div class="rc-s">부부가 정한 기준 ${mw(R.mon)}</div></div>`;
    return;
  }
  const alt = S.type === '일반' ? '생애최초' : '일반', a = calc({ ...S, type: alt });
  const col = (rg, v) => S.region === rg ? `<div class="on"><div class="bl">${RG[rg]}<i>고른 지역</i></div><div class="bv">${e2(v)}</div></div>` : `<div class="off"><div class="bl">${RG[rg]}</div><div class="bv">${e2(v)}</div></div>`;
  const scale = Math.max(R.need, R.mon, 1), nowW = Math.min(R.mon, R.need || R.mon) / scale * 100;
  $('#simCards').innerHTML = `
  <div class="rc w2">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;min-height:24px"><span class="rc-l">살 수 있는 집값${ii('buy')}</span>${R.ok ? `<span class="bdg-ok">${pl(S.price)} 넘음 · 달성</span>` : `<span class="bdg-sh">목표 ${pl(S.price)}의 ${Math.min(99, Math.floor(R.buy / S.price * 100))}%</span>`}</div>
    <div class="buy">${col('서울', R.buyR)}${col('경기', R.buyN)}</div>
    <div class="sub12" style="margin-top:10px">${alt} 대출이면 규제 ${e2(a.buyR)} · 비규제 ${e2(a.buyN)}</div>
  </div>
  <div class="rc"><span class="rc-l">대출 가능액</span><div class="rc-v">${e2(R.L.amount)}</div><div class="rc-s">${R.blocked ? '신생아특례 조건을 넘어 특례 대출 불가' : `월 상환 ${man(R.L.monthly)}원 · 30년 · 금리 ${((R.nb ? ASSUME.nbRate : ASSUME.rate) * 100).toFixed(1)}%`}${R.creditUsed > 0.5 ? `<br><b style="color:var(--ink)">+ 신용대출 ${e2(R.creditUsed)}</b> (${DATA.names[S.cWho]}) · 이자만 월 ${man(R.cInt)}원, 10년 분할이면 월 ${man(R.cPmt)}원` : S.credit ? '<br>신용대출은 켜 뒀지만 지금 조건에선 쓸 일이 없어요' : ''}</div></div>
  <div class="rc"><span class="rc-l">필요 현금${ii('cash')}</span><div class="rc-v">${e2(R.L.cash)}</div><div class="rc-s">${pl(S.price)} + 부대비용 ${e2(S.price * ASSUME.cost)} − 대출 ${e2(R.L.amount)}${R.creditUsed > 0.5 ? ` · 이 중 ${e2(R.creditUsed)}은 신용대출` : ''}</div></div>
  <div class="rc"><span class="rc-l">목표일 부족액${ii('gap')}</span>${R.ok ? `<div class="rc-v" style="color:var(--good)">없음</div><div class="rc-s">${R.creditUsed > 0.5 ? `신용대출 ${e2(R.creditUsed)}로 메움 · 목표일 예상 자산 ${e2(R.fut)}` : `목표일 예상 자산 ${e2(R.fut)} · <b style="color:var(--ink)">${e2(R.surplus)} 남아요</b>`}</div>` : `<div class="rc-v" style="color:var(--warn)">${e2(R.gap)}</div><div class="rc-s">목표일 예상 자산 ${e2(R.fut)} 기준</div>`}</div>
  <div class="rc w15"><span class="rc-l">월 저축${ii('save')}</span>
    <div style="display:flex;gap:4px 16px;align-items:flex-start;flex-wrap:wrap;margin-top:clamp(10px,(100cqi - 600px) * 100,44px)">
      <div><div class="rc-v" style="margin:0">${mw(R.need)}</div><div class="sub12" style="margin-top:4px">필요</div></div><div style="font-size:13px;color:var(--desc);line-height:31px">vs</div>
      <div><div class="rc-v" style="margin:0">${mw(R.mon)}</div><div class="sub12" style="margin-top:4px">지금</div></div></div>
    <div style="position:relative;margin-top:14px"><div class="sbar"><div style="width:${nowW}%;background:var(--lime)"></div><div style="width:${R.ok ? 0 : (R.need - R.mon) / scale * 100}%;background:var(--orange2)"></div></div>
      <div style="position:absolute;left:${R.need / scale * 100}%;top:-4px;width:2px;height:18px;margin-left:-2px;background:var(--ink);border-radius:1px"></div></div>
    <div class="rc-s">${R.ok ? `필요보다 ${mw(R.mon - R.need)} 더 모으는 중` : `매달 ${mw(R.need - R.mon)} 더 모아야 제때 닿아요`}</div>
  </div>`;
}
function causeText(R) {
  const pct = Math.round(RULES.LTV[S.region][S.type] * 100);
  if (!hasData) return '자산과 소득이 들어오면 네 가지 중 어디서 막히는지 표시돼요.';
  if (R.blocked) return `신생아특례 조건(집값 9억 · 부부 소득 1.3억 이하)을 넘어 특례 대출을 받을 수 없어요. 가격을 9억 이하로 낮추거나 다른 대출 유형을 골라 보세요.`;
  if (R.cause === 'dsr') return `소득 한도(${R.nb ? 'DTI 60%' : 'DSR'})에 먼저 막혀요. 집값 기준(LTV ${pct}%)으로는 ${e2(R.L.ltv)}까지 되지만 소득으로는 ${e2(R.L.repay)}이 최대예요. 연봉 · 소득 합산 레버가 여기에 닿아요.`;
  if (R.cause === 'ltv') return `집값의 ${pct}%(LTV)에 먼저 닿아요. ${pl(S.price)}이면 대출은 ${e2(R.L.amount)}가 최대고, 소득 한도(${e2(R.L.repay)})는 아직 여유가 있어요.` + (S.type === '일반' && S.region === '서울' ? ' 생애최초면 70%까지 올라가요.' : '');
  if (R.cause === 'cap') return `주택담보대출 금액 상한(6억)에 닿아요. 소득과 집값이 더 늘어도 대출은 6억이 최대예요.`;
  return `신생아특례 한도(4억)에 닿아요. 집값·소득 기준으로는 더 되지만 특례 대출은 4억이 최대예요.`;
}
function renderCause(R) {
  const cz = [['dsr', '소득(DSR)'], ['ltv', 'LTV'], ['cap', '금액 상한'], ['nb', '특례 한도']].map(([id, l]) => hasData && R.cause === id
    ? `<span class="cz on">${l}<em>여기서 막힘</em>${ii(id)}</span>` : `<span class="cz off">${l}${ii(id)}</span>`).join('');
  const add = R.ok ? Math.max(0, Math.min(R.mon * R.months, R.L.cash - R.creditUsed - R.own)) : R.mon * R.months, cu = R.creditUsed > 0.5;
  const fund = !hasData ? `<div style="height:32px;margin-top:12px;border-radius:7px;background:var(--line2);outline:1.5px dashed var(--zero);outline-offset:-1.5px"></div><div class="rc-s" style="margin-top:10px">자산이 들어오면 내 돈 · 대출 · 부족분이 이 막대에 채워져요</div>`
    : `<div class="fund"><div style="flex:${R.own} 1 0;background:var(--lime);background-image:var(--hatch)"></div><div style="flex:${add} 1 0;background:var(--lime2);outline:1.5px dashed rgba(20,20,20,.25);outline-offset:-1.5px"></div><div style="flex:${R.L.amount} 1 0;background:var(--ink)"></div>${cu ? `<div style="flex:${R.creditUsed} 1 0;background:var(--desc);background-image:var(--hatch)"></div>` : ''}${R.ok ? '' : `<div style="flex:${R.gap} 1 0;background:var(--orange)"></div>`}</div>
      <div class="flg"><div><i style="background:var(--lime)"></i><div><div class="sub12">내 돈 · 지금 순자산${S.pension ? '+퇴직연금' : ''}</div><b>${e2(R.own)}</b></div></div>
        <div><i style="background:var(--lime2);outline:1px dashed rgba(20,20,20,.35)"></i><div><div class="sub12">내 돈 · 목표일까지 저축</div><b>${e2(add)}${R.ok ? ' (쓸 만큼)' : ''}</b></div></div>
        <div><i style="background:var(--ink)"></i><div><div class="sub12">대출</div><b>${e2(R.L.amount)}</b></div></div>
        ${cu ? `<div><i style="background:var(--desc)"></i><div><div class="sub12">신용대출 · 최후 카드</div><b>${e2(R.creditUsed)}</b></div></div>` : ''}
        ${R.ok ? '' : `<div><i style="background:var(--orange)"></i><div><div class="sub12">부족분</div><b style="color:var(--warn)">${e2(R.gap)}</b></div></div>`}</div>
      ${R.ok ? `<div class="note-box">${cu ? `목표일 자산 ${e2(R.fut)}을 모두 쓰고 <b>신용대출 ${e2(R.creditUsed)}</b>로 나머지를 메워요 · 매달 갚을 돈이 늘어나요` : `목표일 자산 ${e2(R.fut)} 중 ${e2(R.L.cash)}을 쓰고 <b>${e2(R.surplus)}이 남아요</b>`}</div>` : ''}`;
  $('#simCause').innerHTML = `<div class="sec-t">대출이 막힌 원인</div><div class="chipz">${cz}</div><div style="font-size:14px;color:var(--ink2);margin-top:12px;line-height:1.55;text-wrap:pretty">${causeText(R)}</div>
    <div style="height:1px;background:var(--line2);margin:20px 0 18px"></div>
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:4px 12px;flex-wrap:wrap"><div class="sec-t">자금 구성${ii('cost', '부대비용 설명')}</div><div style="font-size:13px;color:var(--desc)">매매가 ${pl(S.price)} + 부대비용 ${e2(S.price * ASSUME.cost)} = ${e2(S.price * (1 + ASSUME.cost))}</div></div>${fund}`;
}
let SUG = [];
function suggestions(R) {
  const out = [], eff = (X, icon, t) => { const R2 = calc(X); return { X, icon, t, R2 }; };
  if (S.horizon === T.date) out.push(eff({ ...S, horizon: '2030-01' }, 'target', '입주 시점 2030.1로 전세 연장'));
  if (S.save < 500) { const v = Math.min(500, S.save + 130); out.push(eff({ ...S, save: v }, 'up', `월 저축 ${S.save}만 → ${v}만`)); }
  if (!S.joint) out.push(eff({ ...S, joint: true }, 'bank', '혼인신고 후 소득 합산'));
  // 연봉 인상: 두 사람 연봉을 같은 비율로 올려, 목표에 닿거나 더 올라도 집값이 안 오르는(LTV 등에 막힘) 지점을 찾음
  if (S.joint && (R.cause === 'dsr')) {
    let r = 0, prev = R.buy, hit = null;
    for (let k = 1; k <= 120; k++) { const x = k * 0.005, X = { ...S, incH: S.incH * (1 + x), incW: S.incW * (1 + x) }, R2 = calc(X);
      if (R2.ok) { hit = { X, R2, x, cap: false }; break; }
      if (R2.buy - prev < 1 && k > 1) { const X0 = { ...S, incH: S.incH * (1 + r), incW: S.incW * (1 + r) }; hit = { X: X0, R2: calc(X0), x: r, cap: true }; break; }
      prev = R2.buy; r = x; }
    if (hit && hit.x > 0) { const now = S.incH + S.incW, to = now * (1 + hit.x);
      out.push({ X: hit.X, R2: hit.R2, icon: 'bank', t: `연봉 합계 ${e2(now)} → ${e2(to)} (둘 다 +${Math.round(hit.x * 100)}%)`, note: hit.cap ? `그 이상은 연봉이 올라도 LTV(집값의 ${Math.round(RULES.LTV[S.region][S.type] * 100)}%)에 막혀요` : '' }); }
  }
  const pR = Math.floor(R.buyR / 5000) * 5000, pN = Math.floor(R.buyN / 5000) * 5000, rg = pR > pN ? '서울' : '경기', p = Math.max(pR, pN);
  if (p >= 60000 && p < S.price) out.push(eff({ ...S, price: p, region: rg }, 'target', `가격 ${pl(p)} · ${RG[rg]}`));
  return out.slice(0, 4);
}
function renderSide(R) {
  const el = $('#simSide');
  if (!hasData) { el.innerHTML = `<div class="sec-t">어떤 레버를 당길까?</div><div class="rc-s" style="margin-top:2px">자산이 들어오면 효과가 큰 레버부터 골라 드려요</div><div style="display:flex;flex-direction:column;gap:8px;margin-top:14px"><div style="height:64px;border-radius:14px;background:var(--sub)"></div><div style="height:64px;border-radius:14px;background:var(--sub);opacity:.7"></div><div style="height:64px;border-radius:14px;background:var(--sub);opacity:.45"></div></div>`; return; }
  if (R.ok) {
    const other = S.region === '서울' ? '경기' : '서울', ob = other === '서울' ? R.buyR : R.buyN;
    el.innerHTML = `<div style="display:flex;align-items:center;gap:10px"><span style="width:36px;height:36px;border-radius:50%;background:var(--lime);color:var(--limeink);display:flex;align-items:center;justify-content:center;flex:none">${SV.check}</span><div class="sec-t">이 조건이면 ${hzLong(S.horizon)}에 닿아요</div></div>
      <div style="display:flex;flex-direction:column;margin-top:14px"><div class="okrow"><span style="color:var(--desc)">살 수 있는 집값</span><b>${e2(R.buy)} ≥ ${pl(S.price)}</b></div>${R.creditUsed > 0.5 ? `<div class="okrow"><span style="color:var(--desc)">신용대출로 메우는 돈</span><b>${e2(R.creditUsed)} · 월 ${man(R.cPmt)}원(10년)</b></div>` : `<div class="okrow"><span style="color:var(--desc)">목표일에 남는 돈</span><b style="color:var(--good)">${e2(R.surplus)}</b></div>`}<div class="okrow" style="border:0"><span style="color:var(--desc)">월 저축 필요 / 지금</span><b>${man(R.need)} / ${man(R.mon)}</b></div></div>
      <div class="note-box" style="margin-top:10px">${ob >= S.price ? `${RG[other]}으로 바꿔도 ${e2(ob)}이라 지역은 넓게 봐도 돼요.` : `${RG[other]}이면 ${e2(ob)}이라 이 가격엔 모자라요.`} ${goalDiff(S) ? '이 조건을 목표로 삼으려면 아래 ‘목표로 설정’을 누르세요.' : '지금 목표 그대로 닿아요.'}</div>`;
    return;
  }
  SUG = suggestions(R);
  const icBg = { target: 'background:#fff;color:var(--ink)', up: 'background:var(--lime);color:var(--limeink)', bank: 'background:var(--ink);color:var(--lime)' };
  el.innerHTML = `<div class="sec-t">어떤 레버를 당길까?</div><div class="rc-s" style="margin-top:2px">목표까지 ${e2(R.gap)}. 하나만 당겨도 이만큼 달라져요.</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">${SUG.map((g, i) => `<button type="button" class="sug" data-sug="${i}"><span class="si" style="${icBg[g.icon]}">${SV[g.icon]}</span>
      <span style="flex:1;min-width:0"><span style="display:block;font-weight:600">${g.t}</span><span style="display:block;font-size:13px;color:var(--desc);margin-top:2px">${g.X.price !== S.price ? `살 수 있는 집값 <b style="color:var(--ink)">${e2(g.R2.buy)}</b> ${g.R2.ok ? '≥' : '<'} ${pl(g.X.price)}` : `살 수 있는 집값 ${e2(R.buy)} → <b style="color:var(--ink)">${e2(g.R2.buy)}</b>`}${g.note ? ` · ${g.note}` : ''}</span></span>
      ${g.R2.ok ? `<span class="bdg-ok">${g.X.price !== S.price ? '달성' : '목표 넘음'}</span>` : `<span class="bdg-sh">${e2(g.R2.gap)} 남음</span>`}</button>`).join('')}</div>
    <div class="sub12" style="margin-top:10px">누르면 그 레버만 바꿔서 결과를 보여줘요</div>`;
}
$('#simSide').addEventListener('click', e => { const b = e.target.closest('[data-sug]'); if (b && SUG[+b.dataset.sug]) { upd(SUG[+b.dataset.sug].X); toast('레버를 바꿨어요 · ‘목표 값으로’로 되돌릴 수 있어요'); } });

// ----- 시나리오 (이 기기에 저장 · 결과는 저장하지 않고 열 때마다 다시 계산) -----
const SKEY = 'nest-scen-v1', MAXSAVED = 2;
let scen = (() => { try { const v = JSON.parse(store.get(SKEY) || '[]'); return Array.isArray(v) ? v.filter(x => x && x.S && x.name).slice(0, MAXSAVED) : []; } catch { return []; } })();
let justSaved = '';
const persist = () => store.set(SKEY, JSON.stringify(scen));
function scCard(o, idx) {
  const R = calc(o.S), cur = same(o.S, S);
  return `<div class="sc${cur ? ' cur' : ''}"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0"><span style="font-size:16px;font-weight:700;letter-spacing:-0.02em">${esc(o.name)}</span>${cur ? '<span style="font-size:12px;font-weight:600;color:#fff;background:var(--ink);border-radius:6px;padding:1px 7px;white-space:nowrap">지금 보는 중</span>' : ''}</div>
      ${idx < 0 ? '' : `<span style="display:flex;gap:2px"><button type="button" class="icb" data-ren="${idx}" aria-label="이름 수정">${SV.pen}</button><button type="button" class="icb" data-del="${idx}" aria-label="삭제">${SV.trash}</button></span>`}</div>
    <div class="meta">${idx < 0 ? '<span>부부 목표 · PRD 기준</span>' : `<span style="display:inline-flex;align-items:center;gap:4px;white-space:nowrap">${o.mine ? '직접 지은 이름' : SV.spark + '추천 이름'}</span><span>·</span><span>${esc(o.date)} 저장</span>`}</div>
    <div class="cond">${condFull(o.S)}</div>
    <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:12px"><div><div class="sub12">살 수 있는 집값</div><div style="font-size:26px;font-weight:800;letter-spacing:-0.03em;line-height:1.1;white-space:nowrap;margin-top:2px">${e2(R.buy)}</div></div>
      ${R.ok ? `<span class="bdg-ok">달성 · ${e2(R.surplus)} 여유</span>` : `<span class="bdg-sh">${e2(R.gap)} 부족</span>`}</div>
    <div class="kv2"><span>대출 가능액</span><b>${e2(R.L.amount)}</b><span>필요 현금</span><b>${e2(R.L.cash)}</b><span>목표일 부족액</span><b>${R.ok ? '없음' : e2(R.gap)}</b><span>월 저축 필요</span><b>${mw(R.need)}</b></div>
    ${cur ? '' : `<button type="button" class="btn-w" style="width:100%;margin-top:12px;height:40px" data-load="${idx}">이 조건으로 보기</button>`}</div>`;
}
function renderScen() {
  const el = $('#simScen');
  const head = `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px 12px;flex-wrap:wrap"><div><div class="h-big">시나리오 비교</div><div class="sub12" style="margin-top:4px">현재 목표 + 저장한 시나리오 최대 ${MAXSAVED}개 · 이 기기에만 저장돼요</div></div>${justSaved ? `<span style="display:flex;align-items:center;gap:6px;min-height:32px;padding:4px 10px;border-radius:9px;background:var(--lime2);color:var(--limeink);font-size:13px;font-weight:600">${SV.check}‘${esc(justSaved)}’ 저장했어요</span>` : ''}</div>`;
  if (!hasData) { el.innerHTML = head + `<div style="margin-top:14px;border-radius:14px;border:1.5px dashed var(--zero);padding:28px 16px;text-align:center;color:var(--desc);font-size:14px;line-height:1.55">저장한 시나리오가 없어요<br>레버를 바꾼 뒤 ‘시나리오 저장’을 누르면 여기서 나란히 비교해요</div>`; return; }
  el.innerHTML = head + `<div class="scg">${scCard({ name: '현재 목표', S: BASE() }, -1)}${scen.map((o, i) => scCard(o, i)).join('')}${Array.from({ length: Math.max(0, MAXSAVED - scen.length) }, (_, k) => `<button type="button" class="slot" data-save>${'<span style="width:40px;height:40px;border-radius:50%;background:var(--line2);color:var(--ink);display:flex;align-items:center;justify-content:center">' + SV.plus + '</span>'}<b style="color:var(--ink);font-size:15px">빈 자리</b><span>${k === 0 ? '지금 조건을 저장하면 여기에 놓여요' : '다음에 저장한 시나리오가 놓여요'}</span></button>`).join('')}</div>`;
}
$('#simScen').addEventListener('click', e => {
  const t = e.target.closest('[data-load],[data-del],[data-ren],[data-save]'); if (!t) return;
  if (t.dataset.load !== undefined) { const i = +t.dataset.load; upd(i < 0 ? BASE() : scen[i].S); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  else if (t.dataset.del !== undefined) { scen.splice(+t.dataset.del, 1); persist(); justSaved = ''; render(); toast('시나리오를 지웠어요'); }
  else if (t.dataset.ren !== undefined) openSave(+t.dataset.ren);
  else openSave();
});

// ----- 하단 바 · 저장 창 · 목표로 설정 -----
function renderAct() {
  const diff = goalDiff(S);
  $('#simAct').innerHTML = `<div style="flex:1 1 240px;min-width:0;font-size:13px;color:var(--desc);line-height:1.5"><b style="color:var(--ink)">${hasData ? '지금 레버: ' + condText(S) : '자산을 넣으면 저장 · 설정이 켜져요'}</b><span class="an"><br>${!hasData ? '목표와 레버는 지금도 둘러볼 수 있어요' : diff ? '목표로 설정하면 변경 내용이 복사돼요 · 채팅에 붙여 넣으면 대시보드에 반영돼요' : '지금 목표와 같은 조건이에요 · 레버를 바꾸면 ‘목표로 설정’이 켜져요'}</span></div>
    <div style="display:flex;gap:8px;flex:1 1 280px;max-width:400px;margin-left:auto"><button type="button" class="btn-w" data-save ${hasData ? '' : 'disabled'}>시나리오 저장</button><button type="button" class="btn-k" id="simSet"${hasData && diff ? '' : ' aria-disabled="true"'}>목표로 설정</button></div>`;
}
$('#simAct').addEventListener('click', e => { if (e.target.closest('[data-save]')) openSave(); const st = e.target.closest('#simSet'); if (st) { if (st.getAttribute('aria-disabled') === 'true') toast(hasData ? '가격 · 지역 · 입주 시점 · 대출 유형 중 하나를 목표와 다르게 바꾸면 켜져요' : '자산을 넣으면 켜져요'); else openConfirm(); } });
function names(X) {
  const R = calc(X), base = same(X, BASE());
  return base ? ['지금 그대로 · 기본안', `${pl(X.price)} ${RG[X.region]} 정공법`, `월 ${X.save + X.cut}만 꾸준히 플랜`]
    : R.ok ? [`${RG[X.region].replace('지역', '')} ${pl(X.price)} 현실 플랜`, `${pl(X.price)} · ${e2(R.surplus)} 여유`, X.horizon !== T.date ? '전세 2년 더 살고 사기' : '현실적인 첫 집 플랜']
    : [X.save + X.cut > save ? `허리띠 조이기 · 월 ${X.save + X.cut}만` : `${pl(X.price)} ${RG[X.region]} 도전`, `${pl(X.price)} · ${e2(R.gap)} 부족`, X.horizon !== T.date ? '전세 2년 더 살고 사기' : `월 ${X.save + X.cut}만 꾸준히 플랜`];
}
let dlg = null;
function closeDlg() { if (dlg) { dlg.remove(); dlg = null; } }
function openDlg(html) { closeDlg(); closeTip(); dlg = document.createElement('div'); dlg.className = 'dlg-bg'; dlg.innerHTML = `<div class="dlg" role="dialog" aria-modal="true">${html}</div>`; dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('[data-x]')) closeDlg(); }); document.body.appendChild(dlg); return dlg; }
function openSave(renameIdx) {
  const ren = renameIdx !== undefined, X = ren ? scen[renameIdx].S : S, R = calc(X), N = names(X); let ai = 0;
  const d = openDlg(`<div class="dt">${ren ? '이름 수정' : '시나리오 저장'}</div><div class="rc-s" style="margin-top:2px">${ren ? '시나리오 이름만 바꿔요' : scen.length >= MAXSAVED ? `${MAXSAVED}자리가 꽉 찼어요 · 저장하면 가장 오래된 ‘${esc(scen[0].name)}’ 자리에 들어가요` : `저장하면 ‘시나리오 비교’에 나란히 놓여요 · 빈 자리 ${MAXSAVED - scen.length}개`}</div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:18px"><label for="scName" style="font-size:14px;font-weight:600">이름</label><span id="scTag" style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:600;color:var(--ink2);background:var(--line2);border-radius:6px;padding:2px 8px;white-space:nowrap"></span></div>
    <input id="scName" type="text" maxlength="24" value="${esc(ren ? scen[renameIdx].name : N[0])}">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:4px"><span class="sub12">레버 조건을 보고 지은 이름이에요 · 바꿔도 돼요</span><button type="button" id="scRe" style="flex:none;height:40px;padding:0 10px;margin-right:-10px;border:0;background:transparent;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;white-space:nowrap">${SV.reset}다시 추천</button></div>
    <div class="grid2"><span>조건</span><span>${condFull(X)}</span><span>살 수 있는 집값</span><b>${e2(R.buy)} · ${R.ok ? '달성' : `목표 ${pl(X.price)}의 ${Math.min(99, Math.floor(R.buy / X.price * 100))}%`}</b><span>목표일</span><b>${R.ok ? e2(R.surplus) + ' 남아요' : e2(R.gap) + ' 부족해요'}</b></div>
    <div class="row-b"><button type="button" data-x style="border:1px solid var(--zero);background:#fff">취소</button><button type="button" id="scOk" style="border:0;background:var(--ink);color:#fff">저장</button></div>`);
  const inp = d.querySelector('#scName'), tag = () => { const isAi = N.includes(inp.value); d.querySelector('#scTag').innerHTML = isAi ? SV.spark + '추천 이름' : '직접 수정'; };
  tag(); inp.addEventListener('input', tag); setTimeout(() => inp.focus(), 30);
  d.querySelector('#scRe').addEventListener('click', () => { ai = (ai + 1) % N.length; inp.value = N[ai]; tag(); });
  const ok = () => {
    const name = inp.value.trim() || N[0], mine = !N.includes(name);
    if (ren) { scen[renameIdx] = { ...scen[renameIdx], name, mine }; }
    else { const t = new Date(); if (scen.length >= MAXSAVED) scen.shift(); scen.push({ name, mine, S: { ...S }, date: `${String(t.getMonth() + 1).padStart(2, '0')}.${String(t.getDate()).padStart(2, '0')}` }); }
    persist(); justSaved = name; closeDlg(); render(); setTimeout(() => { justSaved = ''; renderScen(); }, 4000);
    if (!ren) $('#simScen').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  d.querySelector('#scOk').addEventListener('click', ok); inp.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
}
function copyText(t) {
  const fallback = () => { const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch {} ta.remove(); return ok; };
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(() => true, () => fallback());
  return Promise.resolve(fallback());
}
function openConfirm() {
  const R = calc(S), from = condText(BASE()), to = condText(S);
  const msg = `[내집마련 대시보드 목표 변경 요청]\n지금 목표: ${from}\n새 목표: ${to}\n조건: ${condFull(S)}\n살 수 있는 집값 ${e2(R.buy)} · ${R.ok ? '목표일에 ' + e2(R.surplus) + ' 남음' : e2(R.gap) + ' 부족'}\nPRD 결정 기록에 남기고 대시보드 목표를 바꿔줘.`;
  const d = openDlg(`<div class="dt">이 조건을 새 목표로 설정할까요?</div>
    <div class="grid2"><span>지금 목표</span><span style="color:var(--desc)">${from}</span><span>새 목표</span><b>${to}</b></div>
    <div style="font-size:14px;color:var(--ink2);margin-top:14px;line-height:1.6">이 대시보드는 링크 공유형이라 목표는 Claude가 바꿔요. <b>‘복사하기’</b>를 누르면 변경 내용이 복사돼요. 내집마련 대시보드 채팅에 붙여 넣으면 홈의 목표 · 격차 · 집값 그래프가 새 목표로 바뀌고, 이전 목표는 PRD 기록에 남아 <b>언제든 되돌릴 수 있어요.</b></div>
    <div class="row-b"><button type="button" data-x style="border:1px solid var(--zero);background:#fff">취소</button><button type="button" id="cfOk" style="border:0;background:var(--ink);color:#fff">복사하기</button></div>`);
  d.querySelector('#cfOk').addEventListener('click', () => copyText(msg).then(ok => { closeDlg(); toast(ok ? '복사했어요 · 채팅에 붙여 넣어 주세요' : '복사가 막혔어요 · 조건을 채팅에 적어 주세요'); }));
}

// ----- ⓘ 설명: 마우스는 올리면, 손가락은 누르면 고정 · 바깥을 누르면 닫힘 -----
const tipEl = document.createElement('div'); tipEl.className = 'simtip'; tipEl.setAttribute('role', 'tooltip'); tipEl.hidden = true; document.body.appendChild(tipEl);
let tipFor = null, pinned = false;
function showTip(btn, pin) {
  const [t, x] = TIPS[btn.dataset.tip] || ['', '']; if (!t) return;
  tipEl.innerHTML = `<b>${t}</b>${x}${pin ? '<small>고정됨 · 바깥을 누르면 닫혀요</small>' : ''}`; tipEl.hidden = false; tipFor = btn; pinned = pin;
  const r = btn.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  const left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 12));
  let top = r.bottom + 4; if (top + h > innerHeight - 12) top = Math.max(12, r.top - h - 4);
  tipEl.style.left = left + 'px'; tipEl.style.top = top + 'px';
}
function closeTip() { tipEl.hidden = true; tipFor = null; pinned = false; }
SIM.addEventListener('pointerover', e => { const b = e.target.closest('[data-tip]'); if (b && e.pointerType === 'mouse' && !pinned) showTip(b, false); });
SIM.addEventListener('pointerout', e => { const b = e.target.closest('[data-tip]'); if (b && e.pointerType === 'mouse' && !pinned && !b.contains(e.relatedTarget)) closeTip(); });
document.addEventListener('click', e => {
  const b = e.target.closest('#sim [data-tip]');
  if (b) { e.stopPropagation(); e.preventDefault(); if (pinned && tipFor === b) closeTip(); else showTip(b, true); return; }
  if (!tipEl.contains(e.target) && pinned) closeTip();
  if (e.target.closest('[data-settle]')) { $('#sheet').hidden = false; $('#sheetX').focus(); }
}, true);
addEventListener('scroll', () => { if (!tipEl.hidden) closeTip(); }, { passive: true });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeTip(); closeDlg(); } });

function renderPay(R) {
  const el = $('#simPay');
  if (!hasData) { el.hidden = true; return; } el.hidden = false;
  const amt = R.L.amount, cu = R.creditUsed > 0.5;
  const cols = [0, 1, 2].map(i => { const mr = R.nb ? (ASSUME.nbRate + (i === 2 ? .005 : 0)) : PAYRATE.mort[i], cr = PAYRATE.credit[i];
    const mp = PMT(mr / 12, ASSUME.years * 12, amt), mi = amt * mr / 12, cp = cu ? PMT(cr / 12, CREDIT.years * 12, R.creditUsed) : 0, ci = cu ? R.creditUsed * cr / 12 : 0;
    return { i, mr, cr, tot: mp + cp, int: mi + ci, mp, cp }; });
  el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:4px 12px;flex-wrap:wrap"><div class="sec-t">매달 갚을 돈 (예상)</div><div class="sub12">주담대 ${e2(amt)} · 30년 원리금균등${cu ? ` + 신용대출 ${e2(R.creditUsed)} · 10년 분할` : ''} · 첫 달 기준</div></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:14px">${cols.map(c => `
      <div style="border-radius:14px;padding:14px;${c.i === 1 ? 'box-shadow:inset 0 0 0 2px var(--ink);background:#fff' : 'background:var(--sub)'}">
        <div style="display:flex;justify-content:space-between;gap:6px;font-size:12px;color:var(--desc)"><b style="color:var(--ink)">${PAYRATE.label[c.i]}</b><span>${PAYRATE.why[c.i]}</span></div>
        <div style="font-size:26px;font-weight:800;letter-spacing:-0.03em;line-height:1.15;margin-top:8px;white-space:nowrap">월 ${man(c.tot)}원</div>
        <div class="sub12" style="margin-top:6px">그중 이자 <b style="color:var(--ink)">${man(c.int)}원</b>${takeHome ? ` · 실수령의 ${Math.round(c.tot / takeHome * 100)}%` : ''}</div>
        <div class="sub12" style="margin-top:2px">주담대 ${(c.mr * 100).toFixed(2).replace(/0$/, '')}%${cu ? ` · 신용 ${(c.cr * 100).toFixed(2).replace(/0$/, '')}% (월 ${man(c.cp)})` : ''}</div>
      </div>`).join('')}</div>
    <div class="sub12" style="margin-top:10px;line-height:1.5">실수령은 ${takeHome ? `부부 월급 합계 ${man(takeHome)}원(최근 결산 달, 인센티브·축의금 제외)` : '결산 후 표시'} 기준이에요. 대출 한도는 위 결과의 금리 가정(${(ASSUME.rate * 100).toFixed(1)}%)으로 계산한 값이라, 금리가 오르면 한도도 함께 줄어들어요.</div>`;
}
function render() { const R = calc(S); renderBanner(); renderCards(R); renderPay(R); renderCause(R); renderSide(R); renderScen(); renderAct(); }

// ----- 화면 전환: #sim = 시뮬레이터, 그 외 = 대시보드 -----
const TABS = [['홈', '#home', 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'], ['시뮬레이터', '#simulator', MENUS[1][1]], ['결산', '#settle', MENUS[2][1]], ['더보기', 'more', 'M5 12h.01M12 12h.01M19 12h.01']];
const STLV = $('#stl'), BASV = $('#bas'), HREF = ['#home', '#simulator', '#settle', '#basis'];
function route() {
  const sim = location.hash === '#simulator', stl = location.hash.startsWith('#settle'), bas = location.hash === '#basis', view = sim ? 1 : stl ? 2 : bas ? 3 : 0;
  SIM.hidden = !sim; STLV.hidden = !stl; BASV.hidden = !bas; MAIN.hidden = view !== 0; $('#more').hidden = true; closeTip(); closeDlg(); if (window.__settle) window.__settle.closeTip();
  $('#menu').innerHTML = MENUS.map(([l, d], i) => i < 4
    ? `<a class="mi${i === view ? ' on' : ''}" href="${HREF[i]}"${i === view ? ' aria-current="page"' : ''}>${icon(d)}${l}</a>`
    : `<button class="mi soon" type="button" data-soon="${l}" title="다음 단계에서 열려요">${icon(d)}${l}</button>`).join('');
  $('#tabbar').innerHTML = TABS.map(([l, h, d], i) => { const on = i === view, sv = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${on ? 1.9 : 1.7}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
    return h.startsWith('#') ? `<a href="${h}" class="${on ? 'on' : ''}"${on ? ' aria-current="page"' : ''}>${on ? `<span class="tbi">${sv}</span>` : sv}${l}</a>` : `<button type="button" data-more class="${on ? 'on' : ''}" aria-haspopup="dialog">${on ? `<span class="tbi">${sv}</span>` : sv}${l}</button>`; }).join('');
  document.title = sim ? '내집마련 대시보드 · 시뮬레이터' : stl ? '내집마련 대시보드 · 월 결산' : bas ? '내집마련 대시보드 · 계산 기준' : '내집마련 대시보드';
  if (sim) { syncLevers(); render(); }
  if (stl) window.__settle.render();
  if (bas) window.__basis.render();
  window.scrollTo(0, 0);
}
document.querySelectorAll('[data-soon="시뮬레이터"]').forEach(el => { el.removeAttribute('data-soon'); el.addEventListener('click', () => { location.hash = '#simulator'; }); });
addEventListener('hashchange', route);
window.__sim = { calc, get S() { return S; }, upd, BASE, CREDIT, PAYRATE };
route();
})();
