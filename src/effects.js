// 상성 계산, 배율 클래스, URL 인코딩/디코딩

// 부동소수 오차 보정용
const EPS = 1e-10;
const eq = (a, b) => Math.abs(a - b) <= EPS;

export function effect(ATK, atk, def){
  if (!atk || !def) return 1;
  const row = ATK[atk] || null;
  const m = row && row[def];
  return (m == null ? 1 : m);
}

export function combinedDefenseMultiplier(ATK, atk, def1, def2){
  const m1 = def1 ? effect(ATK, atk, def1) : 1;
  const m2 = def2 ? effect(ATK, atk, def2) : 1;
  // 소수 오차를 줄이기 위해 2자리로 고정
  return Number((m1 * m2).toFixed(2));
}

export function effClass(m){
  if (eq(m, 0))    return 'eff-0';
  if (eq(m, 0.25)) return 'eff-25';
  if (eq(m, 0.5))  return 'eff-50';
  if (eq(m, 1))    return 'eff-100';
  if (eq(m, 2))    return 'eff-200';
  if (m > 2 + EPS) return 'eff-400'; // 4x 이상
  return 'eff-100';
}

// --- URL state: slots & names & theme/cvd ---

export function qsEncode({ team, theme, cvd }){
  // ex) slots=불꽃+비행|물|...
  const slots = team
    .map(s => [s.t1, s.t2].filter(Boolean).join('+'))
    .join('|');

  // 이름은 안전하게 인코딩
  const names = team
    .map(s => encodeURIComponent(s.name || ''))
    .join('|');

  const q = new URLSearchParams();
  if (slots) q.set('slots', slots);
  if (names) q.set('names', names);
  if (theme) q.set('theme', theme);
  if (cvd)   q.set('cvd', cvd);
  return q.toString();
}

export function qsDecode(){
  const q = new URLSearchParams(location.search);

  // 빈 슬롯도 인덱스를 유지해야 하므로 filter(Boolean) 사용 금지
  const slots = (q.get('slots') || '').split('|'); // ['불꽃+비행', '', '물', ...]
  const names = (q.get('names') || '').split('|').map(decodeURIComponent);

  return {
    slots,
    names,
    theme: q.get('theme') || '',
    cvd:   q.get('cvd') || ''
  };
}
