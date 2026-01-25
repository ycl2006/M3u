const fs = require('fs');
const https = require('https');
const http = require('http');
const { URL } = require('url');

/* ================= 配置 ================= */
const CONF = 'upstream.conf';
const OUT_TXT = 'result.txt';
const OUT_M3U = 'result.m3u';

/* ================= 频道归一化 + 高清 ================= */
const channelRules = JSON.parse(fs.readFileSync('./channel_rules.json', 'utf8'));

function normalizeChannelName(name) {
  name = name.trim();
  for (const standard of Object.keys(channelRules)) {
    for (const pattern of channelRules[standard]) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(name)) return standard;
      } catch (e) {
        if (pattern.toLowerCase() === name.toLowerCase()) return standard;
      }
    }
  }
  return name;
}

function isHD(name, url) {
  const combined = (name + url).toUpperCase();
  return combined.includes('HD') || combined.includes('1080') || combined.includes('720');
}

/* ================= 工具 ================= */
function fetch(url) {
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

function beijingTime() {
  return new Date(Date.now() + 8 * 3600 * 1000)
    .toISOString()
    .replace('T', ' ')
    .replace(/\..+/, '');
}

function guessGroup(name) {
  if (/^CCTV/.test(name)) return 'CCTV';
  if (/卫视/.test(name)) return '卫视';
  return '地方台';
}

/* ================= 主流程 ================= */
(async () => {
  if (!fs.existsSync(CONF)) {
    console.error('upstream.conf not found');
    process.exit(1);
  }

  const lines = fs
    .readFileSync(CONF, 'utf-8')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));

  let mainUrl = null;
  const extUrls = [];

  for (const l of lines) {
    const [type, url] = l.split(/\s+/, 2);
    if (type === 'MAIN') mainUrl = url;
    else if (type === 'EXT') extUrls.push(url);
  }

  if (!mainUrl) {
    console.error('No MAIN source defined');
    process.exit(1);
  }

  console.log('MAIN:', mainUrl);
  console.log('EXT :', extUrls.length);

  const data = {};

  /* ========= 1. 解析主源 TXT ========= */
  console.log('Fetching MAIN source...');
  const mainText = await fetch(mainUrl);
  let currentGroup = null;

  for (const line of mainText.split(/\r?\n/)) {
    if (!line.trim()) continue;

    if (line.endsWith(',#genre#')) {
      currentGroup = line.replace(',#genre#', '');
      if (!data[currentGroup]) {
        data[currentGroup] = { order: [], channels: {} };
      }
      continue;
    }

    if (!currentGroup) continue;

    const idx = line.indexOf(',');
    if (idx === -1) continue;

    let name = line.slice(0, idx).trim();
    const url = line.slice(idx + 1).trim();

    name = normalizeChannelName(name); // 归一化

    if (!data[currentGroup].channels[name]) {
      data[currentGroup].channels[name] = [];
      data[currentGroup].order.push(name);
    }
    data[currentGroup].channels[name].push({ url, hd: isHD(name, url) });
  }

  /* ========= 2. 解析补充源 M3U ========= */
  for (const url of extUrls) {
    console.log('Fetching EXT:', url);
    let text;
    try {
      text = await fetch(url);
    } catch (e) {
      console.warn('  ✖ failed:', e.message);
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
        (line.startsWith('http://') || line.startsWith('https://')) &&
        currentName
      ) {
        const normalizedName = normalizeChannelName(currentName);
        const group = guessGroup(normalizedName);
        if (!data[group]) {
          data[group] = { order: [], channels: {} };
        }
        if (!data[group].channels[normalizedName]) {
          data[group].channels[normalizedName] = [];
          data[group].order.push(normalizedName);
        }
        data[group].channels[normalizedName].push({ url: line, hd: isHD(currentName, line) });
        currentName = '';
      }
    }
  }

  /* ========= 3. 输出 TXT ========= */
  const txt = [];
  txt.push(`# Generated at ${beijingTime()} (Asia/Shanghai)`);
  txt.push('');

  for (const group of Object.keys(data)) {
    txt.push(`${group},#genre#`);
    for (const name of data[group].order) {
      for (const item of data[group].channels[name]) {
        txt.push(`${name},${item.url}`);
      }
    }
    txt.push('');
  }

  /* ========= 4. 输出 M3U（高清优先） ========= */
  const m3u = [];
  m3u.push('#EXTM3U');
  m3u.push(`# Generated at ${beijingTime()} (Asia/Shanghai)`);
  m3u.push('');

  for (const group of Object.keys(data)) {
    for (const name of data[group].order) {
      const urls = data[group].channels[name];
      const urlsSorted = urls.sort((a, b) => (b.hd === true) - (a.hd === true));

      for (const item of urlsSorted) {
        m3u.push(`#EXTINF:-1 group-title="${group}",${name}`);
        m3u.push(item.url);
        m3u.push('');
      }
    }
  }

  fs.writeFileSync(OUT_TXT, txt.join('\n'), 'utf-8');
  fs.writeFileSync(OUT_M3U, m3u.join('\n'), 'utf-8');

  console.log('✔ Done');
  console.log('→', OUT_TXT);
  console.log('→', OUT_M3U);
})();