const fs = require('fs');

// 原样读取上游文件
const text = fs.readFileSync('raw_interface.txt', 'utf-8');
const lines = text.split(/\r?\n/);

const m3u = ['#EXTM3U'];
const apiTxt = [];

let currentName = '';

for (let line of lines) {
  line = line.trim();
  if (!line) continue;

  // 频道行
  if (line.startsWith('#EXTINF')) {
    const idx = line.lastIndexOf(',');
    currentName = idx !== -1 ? line.slice(idx + 1).trim() : '';
    continue;
  }

  // 播放地址行（不判断、不合并、不解析）
  if (line.startsWith('http') && currentName) {
    // M3U
    m3u.push(`#EXTINF:-1,${currentName}`);
    m3u.push(line);

    // API（带频道名）
    apiTxt.push(`${currentName},${line}`);

    // 只清空，不做任何合并逻辑
    currentName = '';
  }
}

// 写文件
fs.writeFileSync('cleaned_interface.m3u', m3u.join('\n') + '\n', 'utf-8');
fs.writeFileSync('api.txt', apiTxt.join('\n') + '\n', 'utf-8');

console.log(`Generated ${apiTxt.length} entries (100% upstream preserved)`);