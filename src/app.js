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
  const { TYPES, TYPE_KEYS, TYPE_LABEL, TYPE_COLOR, ATK, effect, combinedDefenseMultiplier, effClass, qsEncode, qsDecode } = ctx;
  const { reco } = ctx; // { loadPokedex, recommendGreedy, recommendWeighted?, explainCandidate, ... }

  // ===== 상태 & 엘리먼트 =====
  const team = createInitialTeam();
  const teamBoard = document.getElementById('teamBoard');

  const typeCounterEl = document.getElementById('typeCounter');
  const remainingEl   = document.getElementById('remainingTypes');

  const atkStrongListEl  = document.getElementById('atkStrongList');
  const atkStrongCountEl = document.getElementById('atkStrongCount');
  const atkHolesCountEl  = document.getElementById('atkHolesCount');
  const atkTypesCountEl  = document.getElementById('atkTypesCount');
  const holeSuggestEl    = document.getElementById('holeSuggest');
  const attackTableEl    = document.getElementById('attackTable');

  const defFourEl = document.getElementById('defFourCount');
  const defTwoEl  = document.getElementById('defTwoCount');
  const defImmEl  = document.getElementById('defImmuneCount');
  const defListEl = document.getElementById('defWeakList');
  const defenseTableEl = document.getElementById('defenseTable');

  // 추천 영역
  const recoCountSel   = document.getElementById('recoCount');
  const recoMinDupChk  = document.getElementById('recoMinDup');
  const recoSpeedChk   = document.getElementById('recoSpeed');
  const recoBtn        = document.getElementById('recoBtn');
  const recoRandomBtn  = document.getElementById('recoRandomBtn'); // 가중 랜덤
  const recoListEl     = document.getElementById('recoList');
  const recoReasonsEl  = document.getElementById('recoReasons');
  const recoHoleTypesEl = document.getElementById('recoHoleTypes'); // 미커버
  const recoWeakTypesEl = document.getElementById('recoWeakTypes'); // 방어 취약
  const datalist       = document.getElementById('pokedexList');

  buildTeamBoard(teamBoard, team, TYPES, TYPE_COLOR, TYPE_LABEL);

  // === 스프라이트 썸네일 표시 유틸 ===
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

  // === 라이트박스(확대 보기) 구성 ===
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = `
    <button class="lb-close" aria-label="닫기">×</button>
    <img class="lb-img" alt="sprite enlarge"/>
  `;
  document.body.appendChild(lb);
  const lbImg = lb.querySelector('.lb-img');
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
  lb.addEventListener('click', (e)=>{ if (e.target === lb || e.target === lbClose) closeLightbox(); });
  document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') closeLightbox(); });

  // ===== 팀 슬롯 상호작용 =====
  teamBoard.addEventListener('click', (e)=>{
    // 0) 스프라이트 클릭 → 확대
    const spr = e.target.closest('img.sprite');
    if (spr && spr.src){ openLightbox(spr.src, spr.alt || 'sprite'); return; }

    // 1) 타입 칩 토글
    const chip = e.target.closest('.chip');
    if (chip){
      const i=+chip.dataset.i, key=chip.dataset.key;
      const {changed,reason} = toggleSlotType(team,i,key,12);
      if (!changed && reason){ alert(reason); return; }
      reflectChips(teamBoard, team, i);
      renderSlotMini(teamBoard, team, i, ATK, TYPES, TYPE_COLOR, TYPE_LABEL, combinedDefenseMultiplier);
      updateAll(); return;
    }
    // 2) 초기화
    const clearBtn = e.target.closest('button[data-clear]');
    if (clearBtn){
      const i=+clearBtn.dataset.clear;
      clearSlot(team,i);
      reflectChips(teamBoard, team, i);
      const row = teamBoard.querySelector(`[data-i='${i}']`);
      if (row){
        row.querySelector('input.name').value='';
        row.querySelector('input.search').value='';
      }
      setSprite(i, null); // 스프라이트 숨김
      renderSlotMini(teamBoard, team, i, ATK, TYPES, TYPE_COLOR, TYPE_LABEL, combinedDefenseMultiplier);
      updateAll();
    }
  });

  teamBoard.addEventListener('input', (e)=>{
    const name = e.target.closest('input.name');
    if (name){ const i=+name.dataset.i; team[i].name = name.value.trim(); }
  });

  // 포켓몬 검색 → 타입/스프라이트 적용
  teamBoard.addEventListener('change', (e)=>{
    const search = e.target.closest('input.search'); if (!search) return;
    const i = +search.dataset.i;
    const q = (search.value || '').trim();
    if (!q || !POKEDEX.length) return;

    const norm = s => s.replace(/\s+/g,'').toLowerCase();
    const hit = POKEDEX.find(p => norm(p.n) === norm(q)) || POKEDEX.find(p => norm(p.n).includes(norm(q)));
    if (!hit) { alert('포켓몬을 찾지 못했습니다. (한글 이름)'); return; }

    team[i].t1 = hit.t[0] || '';
    team[i].t2 = hit.t[1] || '';
    team[i].pkm = { n: hit.n, b: hit.b, tags: hit.tags || [], s: hit.s || null };
    setSprite(i, hit.s || null); // 썸네일 표시

    reflectChips(teamBoard, team, i);
    renderSlotMini(teamBoard, team, i, ATK, TYPES, TYPE_COLOR, TYPE_LABEL, combinedDefenseMultiplier);
    updateAll();
  });

  // ===== URL 상태 =====
  function encodeState(){
    return qsEncode({
      team,
      theme: document.documentElement.getAttribute('data-theme') || 'light',
      cvd:   document.documentElement.getAttribute('data-cvd') || '0'
    });
  }
  function decodeState(){
    const { theme, cvd, slots, names } = qsDecode();
    if (theme) document.documentElement.setAttribute('data-theme', theme);
    if (cvd)   document.documentElement.setAttribute('data-cvd', cvd);
    slots.slice(0,6).forEach((s,i)=>{ const [a,b]=s.split('+'); team[i].t1=a||''; team[i].t2=b||''; });
    names.slice(0,6).forEach((n,i)=>{ team[i].name = n || ''; });
    for (let i=0;i<6;i++){
      reflectChips(teamBoard, team, i);
      const row=teamBoard.querySelector(`[data-i='${i}']`);
      if (row) row.querySelector('input.name').value = team[i].name;
      renderSlotMini(teamBoard, team, i, ATK, TYPES, TYPE_COLOR, TYPE_LABEL, combinedDefenseMultiplier);
      // URL 복원 단계에서는 스프라이트 URL을 복원하지 않음(검색 시 표시)
      setSprite(i, null);
    }
  }

  // ===== 전체 갱신 =====
  function updateAll(){
    renderRemaining(typeCounterEl, remainingEl, team, TYPES, TYPE_LABEL, TYPE_COLOR);

    const atk = computeAttack(ATK, TYPES, team, effect);
    renderAttackSummary(atk, TYPE_LABEL, TYPE_COLOR, atkStrongListEl, atkStrongCountEl, atkHolesCountEl, atkTypesCountEl);
    renderAttackTable(attackTableEl, TYPES, TYPE_KEYS, TYPE_LABEL, ATK, effect, effClass, atk.bestByDef);
    renderAttackRows(attackTableEl, atk.atkTypes, TYPES, TYPE_LABEL, ATK, effect, effClass);
    applyAttackHighlight(attackTableEl, TYPES, atk.bestByDef);
    const coverFn = (def)=>coverTypesFor(ATK, TYPES, effect, def);
    renderHoleSuggestions(holeSuggestEl, TYPES, TYPE_LABEL, TYPE_COLOR, coverFn, atk.bestByDef);

    const def = computeDefense(ATK, TYPES, team, combinedDefenseMultiplier);
    renderDefenseSummary(def.fourX, def.twoX, def.immune, TYPE_LABEL, TYPE_COLOR, defFourEl, defTwoEl, defImmEl, defListEl);
    renderDefenseTable(defenseTableEl, TYPE_LABEL, def.agg);

    // 추천 필터(미커버/방어 취약) 갱신
    renderRecoReasons();

    const empty = team.filter(s=>!s.t1 && !s.t2).length;
    if (recoCountSel && empty>0) recoCountSel.value = String(empty);
  }

  // 초기 렌더 & URL 반영
  updateAll(); decodeState(); updateAll();

  // 헤더 버튼
  wireHeaderButtons({
    onReset: ()=>{ for (let i=0;i<6;i++){
        clearSlot(team,i); reflectChips(teamBoard, team, i);
        const row=teamBoard.querySelector(`[data-i='${i}']`);
        if (row){ row.querySelector('input.name').value=''; row.querySelector('input.search').value=''; }
        setSprite(i, null);
        renderSlotMini(teamBoard, team, i, ATK, TYPES, TYPE_COLOR, TYPE_LABEL, combinedDefenseMultiplier);
      } updateAll(); history.replaceState({},'',location.pathname); },
    onShare: async()=>{ const qs=encodeState(); const url=location.origin+location.pathname+'?'+qs;
      try{ await navigator.clipboard.writeText(url); alert('현재 구성이 URL로 복사되었습니다.'); }
      catch{ prompt('복사할 URL:', url); } },
    onPrint: ()=>window.print(),
    onTheme: ()=>{ const cur=document.documentElement.getAttribute('data-theme')||'light';
      document.documentElement.setAttribute('data-theme', cur==='light'?'dark':'light'); },
    onCvd:   ()=>{ const cur=document.documentElement.getAttribute('data-cvd')||'0';
      document.documentElement.setAttribute('data-cvd', cur==='0'?'1':'0'); }
  });

  // ===== 포켓덱스 로딩 =====
  let POKEDEX = [];
  (async ()=>{
    try{
      POKEDEX = await reco.loadPokedex();
      if (datalist){
        datalist.innerHTML = POKEDEX.map(p=>`<option value="${p.n}"></option>`).join('');
      }
    }catch{ console.warn('Pokedex load failed'); }
  })();

  // ===== 추천 호출 헬퍼 =====
  function buildEnv(){
    return { TYPES, TYPE_LABEL, TYPE_COLOR, ATK, effect, combinedDefenseMultiplier };
  }
  function curRecoOptions(){
    const desiredRoles = new Set(Array.from(document.querySelectorAll('.roleChk:checked')).map(el=>el.value));
    return {
      minDup: !!recoMinDupChk?.checked,
      speedBias: !!recoSpeedChk?.checked,
      desiredRoles,
      weights:{ offense:3, defense:3, roles:2, speed:1.5, bst:0.5 }
    };
  }

  function renderRecoReasons(){
    // 미커버(2x 불가)
    const atk = computeAttack(ATK, TYPES, team, effect);
    const holes = TYPES.filter(([k]) => (atk.bestByDef[k] || 1) <= 1).map(([k]) => k);

    // 방어 취약(4x/2x 존재)
    const def = computeDefense(ATK, TYPES, team, combinedDefenseMultiplier);
    const weakSet = new Set([
      ...Object.entries(def.agg).filter(([,v])=>v.m4>0).map(([k])=>k),
      ...Object.entries(def.agg).filter(([,v])=>v.m2>0).map(([k])=>k)
    ]);
    const weaks = Array.from(weakSet);

    fill(recoHoleTypesEl, holes);
    fill(recoWeakTypesEl, weaks);

    function fill(container, keys){
      if (!container) return;
      container.innerHTML = '';
      if (!keys.length){ container.innerHTML = '<span class="muted">없음</span>'; return; }
      keys.sort((a,b)=>TYPE_LABEL[a].localeCompare(TYPE_LABEL[b],'ko')).forEach(k=>{
        const el = document.createElement('span'); el.className='pill';
        el.innerHTML = `<span class="dot" style="background:${TYPE_COLOR[k]}"></span>${TYPE_LABEL[k]}`;
        container.appendChild(el);
      });
    }
    if (recoReasonsEl) recoReasonsEl.innerHTML = '';
  }

  let currentRecoOptionsComputed = null;

  function renderRecoList(picks){
    recoListEl.innerHTML = '';
    if (!picks?.length){
      const p=document.createElement('div'); p.className='muted'; p.textContent='추천 결과가 없습니다.';
      recoListEl.appendChild(p); return;
    }
    const frag=document.createDocumentFragment();
    for (const {p,score} of picks){
      const card=document.createElement('div'); card.className='pkm-card';
      const bst=(p.b||[]).reduce((a,b)=>a+b,0);
      card.innerHTML=`
        <div class="pkm-title"><h3>${p.n}</h3><span class="statline">BST ${bst}</span></div>
        <div class="pkm-types">${p.t.map(t=>`<span class="pill"><span class="dot" style="background:${TYPE_COLOR[t]}"></span>${TYPE_LABEL[t]}</span>`).join('')}</div>
        <div class="pkm-badges" data-badges></div>
        <div class="pkm-actions"><button class="btn" data-add="${p.i ?? p.n}">팀에 추가</button></div>
        <div class="muted" style="font-size:12px">점수 ${Number(score).toFixed(2)}</div>`;
      const badges = ctx.reco.explainCandidate({ ATK, effect, TYPE_LABEL }, p, currentRecoOptionsComputed || {});
      const wrap=card.querySelector('[data-badges]');
      badges.forEach(b=>{ const el=document.createElement('span'); el.className='pill'; el.textContent=b; wrap.appendChild(el); });
      card.dataset.pid = p.i ?? p.n; frag.appendChild(card);
    }
    recoListEl.appendChild(frag);

    // "팀에 추가" (한 번만 바인딩)
    recoListEl.addEventListener('click', (e)=>{
      const btn = e.target.closest('button[data-add]'); if (!btn) return;
      const pid = btn.getAttribute('data-add');
      const choice = picks.find(x => String(x.p.i ?? x.p.n) === String(pid));
      if (!choice) return;

      const slot = team.findIndex(s=>!s.t1 && !s.t2);
      if (slot < 0){ alert('빈 슬롯이 없습니다.'); return; }
      const p = choice.p;
      team[slot].t1 = p.t[0] || ''; team[slot].t2 = p.t[1] || '';
      team[slot].pkm = { n:p.n, b:p.b, tags:p.tags||[], s:p.s||null };
      setSprite(slot, p.s || null);
      reflectChips(teamBoard, team, slot);
      renderSlotMini(teamBoard, team, slot, ATK, TYPES, TYPE_COLOR, TYPE_LABEL, combinedDefenseMultiplier);
      updateAll();
    }, { once:true });
  }

  async function runRecommend(K){
    if (!POKEDEX.length){ alert('포켓몬 데이터가 아직 로드되지 않았습니다. /data/pokemon.min.json을 준비해 주세요.'); return; }
    if (!K || K<1) K = 1;

    renderRecoReasons();

    const env = buildEnv();
    const opts = curRecoOptions();

    currentRecoOptionsComputed = {
      offenseHoles:(()=>{ const a=computeAttack(ATK, TYPES, team, effect);
        return TYPES.filter(([k]) => (a.bestByDef[k] || 1) <= 1).map(([k]) => k); })(),
      weakRank:(()=>{ const d=computeDefense(ATK, TYPES, team, combinedDefenseMultiplier);
        return Object.entries(d.agg).map(([k,v])=>({k,s:v.m4*100+v.m2}))
          .sort((a,b)=>b.s-a.s).filter(x=>x.s>0).map(x=>x.k); })(),
      desiredRoles:opts.desiredRoles, weights:opts.weights,
      teamTypes:new Set(team.flatMap(s=>[s.t1,s.t2].filter(Boolean))),
      minDup:opts.minDup, speedBias:opts.speedBias
    };

    const picks = ctx.reco.recommendGreedy(env, POKEDEX, team, K, currentRecoOptionsComputed);
    renderRecoList(picks);
  }

  async function runRecommendRandom(K){
    if (!POKEDEX.length){ alert('포켓몬 데이터가 아직 로드되지 않았습니다.'); return; }
    if (!K || K < 1) K = 1;

    renderRecoReasons();

    const env = buildEnv();
    const opts = curRecoOptions();

    currentRecoOptionsComputed = {
      offenseHoles:(()=>{ const a=computeAttack(ATK, TYPES, team, effect);
        return TYPES.filter(([k]) => (a.bestByDef[k] || 1) <= 1).map(([k]) => k); })(),
      weakRank:(()=>{ const d=computeDefense(ATK, TYPES, team, combinedDefenseMultiplier);
        return Object.entries(d.agg).map(([k,v])=>({k,s:v.m4*100+v.m2}))
          .sort((a,b)=>b.s-a.s).filter(x=>x.s>0).map(x=>x.k); })(),
      desiredRoles:opts.desiredRoles, weights:opts.weights,
      teamTypes:new Set(team.flatMap(s=>[s.t1,s.t2].filter(Boolean))),
      minDup:opts.minDup, speedBias:opts.speedBias
    };

    let picks;
    if (typeof ctx.reco.recommendWeighted === 'function'){
      picks = ctx.reco.recommendWeighted(env, POKEDEX, team, K, currentRecoOptionsComputed);
    } else {
      const many = ctx.reco.recommendGreedy(env, POKEDEX, team, Math.max(8, K*4), currentRecoOptionsComputed);
      for (let i=many.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [many[i],many[j]]=[many[j],many[i]]; }
      picks = many.slice(0, K);
    }
    renderRecoList(picks);
  }

  // 버튼 바인딩
  recoBtn?.addEventListener('click', ()=>{
    const K = parseInt(recoCountSel?.value||'0',10) || undefined;
    runRecommend(K);
  });
  recoRandomBtn?.addEventListener('click', ()=>{
    const K = parseInt(recoCountSel?.value||'0',10) || 1;
    runRecommendRandom(K);
  });
}

export const adjustHeaderSpacer = _adjustHeaderSpacer;
