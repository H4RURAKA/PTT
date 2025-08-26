// tools/format-pokedex.mjs
// 사용법:
//  node tools/format-pokedex.mjs [입력경로] [출력경로]
//  예) node tools/format-pokedex.mjs data/pokemon.min.json data/pokemon.json
//  --in-place 옵션을 주면 입력 파일 자체를 예쁘게 덮어씁니다.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const inPath  = args[0] || 'data/pokemon.min.json';
const inPlace = args.includes('--in-place');
const outPath = inPlace
  ? inPath
  : (args[1] || inPath.replace(/\.min\.json$/i, '.json'));

try {
  const raw = await readFile(inPath, 'utf8');
  const data = JSON.parse(raw);

  if (!Array.isArray(data)) {
    throw new Error('JSON 최상위가 배열이 아닙니다.');
  }

  // i 순 정렬 + 키 순서(i,n,t,b,tags) 통일
  const norm = data
    .slice()
    .sort((a, b) => (a.i ?? 0) - (b.i ?? 0))
    .map(p => ({
      i:    p.i,
      n:    p.n,
      t:    p.t,
      b:    p.b,
      tags: Array.isArray(p.tags) ? p.tags : []
    }));

  const pretty = JSON.stringify(norm, null, 2) + '\n';
  await writeFile(outPath, pretty, 'utf8');

  console.log(`✔ 포맷 완료: ${outPath} (${norm.length}종)`);
  if (!inPlace && /\.min\.json$/i.test(inPath)) {
    console.log('ℹ 원본(minified)은 그대로 두고, 예쁜 JSON을 별도 파일로 생성했습니다.');
  }
} catch (e) {
  console.error('❌ 실패:', e.message);
  process.exit(1);
}
