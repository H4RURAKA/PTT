// 공통 유틸
export const round = (x)=> (Math.round(x*100)/100);

export function effect(ATK, atk, def){
  return ATK[atk][def] ?? 1;
}

export function combinedDefenseMultiplier(ATK, attacking, type1, type2=''){
  const m1 = type1? effect(ATK, attacking, type1) : 1;
  const m2 = type2? effect(ATK, attacking, type2) : 1;
  return round(m1 * m2);
}

export function effClass(m){
  return m===0? 'eff-0'
    : (m===0.25? 'eff-25'
    : (m===0.5? 'eff-50'
    : (m===1? 'eff-100'
    : (m===2? 'eff-200' : 'eff-400'))));
}

// URL 상태 인코딩/디코딩 (이름 포함)
export function qsEncode(state){
  const params = new URLSearchParams();
  const { team, theme, cvd } = state;
  const slots = team.map(({t1,t2})=>[t1||'',t2||''].filter(Boolean).join('+'));
  const names = team.map(({name})=> encodeURIComponent(name||''));
  params.set('slots', slots.join('|'));
  params.set('names', names.join('|'));
  params.set('theme', theme);
  params.set('cvd', cvd);
  return params.toString();
}

export function qsDecode(){
  const p = new URLSearchParams(location.search);
  return {
    theme: p.get('theme') || null,
    cvd: p.get('cvd') || null,
    slots: (p.get('slots')||'').split('|'),
    names: (p.get('names')||'').split('|').map(s=> decodeURIComponent(s)),
  };
}
