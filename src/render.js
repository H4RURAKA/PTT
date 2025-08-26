// DOM 렌더링

export function buildTeamBoard(teamBoard, team, TYPES, TYPE_COLOR, TYPE_LABEL){
  teamBoard.innerHTML = '';

  // 팀 크기에 맞춰 슬롯 개수 결정 (기본 6)
  const TEAM_SIZE = Array.isArray(team) && team.length ? team.length : 6;

  const frag = document.createDocumentFragment();

  for (let i = 0; i < TEAM_SIZE; i++){
    const row = document.createElement('div');
    row.className = 'slot no-sprite';        // 기본: 스프라이트 없음
    row.dataset.i = i;

    row.innerHTML = `
      <div class="top">
        <h3>포켓몬 ${i + 1}</h3>
        <div class="actions">
          <button class="btn" data-clear="${i}">초기화</button>
        </div>
      </div>

      <div class="slot-grid">
        <!-- 좌: 포켓몬 선택/별명 (2) -->
        <div class="slot-left">
          <input class="search" data-i="${i}" list="pokedexList" placeholder="포켓몬 검색(한글 이름)" />
          <input class="name"   data-i="${i}" type="text" placeholder="별명(선택)" />
        </div>

        <!-- 중: 스프라이트 (1) -->
        <div class="slot-sprite">
          <img class="sprite" data-sprite="${i}" alt="pokemon sprite"/>
        </div>

        <!-- 우: 타입 18종 (6) -->
        <div class="slot-right">
          <div class="chip-row" data-tray="${i}"></div>
        </div>
      </div>

      <!-- 슬롯 하단 요약 -->
      <div class="mini" data-mini="${i}"></div>
    `;

    // 타입 칩 생성
    const tray = row.querySelector(`[data-tray='${i}']`);
    const chipsFrag = document.createDocumentFragment();
    TYPES.forEach(([k, ko]) => {
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.dataset.key = k;
      chip.dataset.i = i;
      chip.innerHTML = `<span class="dot" style="background:${TYPE_COLOR[k]}"></span><span>${ko}</span>`;
      chipsFrag.appendChild(chip);
    });
    tray.appendChild(chipsFrag);

    // 별명 초기값
    const nameInput = row.querySelector('input.name');
    if (nameInput) nameInput.value = team[i]?.name || '';

    frag.appendChild(row);
  }

  teamBoard.appendChild(frag);
}

export function reflectChips(teamBoard, team, i){
  const row = teamBoard.querySelector(`[data-i='${i}']`);
  if (!row) return;

  const cur = team[i];
  row.querySelectorAll('.chip').forEach(ch => {
    const on = (ch.dataset.key === cur.t1 || ch.dataset.key === cur.t2);
    ch.classList.toggle('active', on);
  });
}

function tagKo(tag){
  const map = {
    physical: '물리',
    special:  '특수',
    wall:     '막이',
    hazard:   '깔개',
    speed:    '스피드',
    balanced: '밸런스',
    tank:     '탱크'
  };
  return map[tag] || tag;
}

export function renderSlotMini(teamBoard, team, i, ATK, TYPES, TYPE_COLOR, TYPE_LABEL, combinedDefenseMultiplier){
  const mini = teamBoard.querySelector(`[data-mini='${i}']`);
  if (!mini) return;

  mini.innerHTML = '';

  const { t1, t2, pkm } = team[i];

  // === 1줄: [태그] [태그들] [BST N] [HP~SPD] ===
  const metaRow = document.createElement('div');
  metaRow.className = 'meta-row';

  metaRow.appendChild(pill('<b>태그</b>', null, true));

  if (pkm && Array.isArray(pkm.tags) && pkm.tags.length){
    pkm.tags.forEach(tag => metaRow.appendChild(pill(tagKo(tag))));
  }

  if (pkm){
    const bst = (pkm.b || []).reduce((a, b) => a + b, 0);
    metaRow.appendChild(pill(`<b>BST ${bst}</b>`, 'stat-pill', true));

    const [HP = 0, ATKv = 0, DEF = 0, SPATK = 0, SPDEF = 0, SPD = 0] = pkm.b || [];
    metaRow.appendChild(
      pill(`HP: ${HP} | ATK: ${ATKv} | SPATK: ${SPATK} | DEF: ${DEF} | SPDEF: ${SPDEF} | SPD: ${SPD}`, 'stat-pill')
    );
  } else {
    metaRow.appendChild(pill('<b>BST —</b>', 'stat-pill', true));
  }

  mini.appendChild(metaRow);

  // 타입이 없으면 약점/반감 표시는 생략
  if (!t1 && !t2) return;

  // 약점/반감 계산
  const four = [], two = [], half = [], quarter = [];
  for (const [atk] of TYPES){
    const m = combinedDefenseMultiplier(ATK, atk, t1 || '', t2 || '');
    if (m >= 4)       four.push(atk);
    else if (m >= 2)  two.push(atk);
    else if (m === .5)   half.push(atk);
    else if (m === .25)  quarter.push(atk);
  }

  // === 2줄: [약점] [4×] … [2×] … ===
  const weakRow = document.createElement('div');
  weakRow.className = 'weak-row';
  weakRow.appendChild(pill('<b>약점</b>', null, true));

  if (four.length){
    weakRow.appendChild(pill('<b>4×</b>', null, true));
    four.forEach(k => weakRow.appendChild(pillWithDot(TYPE_LABEL[k], TYPE_COLOR[k])));
  }
  if (two.length){
    weakRow.appendChild(pill('<b>2×</b>', null, true));
    two.forEach(k => weakRow.appendChild(pillWithDot(TYPE_LABEL[k], TYPE_COLOR[k])));
  }
  mini.appendChild(weakRow);

  // === 3줄: [반감] [0.5×] … [0.25×] … ===
  const resistRow = document.createElement('div');
  resistRow.className = 'weak-row';
  resistRow.appendChild(pill('<b>반감</b>', null, true));

  if (half.length){
    resistRow.appendChild(pill('<b>0.5×</b>', null, true));
    half.forEach(k => resistRow.appendChild(pillWithDot(TYPE_LABEL[k], TYPE_COLOR[k])));
  }
  if (quarter.length){
    resistRow.appendChild(pill('<b>0.25×</b>', null, true));
    quarter.forEach(k => resistRow.appendChild(pillWithDot(TYPE_LABEL[k], TYPE_COLOR[k])));
  }
  mini.appendChild(resistRow);

  // ---- helpers ----
  function pill(text, extraClass = null, raw = false){
    const el = document.createElement('span');
    el.className = 'pill' + (extraClass ? ` ${extraClass}` : '');
    el.innerHTML = raw ? text : escapeHtml(text);
    return el;
  }
  function pillWithDot(text, color){
    const el = document.createElement('span');
    el.className = 'pill';
    el.innerHTML = `<span class="dot" style="background:${color}"></span>${text}`;
    return el;
  }
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;' }[m]));
  }
}

/* 나머지(공격/방어 표 렌더) 함수 */
export function renderAttackSummary(atk, TYPE_LABEL, TYPE_COLOR, listEl, strongCountEl, holeCountEl, typesCountEl){
  const { atkTypes, /* bestByDef, */ strongDefs } = atk;

  typesCountEl.textContent  = String(atkTypes.length);
  strongCountEl.textContent = `${strongDefs.length} / 18`;
  holeCountEl.textContent   = String(18 - strongDefs.length);

  listEl.innerHTML = '';
  const frag = document.createDocumentFragment();

  strongDefs
    .slice()
    .sort((a, b) => TYPE_LABEL[a].localeCompare(TYPE_LABEL[b], 'ko'))
    .forEach(def => {
      const chip = document.createElement('span');
      chip.className = 'pill';
      chip.innerHTML = `<span class="dot" style="background:${TYPE_COLOR[def]}"></span>${TYPE_LABEL[def]} (2×)`;
      frag.appendChild(chip);
    });

  listEl.appendChild(frag);
}

export function renderAttackTable(tableEl, TYPES, TYPE_KEYS, TYPE_LABEL, ATK, effect, effClass, bestByDef){
  const thead = `<thead><tr>${
    ['공격\\방어', ...TYPES.map(([, ko]) => ko)]
      .map((h, idx) => idx === 0
        ? `<th class="sticky-col">${h}</th>`
        : `<th class="col-${TYPE_KEYS[idx - 1]}">${h}</th>`
      ).join('')
  }</tr></thead>`;

  const bestTds = [`<td class="sticky-col"><b>전체</b></td>`];
  for (const [def] of TYPES){
    const m = bestByDef[def] ?? 1;
    bestTds.push(`<td class="col-${def}"><span class="eff ${effClass(m)}">${m}×</span></td>`);
  }

  tableEl.innerHTML = thead + `<tbody><tr>${bestTds.join('')}</tr></tbody>`;
}

export function renderAttackRows(tableEl, atkTypes, TYPES, TYPE_LABEL, ATK, effect, effClass){
  const tbody = tableEl.querySelector('tbody');
  const frag  = document.createDocumentFragment();

  for (const atk of atkTypes){
    const tds = [`<td class="sticky-col"><b>${TYPE_LABEL[atk]}</b></td>`];
    for (const [def] of TYPES){
      const m = effect(ATK, atk, def);
      tds.push(`<td class="col-${def}"><span class="eff ${effClass(m)}">${m}×</span></td>`);
    }
    const tr = document.createElement('tr');
    tr.innerHTML = tds.join('');
    frag.appendChild(tr);
  }

  tbody.insertBefore(frag, tbody.firstChild);
}

export function applyAttackHighlight(tableEl, TYPES, bestByDef){
  TYPES.forEach(([k]) => {
    const hole = (bestByDef[k] || 1) <= 1;
    tableEl.querySelectorAll(`.col-${k}`).forEach(cell => {
      cell.classList.toggle('hole-col', hole);
    });
    const th = tableEl.querySelector(`thead th.col-${k}`);
    if (th) th.classList.toggle('hole-col', hole);
  });
}

export function renderHoleSuggestions(panelEl, TYPES, TYPE_LABEL, TYPE_COLOR, coverTypesForFn, bestByDef){
  panelEl.innerHTML = '';

  const holes = TYPES
    .filter(([k]) => (bestByDef[k] || 1) <= 1)
    .map(([k]) => k);

  if (!holes.length){
    panelEl.style.display = 'none';
    return;
  }
  panelEl.style.display = '';

  const frag = document.createDocumentFragment();
  holes.forEach(def => {
    const block = document.createElement('div');
    block.className = 'hole-block';

    const title = document.createElement('span');
    title.className = 'pill';
    title.innerHTML = `<b>${TYPE_LABEL[def]} 커버:</b>`;
    block.appendChild(title);

    coverTypesForFn(def).forEach(a => {
      const el = document.createElement('span');
      el.className = 'pill';
      el.innerHTML = `<span class="dot" style="background:${TYPE_COLOR[a]}"></span>${TYPE_LABEL[a]}`;
      block.appendChild(el);
    });

    frag.appendChild(block);
  });

  panelEl.appendChild(frag);
}

export function renderDefenseTable(tableEl, TYPE_LABEL, agg){
  const thead = `<thead><tr>
    <th class="sticky-col">공격 타입</th>
    <th>4×</th><th>2×</th><th>1×</th><th>0.5×</th><th>0.25×</th><th>0×</th>
  </tr></thead>`;

  const rows = [];
  for (const [atk, c] of Object.entries(agg)){
    const emph = (c.m4 > 0 || c.m2 > 0) ? ' style="font-weight:700"' : '';
    rows.push(`<tr${emph}>
      <td class="sticky-col"><b>${TYPE_LABEL[atk]}</b></td>
      <td><span class="eff eff-400">${c.m4}</span></td>
      <td><span class="eff eff-200">${c.m2}</span></td>
      <td><span class="eff eff-100">${c.m1}</span></td>
      <td><span class="eff eff-50">${c.m05}</span></td>
      <td><span class="eff eff-25">${c.m025}</span></td>
      <td><span class="eff eff-0">${c.m0}</span></td>
    </tr>`);
  }

  tableEl.innerHTML = thead + `<tbody>${rows.join('')}</tbody>`;
}

/*
export function renderDefenseSummary(fourX, twoX, immune, TYPE_LABEL, TYPE_COLOR, fourEl, twoEl, immEl, listEl){
  fourEl.textContent = `${fourX.length} 타입`;
  twoEl.textContent  = `${twoX.length} 타입`;
  immEl.textContent  = `${immune.length} 타입`;
  listEl.innerHTML = '';

  const items = [
    ...fourX.map(k => ({ label: `${TYPE_LABEL[k]} (4×)`, color: TYPE_COLOR[k] })),
    ...twoX.map(k => ({ label: `${TYPE_LABEL[k]} (2×)`, color: TYPE_COLOR[k] })),
  ];
  items.forEach(({ label, color }) => {
    const el = document.createElement('span');
    el.className = 'pill';
    el.innerHTML = `<span class="dot" style="background:${color}"></span>${label}`;
    listEl.appendChild(el);
  });
}
*/

/*
export function renderRemaining(typeCounterEl, remainingEl, team, TYPES, TYPE_LABEL, TYPE_COLOR){
  const have = new Set();
  for (const { t1, t2 } of team){
    if (t1) have.add(t1);
    if (t2) have.add(t2);
  }

  remainingEl.innerHTML = '';

  const frag = document.createDocumentFragment();
  TYPES.map(([k]) => k)
    .filter(k => !have.has(k))
    .forEach(k => {
      const el = document.createElement('span');
      el.className = 'pill';
      el.innerHTML = `<span class="dot" style="background:${TYPE_COLOR[k]}"></span>${TYPE_LABEL[k]}`;
      frag.appendChild(el);
    });
  remainingEl.appendChild(frag);

  // 고유 타입 최대치는 6슬롯 × 2타입 = 12 기준
  const MAX_UNIQUE = 12;
  typeCounterEl.textContent = `고유 속성: ${have.size}/${MAX_UNIQUE}`;
}
*/