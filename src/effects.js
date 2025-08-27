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

/* ================= URL 상태 인코딩/디코딩 ================ */

/** team: [{t1,t2,name,pkm?}] -> 쿼리스트링
 *  - p: 포켓몬 이름 배열(선택된 슬롯만)
 *  - s: 타입 조합 배열(포켓몬 미선택 슬롯만) — "t1+t2"
 *  - n: 별명 배열(둘 다 공통)
 *  - theme, cvd
 */
export function qsEncode({ team, theme, cvd }) {
  const usp = new URLSearchParams();
  if (theme) usp.set('theme', theme);
  if (cvd)   usp.set('cvd',   cvd);

  const P = [], S = [], N = [];
  for (let i = 0; i < 6; i++) {
    const s = team[i] || {};
    const nick = s.name || '';
    N[i] = nick ? encodeURIComponent(nick) : '';

    if (s.pkm && s.pkm.n) {
      // 포켓몬 선택된 슬롯: 포켓몬 이름만 저장
      P[i] = encodeURIComponent(s.pkm.n);
      S[i] = ''; // 타입은 비움(짧게)
    } else {
      // 미선택 슬롯: 타입 저장
      const a = s.t1 || '';
      const b = s.t2 || '';
      S[i] = (a || b) ? `${a}+${b}` : '';
      P[i] = '';
    }
  }

  // 뒤쪽 빈 항목 제거(짧게)
  const trimRight = (arr) => {
    let k = arr.length;
    while (k > 0 && (!arr[k - 1] || arr[k - 1] === '')) k--;
    return arr.slice(0, k);
  };
  const p = trimRight(P), s = trimRight(S), n = trimRight(N);

  if (p.length) usp.set('p', p.join(','));   // 포켓몬 이름
  if (s.length) usp.set('s', s.join(','));   // 타입(t1+t2)
  if (n.length) usp.set('n', n.join(','));   // 별명

  return usp.toString();
}

/** location.search -> { theme, cvd, slots[], names[], pokemon[] } */
export function qsDecode() {
  const usp   = new URLSearchParams(location.search.slice(1));
  const theme = usp.get('theme') || usp.get('t') || '';
  const cvd   = usp.get('cvd')   || '';

  const split = (k) => {
    const v = usp.get(k);
    if (!v) return [];
    return v.split(',').map(x => decodeURIComponent(x || ''));
  };

  const slots   = split('s'); // "t1+t2"
  const names   = split('n'); // 별명
  const pokemon = split('p'); // 포켓몬 이름

  return { theme, cvd, slots, names, pokemon };
}
