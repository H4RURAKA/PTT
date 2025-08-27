// 앱 부트스트랩 & 화면 이벤트/렌더 — 추천 알고리즘 호출만 담당
import { createInitialTeam, toggleSlotType, clearSlot } from './state.js';
import { computeAttack, computeDefense, coverTypesFor } from './compute.js';
import {
  buildTeamBoard, reflectChips, renderSlotMini,
  renderAttackSummary, renderAttackTable, renderAttackRows, applyAttackHighlight, renderHoleSuggestions,
  renderDefenseSummary, renderDefenseTable, renderRemaining
} from './render.js';
import { wireHeaderButtons, adjustHeaderSpacer as _adjustHeaderSpacer } from './ui.js';

export function bootstrapApp(ctx){
  const {
    TYPES, TYPE_KEYS, TYPE_LABEL, TYPE_COLOR, ATK,
    effect, combinedDefenseMultiplier, effClass, qsEncode, qsDecode
  } = ctx;
  const { reco } = ctx; // { loadPokedex, recommendGreedy, recommendWeighted?, explainCandidate, ... }

  // ===== 상태 & 엘리먼트 =====
  const team = createInitialTeam();
  const TEAM_SIZE = team.length;

  const teamBoard       = document.getElementById('teamBoard');

  const typeCounterEl   = document.getElementById('typeCounter');
  const remainingEl     = document.getElementById('remainingTypes');

  const atkStrongListEl  = document.getElementById('atkStrongList');
  const atkStrongCountEl = document.getElementById('atkStrongCount');
  const atkHolesCountEl  = document.getElementById('atkHolesCount');
  const atkTypesCountEl  = document.getElementById('atkTypesCount');
  const holeSuggestEl    = document.getElementById('holeSuggest');
  const attackTableEl    = document.getElementById('attackTable');

  const defFourEl       = document.getElementById('defFourCount');
  const defTwoEl        = document.getElementById('defTwoCount');
  const defImmEl        = document.getElementById('defImmuneCount');
  const defListEl       = document.getElementById('defWeakList');
  const defenseTableEl  = document.getElementById('defenseTable');

  // 추천 영역
  const recoCountSel     = document.getElementById('recoCount');
  const recoMinDupChk    = document.getElementById('recoMinDup');
  const recoSpeedChk     = document.getElementById('recoSpeed');
  const recoBtn          = document.getElementById('recoBtn');
  const recoRandomBtn    = document.getElementById('recoRandomBtn'); // 가중 랜덤
  const recoListEl       = document.getElementById('recoList');
  const recoReasonsEl    = document.getElementById('recoReasons');
  const recoHoleTypesEl  = document.getElementById('recoHoleTypes'); // 미커버
  const recoWeakTypesEl  = document.getElementById('recoWeakTypes'); // 방어 취약
  const datalist         = document.getElementById('pokedexList');

  // 🔹 TDZ 방지: 이벤트 핸들러보다 먼저 선언
  let POKEDEX = [];

  // 🔹 URL에서 받은 포켓몬 이름을 덱스 로딩 이후 적용하기 위한 대기열
  const pendingPkm = new Array(TEAM_SIZE).fill('');

  buildTeamBoard(teamBoard, team, TYPES, TYPE_COLOR, TYPE_LABEL);

  // === 유틸 ===
  const normalize = s => (s || '').replace(/\s+/g, '').toLowerCase();
  const hasAnyType = t => t.some(s => s.t1 || s.t2);

  // 슬롯 UI를 일관되게 갱신
  function rebuildSlotUI(i){
    reflectChips(teamBoard, team, i);
    renderSlotMini(teamBoard, team, i, ATK, TYPES, TYPE_COLOR, TYPE_LABEL, combinedDefenseMultiplier);
  }

  function resetSlotUI(i){
    clearSlot(team, i);
    reflectChips(teamBoard, team, i);

    const row = teamBoard.querySelector(`[data-i='${i}']`);
    if (row){
      const nameInput   = row.querySelector('input.name');
      const searchInput = row.querySelector('input.search');
      if (nameInput)   nameInput.value   = '';
      if (searchInput) searchInput.value = '';
    }

    setSprite(i, null);
    renderSlotMini(teamBoard, team, i, ATK, TYPES, TYPE_COLOR, TYPE_LABEL, combinedDefenseMultiplier);
  }

  // === 스프라이트 썸네일 표시 ===
  function setSprite(i, url){
    const row = document.querySelector(`.slot[data-i='${i}']`);
    const img = row?.querySelector(`img[data-sprite='${i}']`);
    if (!row || !img) return;

    if (url){
      img.src = url;
      img.style.display = 'block';
      row.classList.add('has-sprite');
      row.classList.remove('no-sprite');
    } else {
      img.removeAttribute('src');
      img.style.display = 'none';
      row.classList.add('no-sprite');
      row.classList.remove('has-sprite');
    }
  }

  // === 라이트박스(확대 보기) ===
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = `
    <button class="lb-close" aria-label="닫기">×</button>
    <img class="lb-img" alt="sprite enlarge"/>
  `;
  document.body.appendChild(lb);

  const lbImg   = lb.querySelector('.lb-img');
  const lbClose = lb.querySelector('.lb-close');

  function openLightbox(src, alt){
    if (!src) return;
    lbImg.src = src;
    lbImg.alt = alt || 'sprite';
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeLightbox(){
    lb.classList.remove('open');
    lbImg.removeAttribute('src');
    document.body.style.overflow = '';
  }

  lb.addEventListener('click', (e)=>{
    if (e.target === lb || e.target === lbClose) closeLightbox();
  });
  document.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape') closeLightbox();
  });

  // ===== 팀 슬롯 상호작용 =====
  teamBoard.addEventListener('click', (e)=>{
    // 0) 스프라이트 클릭 → 확대
    const spr = e.target.closest('img.sprite');
    if (spr?.src){ openLightbox(spr.src, spr.alt || 'sprite'); return; }

    // 1) 타입 칩 토글
    const chip = e.target.closest('.chip');
    if (chip){
      const i = +chip.dataset.i;
      const key = chip.dataset.key;
      const { changed, reason } = toggleSlotType(team, i, key, 12);
      if (!changed && reason){ alert(reason); return; }
      rebuildSlotUI(i);
      updateAll();
      return;
    }

    // 2) 슬롯 초기화
    const clearBtn = e.target.closest('button[data-clear]');
    if (clearBtn){
      const i = +clearBtn.dataset.clear;
      resetSlotUI(i);
      updateAll();
      return;
    }
  });

  teamBoard.addEventListener('input', (e)=>{
    const name = e.target.closest('input.name');
    if (name){
      const i = +name.dataset.i;
      team[i].name = name.value.trim();
    }
  });

  // 포켓몬 검색 → 타입/스프라이트 적용
  teamBoard.addEventListener('change', (e)=>{
    const search = e.target.closest('input.search');
    if (!search) return;

    const i = +search.dataset.i;
    const q = (search.value || '').trim();
    if (!q || !POKEDEX.length) return;

    const hit = POKEDEX.find(p => normalize(p.n) === normalize(q))
             || POKEDEX.find(p => normalize(p.n).includes(normalize(q)));
    if (!hit){ alert('포켓몬을 찾지 못했습니다. (한글 이름)'); return; }

    team[i].t1 = hit.t[0] || '';
    team[i].t2 = hit.t[1] || '';
    team[i].pkm = { n: hit.n, b: hit.b, tags: hit.tags || [], s: hit.s || null };
    setSprite(i, hit.s || null);

    rebuildSlotUI(i);
    updateAll();
  });

  // ===== URL 상태 =====
  function encodeState(){
    return qsEncode({
      team,
      theme: document.documentElement.getAttribute('data-theme') || 'light',
      cvd:   document.documentElement.getAttribute('data-cvd')   || '0'
    });
  }

  // 문자열/배열 모두를 안전하게 배열로 변환
  function toArr(v){
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') return v.split(',');
    return [];
  }

  // URL → 상태 복원(축약키 s/n/p 지원)
  function decodeState(){
    const raw = qsDecode() || {};

    const theme = raw.theme || '';
    const cvd   = raw.cvd   || '';

    // 축약키(s/n/p)와 구키(slots/names/pokemon) 모두 허용
    const slots   = toArr(raw.slots   ?? raw.s ?? []);
    const names   = toArr(raw.names   ?? raw.n ?? []);
    const pokemon = toArr(raw.pokemon ?? raw.p ?? []);

    if (theme) document.documentElement.setAttribute('data-theme', theme);
    if (cvd)   document.documentElement.setAttribute('data-cvd',   cvd);

    // 타입/별명 즉시 반영
    for (let i = 0; i < TEAM_SIZE; i++){
      const s = slots[i] || '';
      if (s){
        const [a,b] = s.split('+');
        team[i].t1 = a || '';
        team[i].t2 = b || '';
      }
      team[i].name = names[i] || '';
    }

    // 포켓몬 이름은 덱스 로딩 후 적용할 대기열에 저장
    for (let i = 0; i < TEAM_SIZE; i++){
      pendingPkm[i] = pokemon[i] || '';
    }

    // 1차 렌더(타입/이름만)
    for (let i = 0; i < TEAM_SIZE; i++){
      reflectChips(teamBoard, team, i);
      const row = teamBoard.querySelector(`[data-i='${i}']`);
      if (row) row.querySelector('input.name').value = team[i].name || '';
      renderSlotMini(teamBoard, team, i, ATK, TYPES, TYPE_COLOR, TYPE_LABEL, combinedDefenseMultiplier);
      setSprite(i, null); // 스프라이트는 덱스 로드 후 적용
    }
  }

  // 덱스 로드 이후, pendingPkm에 있는 이름을 실제 팀에 반영
  function applyPendingPokemonByName(){
    if (!POKEDEX.length) return;

    let touched = false;
    for (let i = 0; i < TEAM_SIZE; i++){
      const want = (pendingPkm[i] || '').trim();
      if (!want) continue;

      const hit = POKEDEX.find(p => normalize(p.n) === normalize(want));
      if (!hit) continue;

      team[i].t1 = hit.t[0] || '';
      team[i].t2 = hit.t[1] || '';
      team[i].pkm = { n: hit.n, b: hit.b, tags: hit.tags || [], s: hit.s || null };
      setSprite(i, hit.s || null);

      // 검색창에도 이름 넣기
      const row = teamBoard.querySelector(`[data-i='${i}']`);
      row?.querySelector('input.search')?.setAttribute('value', hit.n);
      row?.querySelector('input.search')?.dispatchEvent(new Event('input', { bubbles:true }));

      rebuildSlotUI(i);
      pendingPkm[i] = '';
      touched = true;
    }
    if (touched) updateAll();
  }

  // ===== 추천 공통 컨텍스트 =====
  function buildEnv(){
    return { TYPES, TYPE_LABEL, TYPE_COLOR, ATK, effect, combinedDefenseMultiplier };
  }

  function curRecoOptions(){
    const desiredRoles = new Set(
      Array.from(document.querySelectorAll('.roleChk:checked')).map(el => el.value)
    );
    return {
      minDup: !!recoMinDupChk?.checked,
      speedBias: !!recoSpeedChk?.checked,
      desiredRoles,
      weights: { offense: 3, defense: 3, roles: 2, speed: 1.5, bst: 0.5 }
    };
  }

  function computeRecoContext(opts){
    const atk = computeAttack(ATK, TYPES, team, effect);
    const def = computeDefense(ATK, TYPES, team, combinedDefenseMultiplier);
    return {
      offenseHoles: TYPES
        .filter(([k]) => (atk.bestByDef[k] || 1) <= 1)
        .map(([k]) => k),
      weakRank: Object
        .entries(def.agg)
        .map(([k, v]) => ({ k, s: v.m4 * 100 + v.m2 }))
        .sort((a, b) => b.s - a.s)
        .filter(x => x.s > 0)
        .map(x => x.k),
      desiredRoles: opts.desiredRoles,
      weights: opts.weights,
      teamTypes: new Set(team.flatMap(s => [s.t1, s.t2].filter(Boolean))),
      minDup: opts.minDup,
      speedBias: opts.speedBias
    };
  }

  // ===== 전체 갱신 =====
  function updateAll(){
    renderRemaining(typeCounterEl, remainingEl, team, TYPES, TYPE_LABEL, TYPE_COLOR);

    // 공격 표/지표
    const atk = computeAttack(ATK, TYPES, team, effect);
    renderAttackSummary(
      atk, TYPE_LABEL, TYPE_COLOR,
      atkStrongListEl, atkStrongCountEl, atkHolesCountEl, atkTypesCountEl
    );
    renderAttackTable(attackTableEl, TYPES, TYPE_KEYS, TYPE_LABEL, ATK, effect, effClass, atk.bestByDef);
    renderAttackRows(attackTableEl, atk.atkTypes, TYPES, TYPE_LABEL, ATK, effect, effClass);
    applyAttackHighlight(attackTableEl, TYPES, atk.bestByDef);

    // 미커버 보완 제안
    const coverFn = (def) => coverTypesFor(ATK, TYPES, effect, def);
    renderHoleSuggestions(holeSuggestEl, TYPES, TYPE_LABEL, TYPE_COLOR, coverFn, atk.bestByDef);

    // 방어 요약/표
    const def = computeDefense(ATK, TYPES, team, combinedDefenseMultiplier);
    renderDefenseSummary(def.fourX, def.twoX, def.immune, TYPE_LABEL, TYPE_COLOR, defFourEl, defTwoEl, defImmEl, defListEl);
    renderDefenseTable(defenseTableEl, TYPE_LABEL, def.agg);

    // 추천 필터(미커버/방어 취약) 갱신
    renderRecoReasons();
  }

  // ===== 추천 사유/필터 렌더 =====
  function renderRecoReasons(atkOpt, defOpt){
    const atk = atkOpt || computeAttack(ATK, TYPES, team, effect);
    const holes = TYPES
      .filter(([k]) => (atk.bestByDef[k] || 1) <= 1)
      .map(([k]) => k);

    const def = defOpt || computeDefense(ATK, TYPES, team, combinedDefenseMultiplier);
    const weakSet = new Set([
      ...Object.entries(def.agg).filter(([, v]) => v.m4 > 0).map(([k]) => k),
      ...Object.entries(def.agg).filter(([, v]) => v.m2 > 0).map(([k]) => k)
    ]);
    const weaks = Array.from(weakSet);

    fillChips(recoHoleTypesEl, holes);
    fillChips(recoWeakTypesEl, weaks);
    if (recoReasonsEl) recoReasonsEl.innerHTML = '';
  }

  function fillChips(container, keys){
    if (!container) return;
    container.innerHTML = '';
    if (!keys?.length){
      container.innerHTML = '<span class="muted">없음</span>';
      return;
    }
    keys
      .slice()
      .sort((a, b) => TYPE_LABEL[a].localeCompare(TYPE_LABEL[b], 'ko'))
      .forEach(k => {
        const el = document.createElement('span');
        el.className = 'pill';
        el.innerHTML = `<span class="dot" style="background:${TYPE_COLOR[k]}"></span>${TYPE_LABEL[k]}`;
        container.appendChild(el);
      });
  }

  // ===== 추천 리스트 =====
  let currentRecoOptionsComputed = null;
  let currentRecoPicks = [];

  function renderRecoList(picks){
    recoListEl.innerHTML = '';

    if (!picks?.length){
      const p = document.createElement('div');
      p.className = 'muted';
      p.textContent = '추천 결과가 없습니다.';
      recoListEl.appendChild(p);
      currentRecoPicks = [];
      return;
    }

    const frag = document.createDocumentFragment();

    for (const { p, score } of picks){
      const card = document.createElement('div');
      card.className = 'pkm-card';

      const bst = (p.b || []).reduce((a, b) => a + b, 0);
      card.innerHTML = `
        <div class="pkm-title">
          <h3>${p.n}</h3>
          <span class="statline">BST ${bst}</span>
        </div>
        <div class="pkm-types">
          ${p.t.map(t => `
            <span class="pill"><span class="dot" style="background:${TYPE_COLOR[t]}"></span>${TYPE_LABEL[t]}</span>
          `).join('')}
        </div>
        <div class="pkm-badges" data-badges></div>
        <div class="pkm-actions"><button class="btn" data-add="${p.i ?? p.n}">팀에 추가</button></div>
        <div class="muted" style="font-size:12px">점수 ${Number(score).toFixed(2)}</div>
      `;

      const badges = ctx.reco.explainCandidate(
        { ATK, effect, TYPE_LABEL },
        p,
        currentRecoOptionsComputed || {}
      );
      const wrap = card.querySelector('[data-badges]');
      badges.forEach(b => {
        const el = document.createElement('span');
        el.className = 'pill';
        el.textContent = b;
        wrap.appendChild(el);
      });

      card.dataset.pid = p.i ?? p.n;
      frag.appendChild(card);
    }

    recoListEl.appendChild(frag);
    currentRecoPicks = picks;
  }

  // 추천 카드의 "팀에 추가"는 위임 방식으로 한 번만 바인딩
  recoListEl?.addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-add]');
    if (!btn) return;

    const pid = btn.getAttribute('data-add');
    const choice = currentRecoPicks.find(x => String(x.p.i ?? x.p.n) === String(pid));
    if (!choice) return;

    // 빈 슬롯 하나에만 반영 (중복 방지)
    const slot = team.findIndex(s => !s.t1 && !s.t2);
    if (slot < 0) return;

    const p = choice.p;
    team[slot].t1 = p.t[0] || '';
    team[slot].t2 = p.t[1] || '';
    team[slot].pkm = { n: p.n, b: p.b, tags: p.tags || [], s: p.s || null };
    setSprite(slot, p.s || null);

    // 검색창에도 이름 채워넣기
    const row = teamBoard.querySelector(`[data-i='${slot}']`);
    const searchInput = row?.querySelector('input.search');
    if (searchInput) searchInput.value = p.n;

    // 버튼 상태 변경(피드백 + 재클릭 억제)
    btn.disabled = true;
    btn.textContent = '추가됨';

    rebuildSlotUI(slot);
    updateAll();
  });

  function clamp(n,min,max){
    n = parseInt(n,10);
    if (Number.isNaN(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  async function runRecommend(K){
    if (!POKEDEX.length){
      alert('포켓몬 데이터가 아직 로드되지 않았습니다. /data/pokemon.min.json을 준비해 주세요.');
      return;
    }
    K = clamp(K ?? recoCountSel?.value ?? 1, 1, 10);
    if (!hasAnyType(team)){
      alert('팀이 비어 있습니다. 먼저 최소 1마리의 타입을 선택하거나 포켓몬을 검색해 주세요.');
      return;
    }

    renderRecoReasons();

    const env  = buildEnv();
    const opts = curRecoOptions();
    currentRecoOptionsComputed = computeRecoContext(opts);

    const picks = ctx.reco.recommendGreedy(env, POKEDEX, team, K, currentRecoOptionsComputed);
    renderRecoList(picks);
    adjustRecoScroller();
    window.addEventListener('resize', adjustRecoScroller, { passive:true });
    window.addEventListener('scroll',  adjustRecoScroller, { passive:true });
  }

  async function runRecommendRandom(K){
    if (!POKEDEX.length){
      alert('포켓몬 데이터가 아직 로드되지 않았습니다.');
      return;
    }
    K = clamp(K ?? recoCountSel?.value ?? 1, 1, 10);
    if (!hasAnyType(team)){
      alert('팀이 비어 있습니다. 먼저 최소 1마리의 타입을 선택하거나 포켓몬을 검색해 주세요.');
      return;
    }

    renderRecoReasons();

    const env  = buildEnv();
    const opts = curRecoOptions();
    currentRecoOptionsComputed = computeRecoContext(opts);

    let picks;
    if (typeof ctx.reco.recommendWeighted === 'function'){
      picks = ctx.reco.recommendWeighted(env, POKEDEX, team, K, currentRecoOptionsComputed);
    } else {
      const many = ctx.reco.recommendGreedy(
        env, POKEDEX, team, Math.max(8, K * 4), currentRecoOptionsComputed
      );
      for (let i = many.length - 1; i > 0; i--){
        const j = Math.floor(Math.random() * (i + 1));
        [many[i], many[j]] = [many[j], many[i]];
      }
      picks = many.slice(0, K);
    }
    renderRecoList(picks);
    adjustRecoScroller();
    window.addEventListener('resize', adjustRecoScroller, { passive:true });
    window.addEventListener('scroll',  adjustRecoScroller, { passive:true });
  }

  // 버튼 바인딩
  recoBtn?.addEventListener('click', ()=>{
    runRecommend(clamp(recoCountSel?.value ?? 1, 1, 10));
  });
  recoRandomBtn?.addEventListener('click', ()=>{
    runRecommendRandom(clamp(recoCountSel?.value ?? 1, 1, 10));
  });

  // 초기 렌더 & URL 반영
  updateAll();
  decodeState();
  updateAll();

  // 헤더 버튼
  wireHeaderButtons({
    onReset: ()=>{
      for (let i = 0; i < TEAM_SIZE; i++) resetSlotUI(i);
      updateAll();
      history.replaceState({}, '', location.pathname);
    },
    onShare: async ()=>{
      const qs  = encodeState();
      const url = location.origin + location.pathname + '?' + qs;
      try {
        await navigator.clipboard.writeText(url);
        alert('현재 구성이 URL로 복사되었습니다.');
      } catch {
        prompt('복사할 URL:', url);
      }
    },
    onPrint: ()=> window.print(),
    onTheme: ()=>{
      const cur = document.documentElement.getAttribute('data-theme') || 'light';
      document.documentElement.setAttribute('data-theme', cur === 'light' ? 'dark' : 'light');
    },
    onCvd: ()=>{
      const cur = document.documentElement.getAttribute('data-cvd') || '0';
      document.documentElement.setAttribute('data-cvd', cur === '0' ? '1' : '0');
    },
    onScores: ()=>{
    // 1) 현재 팀에서 이름 채워진 포켓몬만 수집
    const names = [];
    for (let i = 0; i < TEAM_SIZE; i++) {
      const row   = teamBoard.querySelector(`[data-i='${i}']`);
      const typed = row?.querySelector('input.search')?.value?.trim(); // 입력창 내용
      const chosen= team[i]?.pkm?.n?.trim();                            // 실제 선택(스프라이트 있는 경우)
      const name  = chosen || typed;                                    // 선택 우선, 없으면 입력값
      if (name) names.push(name);
    }

    // 2) 목적지 URL 구성 (/scores/ 경로로 p=이름1,이름2,... 전달)
    const base = new URL('scores/', location.href); // /pokemon/ 아래라면 /pokemon/scores/ 로 맞춰짐
    if (names.length) {
      const p = names.map(encodeURIComponent).join(',');
      base.searchParams.set('p', p);
    }
    // 3) 이동
    location.href = base.toString();
  },
  });

  // ===== 포켓덱스 로딩 =====
  (async ()=>{
    try {
      POKEDEX = await reco.loadPokedex();
      if (datalist){
        datalist.innerHTML = POKEDEX.map(p => `<option value="${p.n}"></option>`).join('');
      }
      // URL로부터 받은 포켓몬 이름 적용
      applyPendingPokemonByName();
    } catch {
      console.warn('Pokedex load failed');
    }
  })();
}

export const adjustHeaderSpacer = _adjustHeaderSpacer;

// 좌측 '공격 커버리지' 카드의 바닥(bottom)까지를 기준으로 추천 카드 높이 보정
function adjustRecoScroller(){
  const card = document.getElementById('recoCard');
  if (!card) return;

  const body  = card.querySelector('.body');
  const headH = card.querySelector('.head')?.offsetHeight ?? 56;

  const docTop    = (el) => el.getBoundingClientRect().top    + window.scrollY;
  const docBottom = (el) => el.getBoundingClientRect().bottom + window.scrollY;

  let anchorEl =
    document.getElementById('defenseTable')?.closest('.card') ||
    document.getElementById('defenseTable') ||
    document.querySelector('.main');

  let anchorBottomDoc = anchorEl ? docBottom(anchorEl) : document.body.scrollHeight;

  const cardTopDoc = docTop(card);

  const pad = 16;
  let avail = Math.floor(anchorBottomDoc - cardTopDoc - pad);
  avail = Math.max(200, avail);

  const isOneCol = window.matchMedia('(max-width: 1180px)').matches;
  if (isOneCol) {
    const vpAvail = Math.floor(window.innerHeight - card.getBoundingClientRect().top - pad);
    avail = Math.max(200, Math.min(avail, vpAvail));
  }

  card.style.setProperty('--reco-max', `${avail}px`);
  if (body) body.style.setProperty('--reco-body-max', `${Math.max(120, avail - headH - 8)}px`);
}

/* ====================================================== */
/* ======================= 모바일 ========================= */
/* ====================================================== */

/* ========= 공용 모달 유틸 ========= */
function openModal({ html, className = '' }){
  const modal = document.getElementById('modal');
  const panel = document.getElementById('modalPanel');
  if (!modal || !panel) return;
  panel.className = `modal-panel ${className}`.trim();
  panel.innerHTML = html || '';
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeModal(){
  const modal = document.getElementById('modal');
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = '';
}
(() => {
  const modal = document.getElementById('modal');
  modal?.addEventListener('click', (e)=>{
    if (e.target.matches('.modal-backdrop,[data-close]')) closeModal();
  });
  window.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') closeModal(); });
})();

/* ========= 햄버거 메뉴 → 모달로 표시 ========= */
(function wireMobileMenu(){
  const openBtn = document.getElementById('menuBtn');
  if (!openBtn) return;

  openBtn.addEventListener('click', ()=> {
    openModal({
      className: 'menu',
      html: `
        <div class="menu-list">
          <button class="btn block" data-act="cvd">색각친화</button>
          <button class="btn block" data-act="theme">라이트/다크</button>
          <button class="btn block" data-act="reset">초기화</button>
          <button class="btn block" data-act="scores">점수 보기</button>
          <button class="btn block" data-act="share">URL 복사</button>
          <button class="btn block" data-act="print">인쇄</button>
        </div>`
    });
  });

  document.getElementById('modalPanel')?.addEventListener('click', (e)=>{
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const map = {
      cvd: 'cvdBtn',
      theme: 'themeBtn',
      reset: 'resetBtn',
      scores: 'scoresBtn',
      share: 'shareBtn',
      print: 'printBtn'
    };
    const id = map[b.dataset.act];
    const target = document.getElementById(id);
    if (target) target.click();
    closeModal();
  });
})();
