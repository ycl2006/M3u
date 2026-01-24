const fs = require('fs');

// 读取上游原始文件（完全不改内容，只解析结构）
const text = fs.readFileSync('raw_interface.txt', 'utf-8');
const lines = text.split(/\r?\n/);

// 频道名 -> 最新原始URL（不动）
const channelMap = {};

let currentName = '';

for (let line of lines) {
  line = line.trim();
  if (!line) continue;

  // 读取频道名
  if (line.startsWith('#EXTINF')) {
    const idx = line.lastIndexOf(',');
    currentName = idx !== -1 ? line.slice(idx + 1).trim() : '';
    continue;
  }

  // 读取播放地址（原样保留，不检测、不解析）
  if (line.startsWith('http') && currentName) {
    channelMap[currentName] = line; // 后面的覆盖前面的
    currentName = '';
  }
}

// 输出 M3U（保持标准）
const m3u = ['#EXTM3U'];

// 输出 API（频道,原始URL）
const apiTxt = [];

for (const [name, url] of Object.entries(channelMap)) {
  m3u.push(`#EXTINF:-1,${name}`);
  m3u.push(url);
  apiTxt.push(`${name},${url}`);
}

// 写文件
fs.writeFileSync('cleaned_interface.m3u', m3u.join('\n') + '\n', 'utf-8');
fs.writeFileSync('api.txt', apiTxt.join('\n') + '\n', 'utf-8');

console.log(`Generated ${apiTxt.length} channels (upstream preserved)`);