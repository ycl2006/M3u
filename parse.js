const fs = require('fs');

// ================= 配置 =================
const INPUT_FILE = process.argv[2] || 'upstream_merged.txt';
const OUTPUT_M3U = 'result.m3u';
const OUTPUT_TXT = 'result.txt';

// ================= 工具函数 =================
function beijingTime() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return d.toISOString().replace('T', ' ').replace('Z', ' CST');
}

function getGroup(name) {
  if (/^CCTV\d+|CCTV-?\d+|CCTV/.test(name)) return 'CCTV';
  if (/卫视/.test(name)) return '卫视';
  return '地方台';
}

// ================= 读取文件 =================
if (!fs.existsSync(INPUT_FILE)) {
  console.error(`Input file not found: ${INPUT_FILE}`);
  process.exit(1);
}

const lines = fs.readFileSync(INPUT_FILE, 'utf-8').split(/\r?\n/);

// ================= 解析 =================
const groups = {
  CCTV: [],
  卫视: [],
  地方台: []
};

const seen = new Set();

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
    const key = currentName + '|' + line;
    if (seen.has(key)) {
      currentName = '';
      continue;
    }
    seen.add(key);

    const group = getGroup(currentName);
    groups[group].push({
      name: currentName,
      url: line
    });

    currentName = '';
  }
}

// ================= 输出 M3U =================
const m3u = [];
m3u.push('#EXTM3U');
m3u.push(`# Generated at ${beijingTime()}`);
m3u.push('');

for (const group of ['CCTV', '卫视', '地方台']) {
  for (const item of groups[group]) {
    m3u.push(`#EXTINF:-1 group-title="${group}",${item.name}`);
    m3u.push(item.url);
  }
}

// ================= 输出 TXT（Guovin 风格） =================
const txt = [];
txt.push(`# Generated at ${beijingTime()}`);
txt.push('');

for (const group of ['CCTV', '卫视', '地方台']) {
  for (const item of groups[group]) {
    txt.push(`${item.name},${item.url}`);
  }
}

// ================= 写文件 =================
fs.writeFileSync(OUTPUT_M3U, m3u.join('\n') + '\n', 'utf-8');
fs.writeFileSync(OUTPUT_TXT, txt.join('\n') + '\n', 'utf-8');

console.log('✔ Generated files:');
console.log(`  - ${OUTPUT_M3U}`);
console.log(`  - ${OUTPUT_TXT}`);
console.log(
  `  CCTV: ${groups.CCTV.length}, 卫视: ${groups.卫视.length}, 地方台: ${groups.地方台.length}`
);