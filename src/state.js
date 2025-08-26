// 팀 상태와 슬롯 토글/초기화(순수 로직)

export function createInitialTeam() {
  return Array.from({ length: 6 }, () => ({ t1: '', t2: '', name: '' }));
}

export function presentTypesSet(team) {
  const s = new Set();
  for (const { t1, t2 } of team) { if (t1) s.add(t1); if (t2) s.add(t2); }
  return s;
}

export function toggleSlotType(team, i, key, maxUnique = 12) {
  const cur = team[i];
  const selected = new Set([cur.t1, cur.t2].filter(Boolean));
  const have = presentTypesSet(team);

  if (selected.has(key)) {
    if (cur.t1 === key) cur.t1 = '';
    else if (cur.t2 === key) cur.t2 = '';
    return { changed: true };
  }
  if (selected.size >= 2) return { changed: false, reason: '각 슬롯은 최대 2속성까지 선택할 수 있습니다.' };
  if (!have.has(key) && have.size >= maxUnique)
    return { changed: false, reason: '고유 속성은 최대 12개까지 선택할 수 있습니다.' };

  if (!cur.t1) cur.t1 = key; else cur.t2 = key;
  return { changed: true };
}

export function clearSlot(team, i) {
  team[i] = { t1: '', t2: '', name: team[i].name };
}
