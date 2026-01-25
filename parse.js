const fs = require('fs');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// ===== 配置 =====
const CONF_FILE = 'upstream.conf';
const M3U_OUTPUT = 'cleaned_interface.m3u';
const API_OUTPUT = 'api.txt';

// ===== 北京时间工具函数 =====
function getBeijingTime() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const bj = new Date(utc + 8 * 3600000);

  const pad = n => String(n).padStart(2, '0');

  return (
    bj.getFullYear() +
    '-' +
    pad(bj.getMonth() + 1) +
    '-' +
    pad(bj.getDate()) +
    ' ' +
    pad(bj.getHours()) +
    ':' +
    pad(bj.getMinutes()) +
    ':' +
    pad(bj.getSeconds())
  );
}

// ===== 下载函数 =====
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;

    const req = lib.get(
      url,
      { timeout: 15000 },
      res => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          res.resume();
          return;
        }

        let data = '';
        res.setEncoding('utf8');
        res.on('data', chunk => (data += chunk));
        res.on('end', () => resolve(data));
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

// ===== 主逻辑 =====
(async () => {
  if (!fs.existsSync(CONF_FILE)) {
    console.error(`Error: ${CONF_FILE} not found`);
    process.exit(1);
  }

  const upstreams = fs
    .readFileSync(CONF_FILE, 'utf-8')
    .split('\n')
    .map(l => l.replace(/#.*/, '').trim())
    .filter(Boolean);

  if (upstreams.length === 0) {
    console.error('No upstream URLs');
    process.exit(1);
  }

  console.log(`Loaded ${upstreams.length} upstream URLs`);

  // ===== 时间戳 =====
  const timestamp = getBeijingTime();

  // 用于去重：channelName + url
  const seen = new Set();

  const m3u = [
    '#EXTM3U',
    `# Generated at ${timestamp} (Beijing Time)`
  ];

  const apiTxt = [
    `# Generated at ${timestamp} (Beijing Time)`
  ];

  let entryCount = 0;
  let skipped = 0;

  for (const upstream of upstreams) {
    console.log(`Fetching: ${upstream}`);

    let text;
    try {
      text = await fetchUrl(upstream);
    } catch (e) {
      console.warn(`  ✖ failed: ${e.message}`);
      continue;
    }

    const lines = text.split(/\r?\n/);
    let currentName = '';

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      if (line.startsWith('#EXTINF')) {
        const commaIndex = line.lastIndexOf(',');
        currentName =
          commaIndex !== -1 ? line.slice(commaIndex + 1).trim() : '';
        continue;
      }

      if (
        (line.startsWith('http://') || line.startsWith('https://')) &&
        currentName
      ) {
        const key = `${currentName}|${line}`;
        if (seen.has(key)) continue;
        seen.add(key);

        m3u.push(`#EXTINF:-1,${currentName}`);
        m3u.push(line);
        apiTxt.push(`${currentName},${line}`);

        entryCount++;
        currentName = '';
      } else if (line.startsWith('http') && !currentName) {
        skipped++;
      }
    }
  }

  if (entryCount === 0) {
    console.error('No valid entries generated');
    process.exit(1);
  }

  fs.writeFileSync(M3U_OUTPUT, m3u.join('\n') + '\n', 'utf-8');
  fs.writeFileSync(API_OUTPUT, apiTxt.join('\n') + '\n', 'utf-8');

  console.log(`\nSuccess!`);
  console.log(`  Entries: ${entryCount}`);
  console.log(`  Unique pairs: ${seen.size}`);
  console.log(`  Generated at: ${timestamp} (Beijing Time)`);
  console.log(`  → ${M3U_OUTPUT}`);
  console.log(`  → ${API_OUTPUT}`);
  if (skipped > 0) {
    console.warn(`  Skipped orphan URLs: ${skipped}`);
  }
})();