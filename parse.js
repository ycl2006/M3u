const fs = require('fs');

const INPUT = 'upstream_merged.txt';
const OUT_M3U = 'result.m3u';
const OUT_TXT = 'result.txt';

/* ===== 北京时间 ===== */
function beijingTime() {
  return new Date(Date.now() + 8 * 3600 * 1000)
    .toISOString()
    .replace('T', ' ')
    .replace(/\..+/, '');
}

/* ===== 分组规则 ===== */
function getGroup(name) {
  if (/^CCTV/.test(name)) return 'CCTV';
  if (/卫视/.test(name)) return '卫视';
  return '地方台';
}

/* ===== 读取输入 ===== */
if (!fs.existsSync(INPUT)) {
  console.error(`Input file not found: ${INPUT}`);
  process.exit(1);
}

const lines = fs.readFileSync(INPUT, 'utf-8').split(/\r?\n/);

/*
  数据结构：
  {
    CCTV: {
      'CCTV1 综合': [url1, url2]
    },
    卫视: {},
    地方台: {}
  }
*/
const groups = {
  CCTV: {},
  卫视: {},
  地方台: {},
};

let currentName = '';

for (let line of lines) {
  line = line.trim();
  if (!line) continue;

  if (line.startsWith('#EXTINF')) {
    const idx = line.lastIndexOf(',');
    currentName = idx !== -1 ? line.slice(idx + 1).trim() : '';
    continue;
  }

  if ((line.startsWith('http://') || line.startsWith('https://')) && currentName) {
    const group = getGroup(currentName);
    if (!groups[group][currentName]) {
      groups[group][currentName] = new Set();
    }
    groups[group][currentName].add(line);
  }
}

/* ===== 生成 M3U ===== */
const m3u = [];
m3u.push('#EXTM3U');
m3u.push(`# Generated at ${beijingTime()} (Asia/Shanghai)`);
m3u.push('');

for (const group of ['CCTV', '卫视', '地方台']) {
  for (const [name, urls] of Object.entries(groups[group])) {
    m3u.push(`#EXTINF:-1 group-title="${group}",${name}`);
    for (const url of urls) {
      m3u.push(url);
    }
    m3u.push('');
  }
}

/* ===== 生成 Guovin 同款 TXT ===== */
const txt = [];
txt.push(`# Generated at ${beijingTime()} (Asia/Shanghai)`);
txt.push('');

for (const group of ['CCTV', '卫视', '地方台']) {
  txt.push(`${group},#genre#`);
  for (const [name, urls] of Object.entries(groups[group])) {
    for (const url of urls) {
      txt.push(`${name},${url}`);
    }
  }
  txt.push('');
}

/* ===== 写文件 ===== */
fs.writeFileSync(OUT_M3U, m3u.join('\n'), 'utf-8');
fs.writeFileSync(OUT_TXT, txt.join('\n'), 'utf-8');

console.log('✔ Generate success');
console.log(`→ ${OUT_M3U}`);
console.log(`→ ${OUT_TXT}`);