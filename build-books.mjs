// 下载 KyleBing/english-vocabulary 词表 -> 生成 js/data/*.js 数据文件
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'js', 'data');

const BOOKS = [
  { id: 'chuzhong', name: '初中词汇', file: '1 初中-乱序.txt' },
  { id: 'gaokao',   name: '高考词汇', file: '2 高中-乱序.txt' },
  { id: 'cet4',     name: '四级词汇', file: '3 四级-乱序.txt' },
  { id: 'cet6',     name: '六级词汇', file: '4 六级-乱序.txt' },
  { id: 'kaoyan',   name: '考研英语', file: '5 考研-乱序.txt' },
  { id: 'toefl',    name: '托福词汇', file: '6 托福-乱序.txt' },
  { id: 'sat',      name: 'SAT 核心', file: '7 SAT-乱序.txt' },
];

const BASE = 'https://raw.githubusercontent.com/KyleBing/english-vocabulary/master/';

async function download(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'dsh' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

mkdirSync(OUT_DIR, { recursive: true });

for (const b of BOOKS) {
  const url = BASE + encodeURI(b.file);
  const text = await download(url);
  const lines = text.split(/\r?\n/);
  const words = [];

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    // 第一个 tab（或连续空白）作为分隔
    const m = t.match(/^([^\t]+)\t+(.+)$/);
    let word, meaning;
    if (m) {
      word = m[1].trim();
      meaning = m[2].trim();
    } else {
      const sp = t.match(/^(\S+)\s+(.+)$/);
      if (!sp) continue;
      word = sp[1].trim();
      meaning = sp[2].trim();
    }
    if (!word || !meaning) continue;
    words.push([word, meaning]);
  }

  // 生成紧凑 JS：window.WORD_DATA.<id> = [[word, meaning], ...]
  const tuples = words.map(w => '[' + JSON.stringify(w[0]) + ',' + JSON.stringify(w[1]) + ']');
  const out = `window.WORD_DATA=window.WORD_DATA||{};window.WORD_DATA.${b.id}=[${tuples.join(',')}];\n`;
  const outPath = join(OUT_DIR, b.id + '.js');
  writeFileSync(outPath, out, 'utf8');

  console.log(`${b.id} (${b.name}): ${words.length} 词 -> ${(out.length / 1024).toFixed(1)} KB`);
}

console.log('DONE');
