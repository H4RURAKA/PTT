// scores 페이지 — 메인 추천(reco.js)과 동일한 점수식 사용
// 각 카드 점수 = (자신을 제외한 나머지 5마리 팀 컨텍스트)에 대해 scoreCandidate 실행

import { TYPES, TYPE_LABEL, TYPE_COLOR, ATK } from '../../src/types.js';
import { effect, combinedDefenseMultiplier } from '../../src/effects.js';
import {
  loadPokedex,           // /data/pokemon.min.json 로더
  buildRecoContext,      // 팀 컨텍스트(미커버/취약 계산)
  scoreCandidate         // 점수식 (공격 커버/방어 취약/역할/스피드/BST/중복)
} from '../../src/reco.js';

const EL = {
  cards: document.getElementById('cards'),
  pokedexList: document.getElementById('pokedexList'),
  total: document.getElementById('totalScore'),
  toHome: document.getElementById('toHome')
};

const normalize = s => (s || '').replace(/\s+/g, '').toLowerCase();
let POKEDEX = [];

// ---- 쿼리에서 넘어온 포켓몬 이름들 파싱 (p=이름 또는 p=이름1,이름2...) ----
function tryDecode(s){
  try { return decodeURIComponent(s); } catch { return s; }
}
function parseIncomingNames(){
  const sp = new URLSearchParams(location.search);
  const raw = sp.getAll('p');        // p가 여러 번 올 수도 있음
  const out = [];

  if (raw.length) {
    raw.forEach(v => v.split(',').forEach(x => out.push(x)));
  } else {
    const one = sp.get('p');
    if (one) one.split(',').forEach(x => out.push(x));
  }
  // 안전 디코딩 + 트리밍 + 빈 문자열 제거
  return out.map(s => tryDecode((s || '').trim())).filter(Boolean);
}
const PENDING_NAMES = parseIncomingNames();


/* ----------------------- 공용 UI ----------------------- */
function dot(color){ return `<span class="dot" style="background:${color}"></span>`; }

function renderStats(target, b){
  if (!target) return;
  if (!Array.isArray(b) || b.length < 6){
    target.innerHTML = '';
    target.classList.remove('stats');
    return;
  }
  const [HP, Atk, Def, SpA, SpD, Spe] = b;
  const rows = [
    ['HP',  HP,  'hp'],
    ['ATK', Atk, 'atk'],
    ['DEF', Def, 'def'],
    ['S.Atk', SpA, 'spa'],
    ['S.Def', SpD, 'spd'],
    ['SPD', Spe, 'spe'],
  ];
  target.classList.add('stats');
  target.innerHTML = rows.map(([k, v, cls]) => `
    <div class="s ${cls}">
      <span class="k">${k}</span><span class="v">${v}</span>
    </div>
  `).join('');
}

function renderEmptyCards(){
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 6; i++){
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.i = String(i);
    card.innerHTML = `
      <div class="slot-head">
        <label class="score" for="q${i}">포켓몬 ${i + 1}</label>
        <button class="btn sm ghost" data-clear="${i}">초기화</button>
      </div>

      <input id="q${i}" class="input search" list="pokedexList" placeholder="포켓몬 검색" />

      <div class="sprite"><img alt="" /></div>

      <div class="type-wrap">
        <div class="label">포켓몬</div>
        <div class="name" data-name>—</div>

        <div class="label">타입</div>
        <div class="type-list two-rows" data-types></div>

        <div class="statline" data-bst></div>
      </div>

      <div class="score"><span>점수</span> <b data-score>0.00</b></div>
    `;
    frag.appendChild(card);
  }
  EL.cards.replaceChildren(frag);
}

function fillCardFromPkm(card, p){
  card.dataset.pid = String(p.i ?? p.n);

  // 이름
  card.querySelector('[data-name]').textContent = p.n;

  // 타입(두 줄 고정)
  const tWrap = card.querySelector('[data-types]');
  tWrap.innerHTML = '';
  (p.t || []).slice(0,2).forEach(k=>{
    const s = document.createElement('span');
    s.className = 'pill';
    s.innerHTML = `${dot(TYPE_COLOR[k])}${TYPE_LABEL[k]}`;
    tWrap.appendChild(s);
  });

  // 스프라이트
  const img = card.querySelector('.sprite img');
  if (p.s){
    img.src = p.s;
    img.style.display = 'block';
  } else {
    img.removeAttribute('src');
    img.style.display = 'none';
  }

  // BST(종족값) 칩 그리드
  renderStats(card.querySelector('[data-bst]'), p.b);
}

function clearCard(card){
  delete card.dataset.pid;
  const input = card.querySelector('.search');
  if (input) input.value = '';
  card.querySelector('[data-name]').textContent = '—';
  card.querySelector('[data-types]').innerHTML = '';
  const img = card.querySelector('.sprite img');
  img.removeAttribute('src'); img.style.display = 'none';
  const bstBox = card.querySelector('[data-bst]');
  bstBox.innerHTML = '';
  bstBox.classList.remove('stats');
  card.querySelector('[data-score]').textContent = '0.00';
}

/* ----------------------- 점수 계산 ----------------------- */

function currentTeam(){
  const arr = [];
  for (const card of EL.cards.querySelectorAll('.card')){
    const pid = card.dataset.pid;
    const p = pid ? POKEDEX.find(x => String(x.i ?? x.n) === String(pid)) : null;
    arr.push({
      p,
      t1: p?.t?.[0] || '',
      t2: p?.t?.[1] || ''
    });
  }
  return arr;
}

function defaultRecoOptions(teamTypes){
  return {
    offenseHoles: [],
    weakRank:     [],
    desiredRoles: new Set(),
    teamTypes,
    minDup: true,
    speedBias: true,
    weights: { offense:3, defense:3, roles:2, speed:1.5, bst:0.5 }
  };
}

function recomputeScores(){
  const picks = currentTeam();
  let total = 0;

  picks.forEach((slot, idx)=>{
    const card = EL.cards.querySelector(`.card[data-i='${idx}']`);
    if (!card) return;

    if (!slot.p){
      card.querySelector('[data-score]').textContent = '0.00';
      return;
    }

    const others = picks.map((s,j)=> j===idx ? {t1:'',t2:''} : { t1:s.t1, t2:s.t2 });
    const env = { ATK, TYPES, effect, combinedDefenseMultiplier };
    const ctx = buildRecoContext(env, others);

    const teamTypes = new Set(others.flatMap(o => [o.t1, o.t2].filter(Boolean)));
    const opt = defaultRecoOptions(teamTypes);
    opt.offenseHoles = ctx.offenseHoles;
    opt.weakRank     = ctx.weakRank;

    const s = scoreCandidate({ ATK, effect, TYPE_LABEL }, slot.p, opt);
    card.querySelector('[data-score]').textContent = s.toFixed(2);
    total += s;
  });

  EL.total.textContent = total.toFixed(2);
}

/* ----------------------- 부트 ----------------------- */
async function boot(){
  renderEmptyCards();

  // 포켓덱스 로드
  POKEDEX = await loadPokedex();
  if (EL.pokedexList){
    EL.pokedexList.innerHTML = POKEDEX.map(p => `<option value="${p.n}"></option>`).join('');
  }

  // 쿼리로 넘어온 포켓몬 이름들이 있으면 첫 카드부터 채움
  if (PENDING_NAMES.length){
    const cards = Array.from(EL.cards.querySelectorAll('.card'));
    for (let i = 0; i < Math.min(cards.length, PENDING_NAMES.length); i++){
      const name = PENDING_NAMES[i];
      const hit =
        POKEDEX.find(p => normalize(p.n) === normalize(name)) ||
        POKEDEX.find(p => normalize(p.n).includes(normalize(name)));
      if (hit){
        fillCardFromPkm(cards[i], hit);
        // 검색창에도 표시(사용자 편의)
        const input = cards[i].querySelector('.search');
        if (input) input.value = hit.n;
      } else {
        const input = cards[i].querySelector('.search');
        if (input) input.value = name; // 일단 넣어두고 사용자가 수정 가능
      }
    }
  }

  // 입력 바인딩 (검색)
  EL.cards.addEventListener('change', (e)=>{
    const input = e.target.closest('.search');
    if (!input) return;

    const card = e.target.closest('.card');
    const q = (input.value || '').trim();
    const hit = POKEDEX.find(p => normalize(p.n) === normalize(q))
             || POKEDEX.find(p => normalize(p.n).includes(normalize(q)));

    if (hit) fillCardFromPkm(card, hit);
    else     clearCard(card);

    recomputeScores();
  });

  // 초기화 버튼
  EL.cards.addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-clear]');
    if (!btn) return;
    const card = btn.closest('.card');
    clearCard(card);
    recomputeScores();
  });

  // 홈으로
  EL.toHome?.addEventListener('click', ()=> {
    location.href = location.pathname.replace(/\/scores\/?$/, '/') || '/';
  });

  recomputeScores();
}

boot();
