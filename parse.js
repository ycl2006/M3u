const fs = require('fs');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// ================= 配置 =================
const CONF_FILE = 'upstream.conf';
const RAW_OUTPUT = 'raw_interface.txt';
const M3U_OUTPUT = 'cleaned_interface.m3u';
const API_OUTPUT = 'api.txt';

// ================= 工具函数 =================
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;

    const req = lib.get(url, { timeout: 15000 }, res => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', c => (data += c));
      res.on('end', () => resolve(data));
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

// 北京时间
function beijingTime() {
  return new Date(Date.now() + 8 * 3600 * 1000)
    .toISOString()
    .replace('T', ' ')
    .replace('Z', ' +08:00');
}

// ================= 主逻辑 =================
(async () => {
  if (!fs.existsSync(CONF_FILE)) {
    console.error('upstream.conf not found');
    process.exit(1);
  }

  const upstreams = fs
    .readFileSync(CONF_FILE, 'utf-8')
    .split(/\r?\n/)
    .map(l => l.replace(/#.*/, '').trim())
    .filter(Boolean);

  if (upstreams.length === 0) {
    console.error('No upstream URLs');
    process.exit(1);
  }

  console.log(`Loaded ${upstreams.length} upstreams`);

  // channelName => { urls:Set, sources:Set }
  const channels = new Map();

  for (const upstream of upstreams) {
    console.log(`Fetching: ${upstream}`);
    let text;
    try {
      text = await fetchUrl(upstream);
    } catch (e) {
      console.warn(`  ✖ failed: ${e.message}`);
      continue;
    }

    let currentName = '';
    for (let line of text.split(/\r?\n/)) {
      line = line.trim();
      if (!line) continue;

      if (line.startsWith('#EXTINF')) {
        const idx = line.lastIndexOf(',');
        currentName = idx !== -1 ? line.slice(idx + 1).trim() : '';
        continue;
      }

      if (
        currentName &&
        (line.startsWith('http://') || line.startsWith('https://'))
      ) {
        if (!channels.has(currentName)) {
          channels.set(currentName, {
            urls: new Set(),
            sources: new Set()
          });
        }
        const ch = channels.get(currentName);
        ch.urls.add(line);
        ch.sources.add(upstream);
        currentName = '';
      }
    }
  }

  if (channels.size === 0) {
    console.error('No valid channels parsed');
    process.exit(1);
  }

  // ================= 排序（中文友好） =================
  const sortedNames = Array.from(channels.keys()).sort((a, b) =>
    a.localeCompare(b, 'zh-CN')
  );

  // ================= 输出 =================
  const header = [
    '#EXTM3U',
    `# Generated at ${beijingTime()}`,
    `# Channels: ${sortedNames.length}`,
    ''
  ];

  const m3u = [...header];
  const apiTxt = [];

  for (const name of sortedNames) {
    const { urls, sources } = channels.get(name);

    // 来源注释（不影响播放器）
    m3u.push(`# ---- ${name} | sources: ${Array.from(sources).length} ----`);

    for (const url of urls) {
      m3u.push(`#EXTINF:-1,${name}`);
      m3u.push(url);
      apiTxt.push(`${name},${url}`);
    }
  }

  // ================= 写文件 =================
  fs.writeFileSync(RAW_OUTPUT, m3u.slice(1).join('\n') + '\n', 'utf-8');
  fs.writeFileSync(M3U_OUTPUT, m3u.join('\n') + '\n', 'utf-8');
  fs.writeFileSync(API_OUTPUT, apiTxt.join('\n') + '\n', 'utf-8');

  console.log('\nSuccess!');
  console.log(`Channels: ${sortedNames.length}`);
  console.log(`Total URLs: ${apiTxt.length}`);
  console.log(`→ ${M3U_OUTPUT}`);
  console.log(`→ ${API_OUTPUT}`);
})();