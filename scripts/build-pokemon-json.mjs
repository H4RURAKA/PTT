// tools/build-pokedex.mjs
// PokeAPI에서 한글 이름/타입/종족값/스프라이트를 수집해 data/pokemon.min.json 생성
// 실행: node tools/build-pokedex.mjs [maxDex]
// 예:  node tools/build-pokedex.mjs 1025

import { writeFile } from 'node:fs/promises';

const MAX = Number(process.argv[2] || 1025); // 필요시 조정
const API = 'https://pokeapi.co/api/v2';

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
const limit = (n=16)=> {
  const q=[]; let a=0;
  return async fn=>{
    if (a>=n) await new Promise(res=>q.push(res));
    a++;
    try{ return await fn(); }
    finally{ a--; const r=q.shift(); if (r) r(); }
  };
};
const gate = limit(12);

// 태그 규칙(사이트와 동일)
function autoTagsFromStats(b){
  const [HP,Atk,Def,SpA,SpD,Spe] = b;
  const tags = new Set();
  if (Atk >= SpA + 15 && (Spe >= 95 || Atk >= 110)) tags.add('physical');
  if (SpA >= Atk + 15 && (Spe >= 95 || SpA >= 110)) tags.add('special');
  if ((HP + Def + SpD) >= 380 && Spe <= 80) tags.add('wall');
  if (Spe >= 110) tags.add('speed');
  if (!tags.size) tags.add('balanced');
  return Array.from(tags);
}

async function fetchPokemon(i){
  // pokemon: stats/types/sprites, species: ko-name
  const [pokemon, species] = await Promise.all([
    gate(()=>fetch(`${API}/pokemon/${i}`).then(r=>r.json())),
    gate(()=>fetch(`${API}/pokemon-species/${i}`).then(r=>r.json()))
  ]);

  // 한글명
  let nameKo = (species.names || []).find(n => n.language?.name === 'ko')?.name;
  if (!nameKo) nameKo = species.name; // fallback(en)

  // 타입(영문 키)
  const t = pokemon.types
    .sort((a,b)=>a.slot-b.slot)
    .map(x => x.type.name); // e.g., "grass","dark"

  // 종족값 [HP,ATK,DEF,SPATK,SPDEF,SPD]
  const base = new Map(pokemon.stats.map(s => [s.stat.name, s.base_stat]));
  const b = [
    base.get('hp')||0, base.get('attack')||0, base.get('defense')||0,
    base.get('special-attack')||0, base.get('special-defense')||0,
    base.get('speed')||0
  ];

  // front_default 스프라이트
  const s = pokemon.sprites?.front_default || null;

  return { i, n:nameKo, t, b, s, tags:autoTagsFromStats(b) };
}

async function main(){
  const arr = [];
  for (let i=1;i<=MAX;i++){
    try{
      const p = await fetchPokemon(i);
      arr.push(p);
    }catch(e){
      console.warn(`skip #${i}: ${e?.message||e}`);
      await sleep(250);
    }
  }
  // pretty 저장(파일 끝 개행)
  await writeFile('data/pokemon.min.json', JSON.stringify(arr, null, 2) + '\n', 'utf8');
  console.log(`✔ saved data/pokemon.min.json (${arr.length} entries)`);
}

main().catch(e=>{ console.error(e); process.exit(1); });
