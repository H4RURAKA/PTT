export function bootstrapApp(ctx){
  const { TYPES, TYPE_KEYS, TYPE_LABEL, TYPE_COLOR, ATK, effect, combinedDefenseMultiplier, effClass, qsEncode, qsDecode } = ctx;

  // ===== State =====
  const team = Array.from({length:6}, ()=>({t1:'', t2:'', name:''}));

  // ===== Elements =====
  const teamBoard = document.getElementById('teamBoard');
  const typeCounter = document.getElementById('typeCounter');

  // ===== Build Team Board (6 rows, chip selection, name input) =====
  function buildTeamBoard(){
    teamBoard.innerHTML = '';
    for(let i=0;i<6;i++){
      const row = document.createElement('div'); row.className = 'slot'; row.dataset.i = i;
      row.innerHTML = `
        <div class=\"top\">
          <h3>포켓몬 ${i+1}</h3>
          <input class=\"name\" data-i=\"${i}\" type=\"text\" placeholder=\"이름 입력 (선택)\" />
          <div class=\"actions\">
            <button class=\"btn\" data-clear=\"${i}\">비우기</button>
          </div>
        </div>
        <div class=\"chip-row\" data-tray=\"${i}\"></div>
        <div class=\"mini\" data-mini=\"${i}\"></div>
      `;
      teamBoard.appendChild(row);
      const tray = row.querySelector(`[data-tray='${i}']`);
      TYPES.forEach(([k,ko])=>{
        const chip = document.createElement('div'); chip.className = 'chip sm'; chip.dataset.key = k; chip.dataset.i = i;
        chip.innerHTML = `<span class=\"dot\" style=\"background:${TYPE_COLOR[k]}\"></span><span>${ko}</span>`;
        tray.appendChild(chip);
      });
      // 이름 입력 이벤트
      const nameInput = row.querySelector('input.name');
      nameInput.value = team[i].name || '';
      nameInput.addEventListener('input', (e)=>{ team[i].name = e.target.value.trim(); });
    }
  }

  function presentTypesSet(){
    const s = new Set();
    for(const {t1,t2} of team){ if(t1) s.add(t1); if(t2) s.add(t2); }
    return s;
  }

  function toggleSlotType(i, key){
    const cur = team[i];
    const currentSet = new Set([cur.t1, cur.t2].filter(Boolean));
    const have = presentTypesSet();
    const isSelected = currentSet.has(key);
    if(isSelected){
      if(cur.t1===key) cur.t1=''; else if(cur.t2===key) cur.t2='';
    } else {
      if(currentSet.size>=2){ alert('각 슬롯은 최대 2속성까지 선택할 수 있습니다.'); return; }
      if(!have.has(key) && have.size>=12){ alert('고유 속성은 최대 12개까지 선택할 수 있습니다.'); return; }
      if(!cur.t1) cur.t1=key; else cur.t2=key;
    }
    reflectChips(i);
    updateAll();
  }

  function reflectChips(i){
    const row = teamBoard.querySelector(`[data-i='${i}']`);
    const cur = team[i];
    row.querySelectorAll('.chip').forEach(ch=>{
      const on = (ch.dataset.key===cur.t1 || ch.dataset.key===cur.t2);
      ch.classList.toggle('active', on);
    });
    renderSlotMini(i);
  }

  function renderSlotMini(i){
    const mini = teamBoard.querySelector(`[data-mini='${i}']`);
    mini.innerHTML = '';
    const {t1,t2} = team[i];
    if(!t1 && !t2) return;
    const counts = { m4:[], m2:[], m0:[], m025:[], m05:[] };
    for(const [atk] of TYPES){
      const m = combinedDefenseMultiplier(ATK, atk, t1||'', t2||'');
      if(m>=4) counts.m4.push(atk); else if(m>=2) counts.m2.push(atk); else if(m===0) counts.m0.push(atk); else if(m===0.25) counts.m025.push(atk); else if(m===0.5) counts.m05.push(atk);
    }
    const add = (arr, label)=>{
      if(arr.length===0) return;
      const pill = document.createElement('span'); pill.className='pill'; pill.innerHTML = `<b>${label}</b>`; mini.appendChild(pill);
      arr.forEach(k=>{ const el = document.createElement('span'); el.className='pill'; el.innerHTML = `<span class=\"dot\" style=\"background:${TYPE_COLOR[k]}\"></span>${TYPE_LABEL[k]}`; mini.appendChild(el); });
    };
    add(counts.m4, '4×'); add(counts.m2, '2×'); add(counts.m0, '0×'); add(counts.m025, '0.25×'); add(counts.m05, '0.5×');
  }

  // ===== Attack Coverage =====
  function selectedAttackTypes(){ return Array.from(presentTypesSet()); }
  function computeAttack(){
    const atkTypes = selectedAttackTypes();
    const bestByDef = {}; const contributing = {};
    for(const [def] of TYPES){
      let best = 1; let who = [];
      for(const atk of atkTypes){
        const m = effect(ATK, atk, def);
        if(m>best){ best = m; who = [atk]; }
        else if(m===best && m>1){ who.push(atk); }
      }
      bestByDef[def] = best; contributing[def] = who;
    }
    const strongDefs = Object.entries(bestByDef).filter(([_,m])=>m>1).map(([d])=>d);
    return { atkTypes, bestByDef, contributing, strongDefs };
  }

  // ===== Team Defense Aggregation =====
  function computeDefense(){
    const agg = {}; // atkType -> {m4,m2,m1,m05,m025,m0}
    for(const [atk] of TYPES){
      agg[atk] = {m4:0,m2:0,m1:0,m05:0,m025:0,m0:0};
      for(const {t1,t2} of team){
        if(!t1 && !t2) continue;
        const m = combinedDefenseMultiplier(ATK, atk, t1||'', t2||'');
        if(m>=4) agg[atk].m4++; else if(m>=2) agg[atk].m2++; else if(m===1) agg[atk].m1++; else if(m===0.5) agg[atk].m05++; else if(m===0.25) agg[atk].m025++; else if(m===0) agg[atk].m0++;
      }
    }
    const fourX = Object.entries(agg).filter(([_,v])=>v.m4>0).map(([k])=>k);
    const twoX = Object.entries(agg).filter(([_,v])=>v.m4===0 && v.m2>0).map(([k])=>k);
    const immune = Object.entries(agg).filter(([_,v])=>v.m0>0).map(([k])=>k);
    return { agg, fourX, twoX, immune };
  }

  // ===== Render Attack Table & Highlights =====
  function renderAttackTable(data){
    const { atkTypes, bestByDef } = data;
    const tbl = document.getElementById('attackTable');
    const headers = ['공격\방어', ...TYPES.map(([k,ko])=>`${ko}`)];
    const thead = `<thead><tr>${headers.map((h,idx)=> idx===0? `<th>${h}</th>` : `<th class=\"col-${TYPE_KEYS[idx-1]}\">${h}</th>`).join('')}</tr></thead>`;

    const rows = [];
    for(const atk of atkTypes){
      const tds = [`<td class=\"sticky-col\"><b>${TYPE_LABEL[atk]}</b></td>`];
      for(const [def] of TYPES){
        const m = effect(ATK, atk, def);
        const cls = 'eff '+effClass(m);
        tds.push(`<td class=\"col-${def}\"><span class=\"${cls}\">${m}×</span></td>`);
      }
      rows.push(`<tr>${tds.join('')}</tr>`);
    }
    const bestTds = [`<td class=\"sticky-col\"><b>전체</b></td>`];
    for(const [def] of TYPES){
      const m = bestByDef[def] ?? 1; const cls = 'eff '+effClass(m);
      bestTds.push(`<td class=\"col-${def}\"><span class=\"${cls}\">${m}×</span></td>`);
    }
    rows.push(`<tr>${bestTds.join('')}</tr>`);

    tbl.innerHTML = thead + `<tbody>${rows.join('')}</tbody>`;
    applyAttackHighlight(bestByDef);
    renderHoleSuggestions(bestByDef);
  }

  function applyAttackHighlight(bestByDef){
    const tbl = document.getElementById('attackTable');
    TYPES.forEach(([k])=>{
      const isHole = (bestByDef[k]||1) <= 1;
      tbl.querySelectorAll(`.col-${k}`).forEach(cell=>{ cell.classList.toggle('hole-col', isHole); });
      const th = tbl.querySelector(`thead th.col-${k}`);
      if(th) th.classList.toggle('hole-col', isHole);
    });
  }

  function renderAttackSummary(data){
    const { atkTypes, bestByDef, strongDefs } = data;
    document.getElementById('atkTypesCount').textContent = atkTypes.length;
    document.getElementById('atkStrongCount').textContent = `${strongDefs.length} / 18`;
    document.getElementById('atkHolesCount').textContent = 18 - strongDefs.length;

    const list = document.getElementById('atkStrongList');
    list.innerHTML = '';
    strongDefs.sort((a,b)=>TYPE_LABEL[a].localeCompare(TYPE_LABEL[b],'ko')).forEach(def=>{
      const chip = document.createElement('span'); chip.className='pill';
      chip.innerHTML = `<span class=\"dot\" style=\"background:${TYPE_COLOR[def]}\"></span>${TYPE_LABEL[def]} (2×)`;
      list.appendChild(chip);
    });
  }

  function coverTypesFor(def){
    const res = [];
    for(const [atk] of TYPES){ if(effect(ATK, atk, def)===2) res.push(atk); }
    return res;
  }
  function renderHoleSuggestions(bestByDef){
    const panel = document.getElementById('holeSuggest');
    panel.innerHTML = '';
    const holes = TYPES.filter(([k])=> (bestByDef[k]||1) <= 1).map(([k])=>k);
    if(!holes.length){ panel.style.display='none'; return; }
    panel.style.display='';
    holes.forEach(def=>{
      const block = document.createElement('div'); block.className='hole-block';
      const title = document.createElement('span'); title.className='pill'; title.innerHTML = `<b>${TYPE_LABEL[def]} 커버:</b>`; block.appendChild(title);
      const covers = coverTypesFor(def);
      covers.forEach(a=>{
        const el = document.createElement('span'); el.className='pill';
        el.innerHTML = `<span class=\"dot\" style=\"background:${TYPE_COLOR[a]}\"></span>${TYPE_LABEL[a]}`;
        block.appendChild(el);
      });
      panel.appendChild(block);
    });
  }

  // ===== Defense Table =====
  function renderDefenseTable(data){
    const { agg } = data;
    const tbl = document.getElementById('defenseTable');
    const thead = `<thead><tr>
      <th>공격 타입</th>
      <th>4×</th><th>2×</th><th>1×</th><th>0.5×</th><th>0.25×</th><th>0×</th>
    </tr></thead>`;
    const rows = [];
    for(const [atk,counts] of Object.entries(agg)){
      const emph = (counts.m4>0 || counts.m2>0) ? ' style=\"font-weight:700\"' : '';
      rows.push(`<tr${emph}>
        <td class=\"sticky-col\"><b>${TYPE_LABEL[atk]}</b></td>
        <td><span class=\"eff eff-400\">${counts.m4}</span></td>
        <td><span class=\"eff eff-200\">${counts.m2}</span></td>
        <td><span class=\"eff eff-100\">${counts.m1}</span></td>
        <td><span class=\"eff eff-50\">${counts.m05}</span></td>
        <td><span class=\"eff eff-25\">${counts.m025}</span></td>
        <td><span class=\"eff eff-0\">${counts.m0}</span></td>
      </tr>`);
    }
    tbl.innerHTML = thead + `<tbody>${rows.join('')}</tbody>`;
  }

  function renderDefenseSummary(data){
    const { fourX, twoX, immune } = data;
    document.getElementById('defFourCount').textContent = `${fourX.length} 타입`;
    document.getElementById('defTwoCount').textContent = `${twoX.length} 타입`;
    document.getElementById('defImmuneCount').textContent = `${immune.length} 타입`;

    const list = document.getElementById('defWeakList');
    list.innerHTML = '';
    const items = [
      ...fourX.map(k=>({k, label:`${TYPE_LABEL[k]} (4×)` , color: TYPE_COLOR[k]})),
      ...twoX.map(k=>({k, label:`${TYPE_LABEL[k]} (2×)` , color: TYPE_COLOR[k]})),
    ];
    items.forEach(({k,label,color})=>{
      const el = document.createElement('span'); el.className='pill';
      el.innerHTML = `<span class=\"dot\" style=\"background:${color}\"></span>${label}`;
      list.appendChild(el);
    });
  }

  // ===== Remaining Types Panel =====
  function renderRemaining(){
    const have = presentTypesSet();
    const list = document.getElementById('remainingTypes');
    list.innerHTML = '';
    const rest = TYPES.map(([k])=>k).filter(k=>!have.has(k));
    rest.forEach(k=>{
      const el = document.createElement('span'); el.className='pill';
      el.innerHTML = `<span class=\"dot\" style=\"background:${TYPE_COLOR[k]}\"></span>${TYPE_LABEL[k]}`;
      list.appendChild(el);
    });
    typeCounter.textContent = `고유 속성: ${have.size}/12`;
  }

  // ===== Share / URL State =====
  function encodeState(){
    return qsEncode({ team, theme: document.documentElement.getAttribute('data-theme')||'light', cvd: document.documentElement.getAttribute('data-cvd')||'0' });
  }
  function decodeState(){
    const { theme, cvd, slots, names } = qsDecode();
    if(theme) document.documentElement.setAttribute('data-theme', theme);
    if(cvd) document.documentElement.setAttribute('data-cvd', cvd);
    slots.slice(0,6).forEach((s,i)=>{
      const [a,b] = s.split('+');
      team[i].t1 = TYPE_KEYS.includes(a)? a : '';
      team[i].t2 = TYPE_KEYS.includes(b)? b : '';
    });
    names.slice(0,6).forEach((n,i)=>{ team[i].name = n || ''; });
    // reflect visuals
    for(let i=0;i<6;i++){
      const row = teamBoard.querySelector(`[data-i='${i}']`);
      if(row){
        const input = row.querySelector('input.name'); if(input) input.value = team[i].name;
        reflectChips(i);
      }
    }
  }

  // ===== Compute All & Render =====
  function updateAll(){
    renderRemaining();
    for(let i=0;i<6;i++) renderSlotMini(i);
    const atk = computeAttack();
    renderAttackSummary(atk);
    renderAttackTable(atk);
    const def = computeDefense();
    renderDefenseSummary(def);
    renderDefenseTable(def);
  }

  // ===== Init =====
  buildTeamBoard();
  teamBoard.addEventListener('click', (e)=>{
    const chip = e.target.closest('.chip');
    if(chip){ const i = +chip.dataset.i; const key = chip.dataset.key; toggleSlotType(i, key); return; }
    const clearBtn = e.target.closest('button[data-clear]');
    if(clearBtn){ const i = +clearBtn.dataset.clear; team[i]={t1:'',t2:'',name: team[i].name}; reflectChips(i); updateAll(); return; }
  });

  updateAll();
  decodeState();
  updateAll();

  // ===== Header actions =====
  document.getElementById('resetBtn').onclick = ()=>{
    for(let i=0;i<6;i++){ team[i]={t1:'',t2:'',name:''}; const row = teamBoard.querySelector(`[data-i='${i}']`); if(row){ const input=row.querySelector('input.name'); if(input) input.value=''; } reflectChips(i); }
    updateAll(); history.replaceState({}, '', location.pathname);
  };
  document.getElementById('shareBtn').onclick = async ()=>{
    const qs = encodeState();
    const url = location.origin + location.pathname + '?' + qs;
    try { await navigator.clipboard.writeText(url); alert('현재 구성이 URL로 복사되었습니다.'); }
    catch { prompt('복사할 URL:', url); }
  };
  document.getElementById('printBtn').onclick = ()=> window.print();
  document.getElementById('themeBtn').onclick = ()=>{
    const cur = document.documentElement.getAttribute('data-theme')||'light';
    const nxt = cur==='light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', nxt);
  };
  document.getElementById('cvdBtn').onclick = ()=>{
    const cur = document.documentElement.getAttribute('data-cvd')||'0';
    const nxt = cur==='0' ? '1' : '0';
    document.documentElement.setAttribute('data-cvd', nxt);
  };
}

// 고정 헤더 높이 보정
export function adjustHeaderSpacer(){
  const header = document.getElementById('appHeader');
  const spacer = document.getElementById('header-spacer');
  if(!header || !spacer) return;
  const h = header.offsetHeight; spacer.style.height = `${h}px`;
}