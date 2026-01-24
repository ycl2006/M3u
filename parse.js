const fs = require('fs');
const path = require('path');

// 可配置参数（方便以后调整）
const INPUT_FILE = 'raw_interface.txt';
const M3U_OUTPUT = 'cleaned_interface.m3u';
const API_OUTPUT = 'api.txt';

// 读取上游文件
let text;
try {
  text = fs.readFileSync(INPUT_FILE, 'utf-8');
} catch (err) {
  console.error(`Error: Cannot read ${INPUT_FILE} - ${err.message}`);
  process.exit(1);
}

const lines = text.split(/\r?\n/);

const m3u = ['#EXTM3U'];
const apiTxt = [];

let currentName = '';
let entryCount = 0;
let skipped = 0;

for (let line of lines) {
  line = line.trim();
  if (!line) continue;

  // 频道信息行
  if (line.startsWith('#EXTINF')) {
    const commaIndex = line.lastIndexOf(',');
    currentName = commaIndex !== -1 ? line.slice(commaIndex + 1).trim() : '';
    // 可选：清理频道名中的非法字符或多余空格
    // currentName = currentName.replace(/[<>:"\/\\|?*]/g, '_');
    continue;
  }

  // 播放地址行（http/https 开头）
  if ((line.startsWith('http://') || line.startsWith('https://')) && currentName) {
    // M3U 格式（标准简单写法）
    m3u.push(`#EXTINF:-1,${currentName}`);
    m3u.push(line);

    // API 格式（频道名,URL）
    apiTxt.push(`${currentName},${line}`);

    entryCount++;
    currentName = ''; // 重置，避免跨行错误
  } else if (line.startsWith('http') && !currentName) {
    // 记录孤立 URL（没有匹配到频道名）
    skipped++;
    console.warn(`[WARN] Skipped orphan URL: ${line}`);
  }
}

// 写入文件
try {
  fs.writeFileSync(M3U_OUTPUT, m3u.join('\n') + '\n', 'utf-8');
  fs.writeFileSync(API_OUTPUT, apiTxt.join('\n') + '\n', 'utf-8');

  console.log(`Success! Generated ${entryCount} entries`);
  console.log(`  → ${M3U_OUTPUT} (${m3u.length - 1} lines)`);
  console.log(`  → ${API_OUTPUT} (${apiTxt.length} lines)`);
  if (skipped > 0) {
    console.warn(`Skipped ${skipped} orphan URLs (no matching #EXTINF)`);
  }
} catch (err) {
  console.error(`Error writing output files: ${err.message}`);
  process.exit(1);
}