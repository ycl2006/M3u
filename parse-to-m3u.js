const fs = require('fs');

// 读取远程下载的源
const text = fs.readFileSync('raw_interface.txt', 'utf-8');
const lines = text.split(/\r?\n/);

// 用对象保存：频道名 -> 最新地址
const channelMap = {};

let currentName = '';

for (let line of lines) {
  line = line.trim();
  if (!line) continue;

  // 频道信息
  if (line.startsWith('#EXTINF')) {
    const parts = line.split(',');
    currentName = parts.length > 1 ? parts.pop().trim() : '';
  }

  // 播放地址（关键：覆盖）
  else if (line.startsWith('http') && currentName) {
    channelMap[currentName] = line; // ⭐ 同频道覆盖，保留最新
    currentName = '';
  }
}

// ===== 输出文件 =====

// M3U
let m3u = ['#EXTM3U'];

// API（带频道）
let apiTxt = [];

for (const [name, url] of Object.entries(channelMap)) {
  // M3U
  m3u.push(`#EXTINF:-1,${name}`);
  m3u.push(url);

  // API：频道名 + 地址
  apiTxt.push(`${name},${url}`);
}

// 写文件
fs.writeFileSync(
  'cleaned_interface.m3u',
  m3u.join('\n') + '\n',
  'utf-8'
);

fs.writeFileSync(
  'api.txt',
  apiTxt.join('\n') + '\n',
  'utf-8'
);

console.log(
  `Generated ${Object.keys(channelMap).length} channels (latest only)`
);