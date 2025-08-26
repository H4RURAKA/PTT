// 팀 상태와 슬롯 토글/초기화(순수 로직)

/** 6슬롯(최대 2타입) 팀 초기 상태 생성 */
export function createInitialTeam() {
  return Array.from({ length: 6 }, () => ({ t1: '', t2: '', name: '' }));
}

/** 팀 내에 현재 존재하는 고유 타입 집합 */
export function presentTypesSet(team) {
  const s = new Set();
  for (const { t1, t2 } of team) {
    if (t1) s.add(t1);
    if (t2) s.add(t2);
  }
  return s;
}

/**
 * 슬롯 i에서 타입 key 토글
 * - 이미 들어있으면 제거
 * - 비어 있으면 추가(슬롯당 최대 2타입, 팀 전체 고유 타입 최대 maxUnique)
 * - 모든 갱신은 team 배열을 직접 수정
 */
export function toggleSlotType(team, i, key, maxUnique = 12) {
  // 방어적 검사
  if (!Array.isArray(team)) return { changed: false, reason: '팀 데이터가 올바르지 않습니다.' };
  if (i < 0 || i >= team.length) return { changed: false, reason: '잘못된 슬롯 인덱스입니다.' };

  const cur = team[i];
  const k = String(key ?? '').trim();
  if (!k) return { changed: false };

  // 이미 선택된 타입이면 해제
  if (cur.t1 === k) { cur.t1 = ''; return { changed: true }; }
  if (cur.t2 === k) { cur.t2 = ''; return { changed: true }; }

  // 슬롯 용량 체크(최대 2타입)
  const selectedCount = (cur.t1 ? 1 : 0) + (cur.t2 ? 1 : 0);
  if (selectedCount >= 2) {
    return { changed: false, reason: '각 슬롯은 최대 2속성까지 선택할 수 있습니다.' };
  }

  // 팀 전체 고유 타입 한도(기존에 없던 타입 추가 시에만 검사)
  const have = presentTypesSet(team);
  if (!have.has(k) && have.size >= maxUnique) {
    return { changed: false, reason: '고유 속성은 최대 12개까지 선택할 수 있습니다.' };
  }

  // 빈 칸에 추가(항상 t1 우선)
  if (!cur.t1) cur.t1 = k;
  else cur.t2 = k;

  return { changed: true };
}

/** 슬롯 i의 타입만 초기화(이름은 유지) */
export function clearSlot(team, i) {
  if (!Array.isArray(team) || i < 0 || i >= team.length) return;
  team[i] = { t1: '', t2: '', name: team[i].name };
}
