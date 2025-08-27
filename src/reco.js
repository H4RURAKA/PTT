// 추천 데이터 로더 + 점수/설명 + 추천 (그리디 / 가중랜덤)
import { computeAttack, computeDefense } from './compute.js';

/* -------------------------------------------------------
 * 데이터 로드
 *  - /data/pokemon.min.json → 실패 시 /data/pokemon.sample.json
 *  - 캐시 무시(no-store)로 최신 반영
 * -----------------------------------------------------*/
async function tryFetchJSON(url){
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) return null;
  try { return await r.json(); } catch { return null; }
}

// 모듈 파일(src/reco.js) 기준으로 data 경로를 계산
function dataURL(file){
  // reco.js 가 /.../src/reco.js 에 있을 때 → ../data/<file>
  return new URL(`../data/${file}`, import.meta.url).href;
}

export async function loadPokedex() {
  // 1순위: pokemon.min.json
  const primary  = await tryFetchJSON(dataURL('pokemon.min.json'));
  if (Array.isArray(primary)) return primary;

  // 2순위: pokemon.sample.json (샘플)
  const fallback = await tryFetchJSON(dataURL('pokemon.sample.json'));
  if (Array.isArray(fallback)) return fallback;

  return [];
}

/* -------------------------------------------------------
 * 자동 태그(종족값 기반)
 *  - 데이터 누락을 고려하여 기본값 부여
 * -----------------------------------------------------*/
export function autoTags(p) {
  // BUGFIX: 길이 체크 10 → 6
  const stats = Array.isArray(p.b) && p.b.length >= 6 ? p.b : [0,0,0,0,0,0];
  const [HP, Atk, Def, SpA, SpD, Spe] = stats;

  const tags = new Set(p.tags || []);
  if (Atk >= SpA + 15 && (Spe >= 95 || Atk >= 110)) tags.add('physical');
  if (SpA >= Atk + 15 && (Spe >= 95 || SpA >= 110)) tags.add('special');
  if ((HP + Def + SpD) >= 380 && Spe <= 80)          tags.add('wall');
  if (Spe >= 110)                                     tags.add('speed');
  if (!tags.size)                                     tags.add('balanced');

  return Array.from(tags);
}

/* -------------------------------------------------------
 * 추천 컨텍스트
 *  - 공격 미커버 타입(offenseHoles), 방어 취약 정렬(weakRank)
 * -----------------------------------------------------*/
export function buildRecoContext({ ATK, TYPES, effect, combinedDefenseMultiplier }, team) {
  const atk = computeAttack(ATK, TYPES, team, effect);
  const def = computeDefense(ATK, TYPES, team, combinedDefenseMultiplier);

  const offenseHoles = TYPES
    .filter(([k]) => (atk.bestByDef[k] || 1) <= 1)
    .map(([k]) => k);

  const weakRank = Object.entries(def.agg)
    .map(([k, v]) => ({ k, s: v.m4 * 100 + v.m2 }))
    .sort((a, b) => b.s - a.s)
    .filter(x => x.s > 0)
    .map(x => x.k);

  return { atk, def, offenseHoles, weakRank };
}

/* -------------------------------------------------------
 * 후보 점수화
 *  - offense(미커버 보강), defense(상위 5 취약 완화), 역할, 스피드, BST, 중복 페널티
 * -----------------------------------------------------*/
export function scoreCandidate(ctx, p, options) {
  const { ATK, effect } = ctx;
  const { offenseHoles, weakRank, desiredRoles, weights, teamTypes, minDup, speedBias } = options;

  let s = 0;
  const types = Array.isArray(p.t) ? p.t : [];
  const tags  = new Set(autoTags(p));

  // 1) 공격 커버 보강
  const covers2x = (hole) => types.some(atk => effect(ATK, atk, hole) === 2);
  for (const hole of offenseHoles) if (covers2x(hole)) s += weights.offense;

  // 2) 방어 취약 완화(상위 5개까지만)
  for (const wk of weakRank.slice(0, 5)) {
    if (!types.length) break;
    const m1 = effect(ATK, wk, types[0]) ?? 1;
    const m2 = types[1] ? (effect(ATK, wk, types[1]) ?? 1) : 1;
    const m  = m1 * m2;
    if (m === 0)      s += weights.defense * 1.2; // 면역이면 가산
    else if (m <= .5) s += weights.defense;       // 저항이면 가산
  }

  // 3) 역할 밸런스(물리/특수 중심)
  if (desiredRoles?.size) {
    if (desiredRoles.has('physical') && tags.has('physical')) s += weights.roles;
    if (desiredRoles.has('special')  && tags.has('special'))  s += weights.roles;
    if (desiredRoles.has('wall')     && tags.has('wall'))     s += weights.roles * 0.9;
    if (desiredRoles.has('hazard')   && tags.has('hazard'))   s += weights.roles * 1.1;
  }

  // 4) 스피드 우선
  const Spe = (Array.isArray(p.b) && p.b[5]) ? p.b[5] : 0;
  if (speedBias) {
    if (Spe >= 110) s += weights.speed;
    else if (Spe >= 100) s += weights.speed * 0.6;
  }

  // 5) BST 보정(약하게)
  const bst = (Array.isArray(p.b) ? p.b : []).reduce((a, b) => a + b, 0);
  s += Math.min(0.6, (bst - 450) / 1000) * weights.bst;

  // 6) 타입 중복 페널티
  if (minDup && teamTypes?.size) {
    const dup = types.filter(t => teamTypes.has(t)).length;
    if (dup >= 2)       s -= 0.8;
    else if (dup === 1) s -= 0.35;
  }

  return s;
}

/* -------------------------------------------------------
 * 후보 배지(설명) 생성
 *  - 미커버 보강, 최상위 취약 타입에 대한 면역/저항, 역할/스피드
 * -----------------------------------------------------*/
export function explainCandidate(ctx, p, options) {
  const { ATK, effect, TYPE_LABEL } = ctx;
  const types = Array.isArray(p.t) ? p.t : [];
  const badges = [];

  // 미커버 보강
  (options?.offenseHoles || []).forEach(h => {
    if (types.some(atk => effect(ATK, atk, h) === 2)) {
      badges.push(`미커버(${TYPE_LABEL[h]}) 커버`);
    }
  });

  // 최상위 취약 타입 1개만 간단 표시
  const wk = options?.weakRank?.[0];
  if (wk && types.length) {
    const m1 = effect(ATK, wk, types[0]) ?? 1;
    const m2 = types[1] ? (effect(ATK, wk, types[1]) ?? 1) : 1;
    const m  = m1 * m2;
    if (m === 0)      badges.push(`면역(${TYPE_LABEL[wk]})`);
    else if (m <= .5) badges.push(`저항(${TYPE_LABEL[wk]})`);
  }

  // 역할/스피드
  const tagset = new Set(autoTags(p));
  if (tagset.has('physical')) badges.push('물리 에이스');
  if (tagset.has('special'))  badges.push('특수 에이스');
  if (tagset.has('wall'))     badges.push('막이');
  if (tagset.has('hazard'))   badges.push('깔개');
  if ((Array.isArray(p.b) && p.b[5] >= 110)) badges.push('스피드 110+');

  // 중복 제거 후 10개까지만
  return Array.from(new Set(badges)).slice(0, 10);
}

/* -------------------------------------------------------
 * 내부: 가중치 샘플링(중복 없음, 점수 최소값 방어)
 * -----------------------------------------------------*/
function _weightedSample(arr, k){
  const pool = arr.map(x => ({ ...x }));
  const out = [];

  for (let r = 0; r < k && pool.length; r++){
    const total = pool.reduce((s, x) => s + Math.max(x.score, 0.0001), 0);
    let t = Math.random() * total;
    let idx = 0;

    for (; idx < pool.length; idx++){
      t -= Math.max(pool[idx].score, 0.0001);
      if (t <= 0) break;
    }
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
}

/* -------------------------------------------------------
 * 가중 랜덤 추천
 *  - 전 후보 점수화 후 확률적으로 추출
 * -----------------------------------------------------*/
export function recommendWeighted(env, pokedex, team, K, opt){
  const { TYPES, ATK, effect, combinedDefenseMultiplier, TYPE_LABEL } = env;
  const weights = { offense:3, defense:3, roles:2, speed:1.5, bst:0.5, ...(opt?.weights || {}) };

  const ctxBase = buildRecoContext({ ATK, TYPES, effect, combinedDefenseMultiplier }, team);

  const teamTypes = new Set(team.flatMap(s => [s.t1, s.t2].filter(Boolean)));
  const desiredRoles = new Set(opt?.desiredRoles || []);
  const options = {
    offenseHoles: ctxBase.offenseHoles,
    weakRank:     ctxBase.weakRank,
    desiredRoles, weights, teamTypes,
    minDup: !!opt?.minDup,
    speedBias: !!opt?.speedBias
  };

  const scored = pokedex
    .filter(p => Array.isArray(p.t) && p.t.length) // 타입 없는 항목 제외
    .map(p => ({
      p,
      score: scoreCandidate({ ATK, effect, TYPE_LABEL }, p, options)
    }));

  return _weightedSample(scored, Math.max(1, K | 0));
}

/* -------------------------------------------------------
 * 그리디 추천(상위 K) — FIXED
 *  - 빈 슬롯이 없어도 "가상 선택"으로 계속 뽑아 K개를 채운다.
 *  - 가상 상태에서 미커버 구멍을 줄이고, 타입 중복 페널티 계산에 누적 타입 포함.
 * -----------------------------------------------------*/
export function recommendGreedy(env, pokedex, team, K, opt) {
  const { TYPES, TYPE_LABEL, ATK, effect, combinedDefenseMultiplier } = env;
  const weights = { offense:3, defense:3, roles:2, speed:1.5, bst:0.5, ...(opt?.weights || {}) };

  // 초기 컨텍스트/가상 상태
  let ctxBase = buildRecoContext({ ATK, TYPES, effect, combinedDefenseMultiplier }, team);
  let curTeam = team.map(s => ({ ...s }));

  let virtOffenseHoles = ctxBase.offenseHoles.slice(); // 미커버 목록(가상 선택으로 줄여감)
  let virtTeamTypes    = new Set(curTeam.flatMap(s => [s.t1, s.t2].filter(Boolean))); // 가상 타입 집합

  const picks = [];
  const seen  = new Set();

  for (let step = 0; step < K; step++) {
    // 옵션 스냅샷(가상 상태 반영)
    const desiredRoles = new Set(opt?.desiredRoles || []);
    const options = {
      offenseHoles: virtOffenseHoles,
      weakRank:     ctxBase.weakRank,
      desiredRoles, weights,
      teamTypes: new Set(virtTeamTypes),
      minDup: !!opt?.minDup,
      speedBias: !!opt?.speedBias
    };

    // 최고 점수 후보 1명 뽑기
    let best = null;
    for (const p of pokedex) {
      const pid = p.i ?? p.n;
      if (seen.has(pid)) continue;
      if (!Array.isArray(p.t) || p.t.length === 0) continue; // 타입 없는 항목 제외

      const score = scoreCandidate({ ATK, effect, TYPE_LABEL }, p, options);
      if (!best || score > best.score) best = { p, score };
    }
    if (!best) break;

    picks.push(best);
    seen.add(best.p.i ?? best.p.n);

    // 실제 빈 슬롯이 있으면 가상 배치 + 컨텍스트 재계산
    const idx = curTeam.findIndex(s => !s.t1 && !s.t2);
    if (idx >= 0) {
      curTeam[idx] = { ...curTeam[idx], t1: best.p.t[0] || '', t2: best.p.t[1] || '' };
      ctxBase = buildRecoContext({ ATK, TYPES, effect, combinedDefenseMultiplier }, curTeam);
      virtOffenseHoles = ctxBase.offenseHoles.slice();
      virtTeamTypes = new Set(curTeam.flatMap(s => [s.t1, s.t2].filter(Boolean)));
    } else {
      // 빈 슬롯이 없어도 리스트를 채우기 위해 "가상 선택"만 반영
      for (const t of (best.p.t || [])) virtTeamTypes.add(t);
      virtOffenseHoles = virtOffenseHoles.filter(hole =>
        !(best.p.t || []).some(atk => effect(ATK, atk, hole) === 2)
      );
      // weakRank는 실제 팀 기준 유지 (원하면 완화 가능)
    }
  }
  return picks;
}
