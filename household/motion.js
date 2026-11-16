// 움직임 (현황판 24-2a). 규칙은 DESIGN.md '부드러움'. 시간·감속은 CSS 변수(--dur-*, --ease-out)에서만 읽는다.
// '동작 줄이기'를 켜면 CSS가 --dur-*를 0ms로 바꾸고, 여기서는 0이면 움직이지 않는다.
// 숫자·실명 없음(공개 코드).
(function () {
  'use strict';
  const root = document.documentElement;
  const dur = (name) => parseFloat(getComputedStyle(root).getPropertyValue('--dur-' + name)) || 0;   // ms
  const locked = () => document.body.classList.contains('hh-locked');
  const reflow = (el) => el.offsetWidth;

  // ---------- 1. 미끄러짐: 고른 표시가 이전 자리에서 새 자리로 ----------
  // 묶음(.seg 알약 토글 · #menu 위쪽 메뉴 줄 · #tabbar 휴대폰 하단 탭) 안에 표시(.glide) 하나를 두고 옮긴다.
  const GLIDE = [
    { box: '.seg', on: 'button[aria-pressed="true"],button[aria-selected="true"]' },
    { box: '#menu', on: '.mi.on' },
    { box: '#tabbar', on: '.on .tbi' },
  ];
  const BOX_SEL = GLIDE.map((g) => g.box).join(',');
  const last = new WeakMap();   // 묶음 → 마지막 표시 자리 {x,y,w,h}
  const moved = new WeakMap();  // 묶음 → 마지막으로 미끄러지기 시작한 때
  const ruleOf = (box) => GLIDE.find((g) => box.matches(g.box));

  function place(box, animate) {
    const g = ruleOf(box); if (!g) return;
    const on = box.querySelector(g.on);
    let ind = box.querySelector(':scope > .glide');
    if (!on || !box.offsetParent && getComputedStyle(box).position !== 'fixed') {   // 고른 것이 없거나 안 보이는 묶음
      if (ind) ind.style.opacity = '0';
      return;
    }
    const bx = box.getBoundingClientRect(), r = on.getBoundingClientRect();
    if (!r.width) return;
    const to = { x: r.left - bx.left - box.clientLeft + box.scrollLeft, y: r.top - bx.top - box.clientTop + box.scrollTop, w: r.width, h: r.height };
    const from = last.get(box);
    const fresh = !ind;
    if (fresh) {
      ind = document.createElement('span'); ind.className = 'glide'; ind.setAttribute('aria-hidden', 'true');
      box.prepend(ind);
    }
    if (!box.classList.contains('has-glide')) box.classList.add('has-glide');   // 같은 값을 다시 넣어도 변경 기록이 생겨서
    const set = (p) => { ind.style.transform = `translate(${p.x}px,${p.y}px)`; ind.style.width = p.w + 'px'; ind.style.height = p.h + 'px'; };
    const same = from && Math.abs(from.x - to.x) < .5 && Math.abs(from.y - to.y) < .5 && Math.abs(from.w - to.w) < .5;
    if (animate && from && (!same || fresh) && dur('slide') > 0) {
      ind.classList.add('still'); set(from); ind.style.opacity = '1'; reflow(ind);
      ind.classList.remove('still'); set(to); moved.set(box, performance.now());
    } else if (fresh || !animate || !same) {
      ind.classList.add('still'); set(to); ind.style.opacity = '1'; reflow(ind); ind.classList.remove('still');
    }
    last.set(box, to);
  }

  // 크기가 바뀌면(창 크기, 숨김 → 보임) 움직이지 않고 제자리로
  const ro = 'ResizeObserver' in window ? new ResizeObserver((es) => es.forEach((e) => place(e.target, performance.now() - (moved.get(e.target) || 0) < dur('slide')))) : null;
  const seen = new WeakSet();
  function watchBoxes(scope) {
    const boxes = scope.matches && scope.matches(BOX_SEL) ? [scope] : [];
    if (scope.querySelectorAll) boxes.push(...scope.querySelectorAll(BOX_SEL));
    for (const b of boxes) {
      if (!seen.has(b)) { seen.add(b); if (ro) ro.observe(b); place(b, false); }
    }
  }

  // ---------- 2. 펼치기: 카드 높이가 부드럽게 늘고 준다 ----------
  // 카드 높이를 기억해 두었다가(ResizeObserver), 안의 내용이 바뀌면 기억한 높이 → 새 높이로 옮긴다.
  // 옆 칸은 그대로: 카드를 담은 격자는 align-items:start(DESIGN.md).
  const GROW_SEL = 'main section.card';
  const hgt = new WeakMap();
  const growing = new WeakSet();
  const hro = 'ResizeObserver' in window ? new ResizeObserver((es) => es.forEach((e) => { if (!growing.has(e.target)) hgt.set(e.target, e.target.offsetHeight); })) : null;
  function grow(el, fromH) {
    const ms = dur('grow');
    if (!el || !ms || fromH == null) return;
    const cur = growing.has(el) ? el.getBoundingClientRect().height : fromH;
    el.style.height = 'auto';
    const toH = el.offsetHeight;
    if (Math.abs(toH - cur) < 2) { el.style.height = ''; return; }
    growing.add(el);
    el.classList.add('growing');
    el.style.height = cur + 'px'; reflow(el);
    el.style.height = toH + 'px';
    clearTimeout(el._growT);
    el._growT = setTimeout(() => { el.style.height = ''; el.classList.remove('growing'); growing.delete(el); hgt.set(el, el.offsetHeight); }, ms + 40);
  }
  function watchCards(scope) {
    if (!hro || !scope.querySelectorAll) return;
    for (const c of scope.querySelectorAll(GROW_SEL)) if (!hgt.has(c)) { hgt.set(c, c.offsetHeight); hro.observe(c); }
  }

  // ---------- 3. 숫자 굴러가기: 큰 숫자(num-l)가 자릿수별로 굴러가며 바뀐다 ----------
  // 처음 보일 때 한 번(0에서) + 값이 바뀔 때(이전 값에서). 같은 자리의 숫자는 화면을 다시 그려도 같은 값이면 굴리지 않는다.
  const ROLL_SEL = 'main .kv, main .eq .v, main .gs .amt';
  const rolled = new Map();   // 자리 키 → 마지막으로 보여 준 글자
  const keyOf = (el, i) => el.className + '|' + i;   // 자리 = 종류 + 순서(카드 상태 클래스는 넣지 않음: 펼치는 중에도 같은 자리)
  const isDigit = (c) => c >= '0' && c <= '9';
  function rollText(node, from, to) {
    const wrap = document.createElement('span');
    wrap.className = 'roll'; wrap.setAttribute('aria-label', to);
    const fromD = from.replace(/[^0-9]/g, ''), toDigits = [...to].filter(isDigit).length;
    let di = 0;
    const cols = [];
    for (const c of to) {
      if (!isDigit(c)) { const s = document.createElement('span'); s.textContent = c; s.setAttribute('aria-hidden', 'true'); wrap.appendChild(s); continue; }
      // 오른쪽 끝을 맞춰 이전 값의 같은 자리 숫자에서 출발(자릿수가 늘면 0에서)
      const k = fromD.length - (toDigits - di);
      const start = k >= 0 ? +fromD[k] : 0;
      const col = document.createElement('span'); col.className = 'roll-d'; col.setAttribute('aria-hidden', 'true');
      const strip = document.createElement('span'); strip.className = 'roll-s';
      strip.textContent = '0123456789'.split('').join('\n');
      strip.style.transform = `translateY(${-start}lh)`;
      col.appendChild(strip); wrap.appendChild(col); cols.push([strip, +c]); di++;
    }
    node.replaceWith(wrap);
    reflow(wrap);
    for (const [s, d] of cols) s.style.transform = `translateY(${-d}lh)`;
    setTimeout(() => { if (wrap.isConnected) wrap.replaceWith(document.createTextNode(to)); }, dur('count') + 60);
  }
  function scanRoll() {
    if (locked() || !dur('count')) return;
    const els = document.querySelectorAll(ROLL_SEL);
    els.forEach((el, i) => {
      if (!el.offsetParent || el.querySelector('.roll')) return;
      const tn = [...el.childNodes].find((n) => n.nodeType === 3 && /\d/.test(n.nodeValue));
      if (!tn) return;
      const k = keyOf(el, i), now = tn.nodeValue, was = rolled.get(k);
      if (was === now) return;
      rolled.set(k, now);
      rollText(tn, was == null ? now.replace(/\d/g, '0') : was, now);
    });
  }
  let rollQ = 0;
  const queueRoll = () => { cancelAnimationFrame(rollQ); rollQ = requestAnimationFrame(scanRoll); };

  // ---------- 지켜보기 ----------
  const mo = new MutationObserver((list) => {
    const boxes = new Set(), cards = new Set();
    let content = false;
    for (const m of list) {
      const t = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      if (!t || t.closest('.roll, .glide')) continue;
      // 이 파일이 넣고 뺀 표시·굴림 칸은 무시(다시 잡으면 움직이던 표시가 끊김)
      const mine = (n) => n.nodeType === 1 && n.matches('.roll, .glide') || n.nodeType === 3 && n.parentElement?.closest('.kv, .eq, .gs');
      if (m.type === 'childList' && [...m.addedNodes, ...m.removedNodes].every(mine)) { if (m.addedNodes[0]?.nodeType === 3) content = true; continue; }
      if (m.type === 'childList') {
        for (const n of m.addedNodes) if (n.nodeType === 1 && !n.matches('.roll, .glide')) { watchBoxes(n); watchCards(n); }
        content = true;
      }
      if (m.type === 'characterData') content = true;
      const box = t.closest(BOX_SEL); if (box) boxes.add(box);
      if (m.type === 'attributes' && m.attributeName === 'hidden') content = true;
      const card = t.closest(GROW_SEL);
      if (card && (m.type !== 'attributes' || m.attributeName === 'hidden')) cards.add(card);
    }
    boxes.forEach((b) => { watchBoxes(b); place(b, true); });
    if (!locked()) cards.forEach((c) => { if (hgt.has(c)) grow(c, hgt.get(c)); });
    if (content) queueRoll();
  });

  function start() {
    mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['aria-pressed', 'aria-selected', 'class', 'hidden'] });
    watchBoxes(document.body); watchCards(document.body);
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

  // 청약처럼 목록을 통째로 다시 그리는 화면은 직접 부른다: 높이 = 다시 그리기 전 높이 → 새 높이
  window.__motion = { grow, place, dur };
})();
