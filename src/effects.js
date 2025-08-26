// 상성 계산, 배율 클래스, URL 인코딩/디코딩

export function effect(ATK, atk, def){
  if (!atk || !def) return 1;
  const row = ATK[atk] || {};
  return row[def] ?? 1;
}

export function combinedDefenseMultiplier(ATK, atk, def1, def2){
  const m1 = def1 ? effect(ATK, atk, def1) : 1;
  const m2 = def2 ? effect(ATK, atk, def2) : 1;
  return Number((m1 * m2).toFixed(2));
}

export function effClass(m){
  if (m === 0) return 'eff-0';
  if (m === 0.25) return 'eff-25';
  if (m === 0.5) return 'eff-50';
  if (m === 1) return 'eff-100';
  if (m === 2) return 'eff-200';
  if (m >= 4) return 'eff-400';
  return 'eff-100';
}

// --- URL state: slots & names & theme/cvd ---

export function qsEncode({ team, theme, cvd }){
  const slots = team.map(s => [s.t1, s.t2].filter(Boolean).join('+')).join('|');
  const names = team.map(s => encodeURIComponent(s.name || '')).join('|');
  const q = new URLSearchParams();
  if (slots) q.set('slots', slots);
  if (names) q.set('names', names);
  if (theme) q.set('theme', theme);
  if (cvd)   q.set('cvd', cvd);
  return q.toString();
}

export function qsDecode(){
  const q = new URLSearchParams(location.search);
  const slots = (q.get('slots') || '').split('|').filter(Boolean);
  const names = (q.get('names') || '').split('|').map(decodeURIComponent);
  return {
    slots, names,
    theme: q.get('theme') || '',
    cvd: q.get('cvd') || ''
  };
}
