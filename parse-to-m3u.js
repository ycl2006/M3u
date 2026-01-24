const fs = require('fs');

// 读取下载的远程 M3U
const lines = fs.readFileSync('raw_interface.txt', 'utf-8').split(/\r?\n/);

let output = ['#EXTM3U'];
let currentInfo = null;

for (let line of lines) {
  line = line.trim();
  if (!line) continue;

  if (line.startsWith('#EXTINF')) {
    // 保存当前频道信息
    currentInfo = line;
  } else if (line.startsWith('http')) {
    if (currentInfo) {
      // 输出 EXTINF + URL
      output.push(currentInfo);
      output.push(line);
      currentInfo = null;
    }
  }
}

// 写出整理后的 M3U
fs.writeFileSync('cleaned_interface.m3u', output.join('\n') + '\n', 'utf-8');
console.log('✅ cleaned_interface.m3u generated');