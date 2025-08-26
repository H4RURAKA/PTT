// 커버리지/방어 집계 계산(순수 로직)

export function selectedAttackTypes(team) {
  const s = new Set();
  for (const { t1, t2 } of team) { if (t1) s.add(t1); if (t2) s.add(t2); }
  return Array.from(s);
}

export function computeAttack(ATK, TYPES, team, effect) {
  const atkTypes = selectedAttackTypes(team);
  const bestByDef = {}; const contributing = {};
  for (const [def] of TYPES) {
    let best = 1, who = [];
    for (const atk of atkTypes) {
      const m = effect(ATK, atk, def);
      if (m > best) { best = m; who = [atk]; }
      else if (m === best && m > 1) who.push(atk);
    }
    bestByDef[def] = best; contributing[def] = who;
  }
  const strongDefs = Object.entries(bestByDef).filter(([, m]) => m > 1).map(([d]) => d);
  return { atkTypes, bestByDef, contributing, strongDefs };
}

export function computeDefense(ATK, TYPES, team, combinedDefenseMultiplier) {
  const agg = {};
  for (const [atk] of TYPES) {
    const c = { m4: 0, m2: 0, m1: 0, m05: 0, m025: 0, m0: 0 };
    for (const { t1, t2 } of team) {
      if (!t1 && !t2) continue;
      const m = combinedDefenseMultiplier(ATK, atk, t1 || '', t2 || '');
      if (m >= 4) c.m4++; else if (m >= 2) c.m2++; else if (m === 1) c.m1++;
      else if (m === 0.5) c.m05++; else if (m === 0.25) c.m025++; else if (m === 0) c.m0++;
    }
    agg[atk] = c;
  }
  const fourX = Object.entries(agg).filter(([, v]) => v.m4 > 0).map(([k]) => k);
  const twoX  = Object.entries(agg).filter(([, v]) => v.m4 === 0 && v.m2 > 0).map(([k]) => k);
  const immune= Object.entries(agg).filter(([, v]) => v.m0 > 0).map(([k]) => k);
  return { agg, fourX, twoX, immune };
}

export function coverTypesFor(ATK, TYPES, effect, def) {
  const res = [];
  for (const [atk] of TYPES) if (effect(ATK, atk, def) === 2) res.push(atk);
  return res;
}
