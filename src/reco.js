// 추천 데이터 로더 + 점수/설명 + 추천 (그리디 / 가중랜덤)
import { computeAttack, computeDefense } from './compute.js';

export async function loadPokedex() {
  try {
    const r = await fetch('/data/pokemon.min.json', { cache: 'no-store' });
    if (r.ok) return await r.json();
  } catch(e) {}
  // fallback 샘플
  try {
    const r2 = await fetch('/data/pokemon.sample.json', { cache: 'no-store' });
    if (r2.ok) return await r2.json();
  } catch(e) {}
  return [];
}

// 자동 태그(종족값 기반)
export function autoTags(p) {
  const [HP,Atk,Def,SpA,SpD,Spe] = p.b;
  const tags = new Set(p.tags || []);
  if (Atk >= SpA + 15 && (Spe >= 95 || Atk >= 110)) tags.add('physical');
  if (SpA >= Atk + 15 && (Spe >= 95 || SpA >= 110)) tags.add('special');
  if ((HP + Def + SpD) >= 380 && Spe <= 80) tags.add('wall');
  if (Spe >= 110) tags.add('speed');
  if (!tags.size) tags.add('balanced');
  return Array.from(tags);
}

export function buildRecoContext({ ATK, TYPES, effect, combinedDefenseMultiplier }, team) {
  const atk = computeAttack(ATK, TYPES, team, effect);
  const def = computeDefense(ATK, TYPES, team, combinedDefenseMultiplier);
  const offenseHoles = TYPES.filter(([k]) => (atk.bestByDef[k] || 1) <= 1).map(([k]) => k);
  const weakRank = Object.entries(def.agg)
    .map(([k,v]) => ({ k, s: v.m4*100 + v.m2 }))
    .sort((a,b)=> b.s - a.s)
    .filter(x => x.s > 0)
    .map(x => x.k);
  return { atk, def, offenseHoles, weakRank };
}

export function scoreCandidate(ctx, p, options) {
  const { ATK, effect } = ctx;
  const { offenseHoles, weakRank, desiredRoles, weights, teamTypes, minDup, speedBias } = options;

  let s = 0;
  const tags = new Set(autoTags(p));
  const types = p.t || [];

  // 1) 공격 커버 보강
  for (const hole of offenseHoles) {
    if (types.some(atk => effect(ATK, atk, hole) === 2)) s += weights.offense;
  }
  // 2) 방어 취약 완화(상위 5개까지만)
  weakRank.slice(0,5).forEach(wk => {
    if (types.length) {
      const m1 = effect(ATK, wk, types[0]) ?? 1;
      const m2 = types[1] ? (effect(ATK, wk, types[1]) ?? 1) : 1;
      const m = m1 * m2;
      if (m === 0) s += weights.defense * 1.2;
      else if (m <= 0.5) s += weights.defense;
    }
  });
  // 3) 역할 밸런스(UI에 물리/특수만 있어도 안전)
  if (desiredRoles?.size) {
    if (desiredRoles.has('physical') && tags.has('physical')) s += weights.roles;
    if (desiredRoles.has('special')  && tags.has('special'))  s += weights.roles;
    if (desiredRoles.has('wall')     && tags.has('wall'))     s += weights.roles * 0.9;
    if (desiredRoles.has('hazard')   && tags.has('hazard'))   s += weights.roles * 1.1;
  }
  // 4) 스피드 우선
  const Spe = p.b?.[5] ?? 0;
  if (speedBias) {
    if (Spe >= 110) s += weights.speed;
    else if (Spe >= 100) s += weights.speed * 0.6;
  }
  // 5) BST 보정(약하게)
  const bst = (p.b || []).reduce((a,b)=>a+b,0);
  s += Math.min(0.6, (bst - 450) / 1000) * weights.bst;

  // 6) 타입 중복 페널티
  if (minDup && teamTypes?.size) {
    const dup = types.filter(t => teamTypes.has(t)).length;
    if (dup >= 2) s -= 0.8; else if (dup === 1) s -= 0.35;
  }
  return s;
}

export function explainCandidate(ctx, p, options) {
  const { ATK, effect, TYPE_LABEL } = ctx;
  const badges = [];
  (options?.offenseHoles || []).forEach(h => {
    if (p.t.some(atk => effect(ATK, atk, h) === 2)) badges.push(`미커버(${TYPE_LABEL[h]}) 커버`);
  });
  const wk = options?.weakRank?.[0];
  if (wk && p.t.length) {
    const m1 = effect(ATK, wk, p.t[0]) ?? 1;
    const m2 = p.t[1] ? (effect(ATK, wk, p.t[1]) ?? 1) : 1;
    const m = m1*m2;
    if (m === 0) badges.push(`면역(${TYPE_LABEL[wk]})`);
    else if (m <= 0.5) badges.push(`저항(${TYPE_LABEL[wk]})`);
  }
  const tags = new Set(autoTags(p));
  if (tags.has('physical')) badges.push('물리 에이스');
  if (tags.has('special'))  badges.push('특수 에이스');
  if (tags.has('wall'))     badges.push('막이');
  if (tags.has('hazard'))   badges.push('깔개');
  if ((p.b?.[5] ?? 0) >= 110) badges.push('스피드 110+');
  return Array.from(new Set(badges)).slice(0,6);
}

// 그리디 추천(상위 K)
export function recommendGreedy(env, pokedex, team, K, opt) {
  const { TYPES, TYPE_LABEL, TYPE_COLOR, ATK, effect, combinedDefenseMultiplier } = env;
  const weights = { offense:3, defense:3, roles:2, speed:1.5, bst:0.5, ...(opt?.weights||{}) };

  let ctxBase = buildRecoContext({ ATK, TYPES, effect, combinedDefenseMultiplier }, team);
  let curTeam = team.map(s => ({...s}));
  const picks = [];
  const seen = new Set();

  for (let step = 0; step < K; step++) {
    const teamTypes = new Set();
    for (const {t1,t2} of curTeam) { if (t1) teamTypes.add(t1); if (t2) teamTypes.add(t2); }

    const desiredRoles = new Set(opt?.desiredRoles || []);
    const options = {
      offenseHoles: ctxBase.offenseHoles,
      weakRank: ctxBase.weakRank,
      desiredRoles, weights, teamTypes,
      minDup: !!opt?.minDup,
      speedBias: !!opt?.speedBias
    };

    let best = null;
    for (const p of pokedex) {
      const pid = p.i ?? p.n;
      if (seen.has(pid)) continue;
      const score = scoreCandidate({ ATK, effect, TYPE_LABEL }, p, options);
      if (!best || score > best.score) best = { p, score };
    }
    if (!best) break;
    picks.push(best);
    seen.add(best.p.i ?? best.p.n);

    const idx = curTeam.findIndex(s => !s.t1 && !s.t2);
    if (idx >= 0) curTeam[idx] = { ...curTeam[idx], t1: best.p.t[0] || '', t2: best.p.t[1] || '' };

    ctxBase = buildRecoContext({ ATK, TYPES, effect, combinedDefenseMultiplier }, curTeam);
  }
  return picks;
}

/* 내부: 가중치 샘플링(중복 없음) */
function _weightedSample(arr, k){
  const pool = arr.map(x => ({ ...x }));
  const out = [];
  for (let r = 0; r < k && pool.length; r++){
    const total = pool.reduce((s,x) => s + Math.max(x.score, 0.0001), 0);
    let t = Math.random() * total, idx = 0;
    for (; idx < pool.length; idx++){
      t -= Math.max(pool[idx].score, 0.0001);
      if (t <= 0) break;
    }
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
}

// 가중 랜덤 추천(전 후보 점수화 후 확률적으로 추출)
export function recommendWeighted(env, pokedex, team, K, opt){
  const { TYPES, ATK, effect, combinedDefenseMultiplier, TYPE_LABEL } = env;
  const weights = { offense:3, defense:3, roles:2, speed:1.5, bst:0.5, ...(opt?.weights||{}) };

  const ctxBase = buildRecoContext({ ATK, TYPES, effect, combinedDefenseMultiplier }, team);
  const teamTypes = new Set(team.flatMap(s => [s.t1, s.t2].filter(Boolean)));
  const desiredRoles = new Set(opt?.desiredRoles || []);
  const options = {
    offenseHoles: ctxBase.offenseHoles,
    weakRank: ctxBase.weakRank,
    desiredRoles, weights, teamTypes,
    minDup: !!opt?.minDup,
    speedBias: !!opt?.speedBias
  };

  const scored = pokedex.map(p => ({
    p,
    score: scoreCandidate({ ATK, effect, TYPE_LABEL }, p, options)
  }));
  return _weightedSample(scored, Math.max(1, K|0));
}
