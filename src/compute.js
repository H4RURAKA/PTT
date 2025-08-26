// 커버리지/방어 집계 계산(순수 로직)

// 부동소수점 비교용 (effect 결과가 0.5/0.25 등일 때 안전하게 분기)
const EPS = 1e-10;
const eq = (a, b) => Math.abs(a - b) <= EPS;

export function selectedAttackTypes(team) {
  // 팀에서 사용 중인 공격 타입(중복 제거)
  const s = new Set();
  for (const { t1, t2 } of team) {
    if (t1) s.add(t1);
    if (t2) s.add(t2);
  }
  return Array.from(s);
}

export function computeAttack(ATK, TYPES, team, effect) {
  // 팀이 가진 공격 타입으로 각 방어 타입(def)에 대해 최댓 배율과 기여 타입 집계
  const atkTypes = selectedAttackTypes(team);

  const bestByDef = {};
  const contributing = {};

  for (const [def] of TYPES) {
    let best = 1;
    let who = [];

    for (const atk of atkTypes) {
      const m = effect(ATK, atk, def);

      if (m > best) {
        best = m;
        // 최댓값을 갱신했을 때만 초기화
        who = eq(m, 1) ? [] : [atk];
      } else if (eq(m, best) && m > 1) {
        // 동률 최댓값(>1)만 기여자로 인정
        who.push(atk);
      }
    }

    bestByDef[def] = best;
    contributing[def] = who;
  }

  const strongDefs = Object
    .entries(bestByDef)
    .filter(([, m]) => m > 1)
    .map(([d]) => d);

  return { atkTypes, bestByDef, contributing, strongDefs };
}

export function computeDefense(ATK, TYPES, team, combinedDefenseMultiplier) {
  // 공격 타입(atk)별로 팀 전체의 방어 배율 분포를 집계
  const agg = {};

  for (const [atk] of TYPES) {
    const c = { m4: 0, m2: 0, m1: 0, m05: 0, m025: 0, m0: 0 };

    for (const { t1, t2 } of team) {
      if (!t1 && !t2) continue;

      const m = combinedDefenseMultiplier(ATK, atk, t1 || '', t2 || '');

      // 4x 우선 카운트(듀얼 타입의 중첩 취약)
      if (m >= 4 - EPS) c.m4++;
      else if (m >= 2 - EPS) c.m2++;
      else if (eq(m, 1)) c.m1++;
      else if (eq(m, 0.5)) c.m05++;
      else if (eq(m, 0.25)) c.m025++;
      else if (eq(m, 0)) c.m0++;
      // 그 밖의 값은 존재하지 않는 전제(타입 상성 테이블이 이산 배율)
    }

    agg[atk] = c;
  }

  // 한 번의 순회로 요약 키 배열 구성
  const fourX = [];
  const twoX  = [];
  const immune = [];

  for (const [k, v] of Object.entries(agg)) {
    if (v.m4 > 0) fourX.push(k);
    if (v.m4 === 0 && v.m2 > 0) twoX.push(k);
    if (v.m0 > 0) immune.push(k);
  }

  return { agg, fourX, twoX, immune };
}

export function coverTypesFor(ATK, TYPES, effect, def) {
  // 특정 방어 타입(def)을 2x로 때릴 수 있는 공격 타입 목록
  const res = [];
  for (const [atk] of TYPES) {
    if (eq(effect(ATK, atk, def), 2)) res.push(atk);
  }
  return res;
}
