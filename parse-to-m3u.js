const fs = require('fs');

// 读取远程下载的源
const text = fs.readFileSync('raw_interface.txt', 'utf-8');
const lines = text.split(/\r?\n/);

let m3u = ['#EXTM3U'];
let apiTxt = [];

let currentName = '';

for (let line of lines) {
  line = line.trim();
  if (!line) continue;

  // 频道信息
  if (line.startsWith('#EXTINF')) {
    const parts = line.split(',');
    currentName = parts.length > 1 ? parts.pop().trim() : '';
  }

  // 播放地址
  else if (line.startsWith('http')) {
    // M3U
    m3u.push(`#EXTINF:-1,${currentName}`);
    m3u.push(line);

    // API（纯地址）
    apiTxt.push(line);

    currentName = '';
  }
}

// 写文件
fs.writeFileSync('cleaned_interface.m3u', m3u.join('\n') + '\n', 'utf-8');
fs.writeFileSync('api.txt', apiTxt.join('\n') + '\n', 'utf-8');

console.log('cleaned_interface.m3u & api.txt generated');