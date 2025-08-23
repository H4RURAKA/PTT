// 타입 정의 및 컬러 (한국어만 표기)
export const TYPES = [
  ["normal","노말", "#A8A77A"], ["fire","불꽃", "#EE8130"], ["water","물", "#6390F0"], ["electric","전기", "#F7D02C"],
  ["grass","풀", "#7AC74C"], ["ice","얼음", "#96D9D6"], ["fighting","격투", "#C22E28"], ["poison","독", "#A33EA1"],
  ["ground","땅", "#E2BF65"], ["flying","비행", "#A98FF3"], ["psychic","에스퍼", "#F95587"], ["bug","벌레", "#A6B91A"],
  ["rock","바위", "#B6A136"], ["ghost","고스트", "#735797"], ["dragon","드래곤", "#6F35FC"], ["dark","악", "#705746"],
  ["steel","강철", "#B7B7CE"], ["fairy","페어리", "#D685AD"],
];
export const TYPE_KEYS  = TYPES.map(t=>t[0]);
export const TYPE_LABEL = Object.fromEntries(TYPES.map(([k,ko])=>[k,ko]));
export const TYPE_COLOR = Object.fromEntries(TYPES.map(([k,_,c])=>[k,c]));

// 상성표 (공격→방어)
const E = 1, SE = 2, NV = 0.5, NO = 0;
export const ATK = {
  normal:  { rock: NV, ghost: NO, steel: NV },
  fire:    { grass: SE, ice: SE, bug: SE, steel: SE, fire: NV, water: NV, rock: NV, dragon: NV },
  water:   { fire: SE, ground: SE, rock: SE, water: NV, grass: NV, dragon: NV },
  electric:{ water: SE, flying: SE, electric: NV, grass: NV, dragon: NV, ground: NO },
  grass:   { water: SE, ground: SE, rock: SE, fire: NV, grass: NV, poison: NV, flying: NV, bug: NV, dragon: NV, steel: NV },
  ice:     { grass: SE, ground: SE, flying: SE, dragon: SE, fire: NV, water: NV, ice: NV, steel: NV },
  fighting:{ normal: SE, ice: SE, rock: SE, dark: SE, steel: SE, poison: NV, flying: NV, psychic: NV, bug: NV, fairy: NV, ghost: NO },
  poison:  { grass: SE, fairy: SE, poison: NV, ground: NV, rock: NV, ghost: NV, steel: NO },
  ground:  { fire: SE, electric: SE, poison: SE, rock: SE, steel: SE, grass: NV, bug: NV, flying: NO },
  flying:  { grass: SE, fighting: SE, bug: SE, electric: NV, rock: NV, steel: NV },
  psychic: { fighting: SE, poison: SE, psychic: NV, steel: NV, dark: NO },
  bug:     { grass: SE, psychic: SE, dark: SE, fire: NV, fighting: NV, poison: NV, flying: NV, ghost: NV, steel: NV, fairy: NV },
  rock:    { fire: SE, ice: SE, flying: SE, bug: SE, fighting: NV, ground: NV, steel: NV },
  ghost:   { psychic: SE, ghost: SE, dark: NV, normal: NO },
  dragon:  { dragon: SE, steel: NV, fairy: NO },
  dark:    { psychic: SE, ghost: SE, fighting: NV, dark: NV, fairy: NV },
  steel:   { ice: SE, rock: SE, fairy: SE, fire: NV, water: NV, electric: NV, steel: NV },
  fairy:   { fighting: SE, dragon: SE, dark: SE, fire: NV, poison: NV, steel: NV },
};
