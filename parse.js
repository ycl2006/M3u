const fs = require('fs');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const path = require('path');

/* ================= 配置 ================= */
const CONF = 'upstream.conf';
const OUT_TXT = 'result.txt';
const OUT_M3U = 'result.m3u';
const BACKUP_DIR = 'backup';
const RULE_FILE = 'channel_rules_full.json';

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

/* ===== 读取频道规则 ===== */
let channelRules = {};
if (fs.existsSync(RULE_FILE)) {
  channelRules = JSON.parse(fs.readFileSync(RULE_FILE, 'utf-8'));
} else {
  console.warn(`⚠ ${RULE_FILE} 不存在，将按默认分组`);
}

/* ===== 根据规则匹配频道 ===== */
function matchChannel(name) {
  for (const [group, patterns] of Object.entries(channelRules)) {
    for (const pattern of patterns) {
      try {
        if (new RegExp(pattern, 'i').test(name)) return group;
      } catch (e) {
        continue;
      }
    }
  }
  // 默认分组
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

  const data = {}; // { group: { order: [], channels: { name: Set(url) } } }

  // ===== 1. 解析主源 TXT =====
  console.log('Fetching MAIN source...');
  const mainText = await fetch(mainUrl);
  let currentGroup = null;

  for (const line of mainText.split(/\r?\n/)) {
    if (!line.trim()) continue;

    if (line.endsWith(',#genre#')) {
      currentGroup = line.replace(',#genre#', '');
      if (!data[currentGroup]) data[currentGroup] = { order: [], channels: {} };
      continue;
    }

    if (!currentGroup) continue;

    const idx = line.indexOf(',');
    if (idx === -1) continue;

    const name = line.slice(0, idx).trim();
    const url = line.slice(idx + 1).trim();
    const group = matchChannel(name);

    if (!data[group]) data[group] = { order: [], channels: {} };
    if (!data[group].channels[name]) {
      data[group].channels[name] = new Set();
      data[group].order.push(name);
    }
    data[group].channels[name].add(url);
  }

  // ===== 2. 解析扩展源 M3U =====
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

      if ((line.startsWith('http://') || line.startsWith('https://')) && currentName) {
        const group = matchChannel(currentName);
        if (!data[group]) data[group] = { order: [], channels: {} };
        if (!data[group].channels[currentName]) {
          data[group].channels[currentName] = new Set();
          data[group].order.push(currentName);
        }
        data[group].channels[currentName].add(line);
        currentName = '';
      }
    }
  }

  // ===== 3. 备份旧文件 =====
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);
  if (fs.existsSync(OUT_TXT)) fs.copyFileSync(OUT_TXT, path.join(BACKUP_DIR, `backup_txt_${Date.now()}.txt`));
  if (fs.existsSync(OUT_M3U)) fs.copyFileSync(OUT_M3U, path.join(BACKUP_DIR, `backup_m3u_${Date.now()}.m3u`));

  // ===== 4. 输出 TXT =====
  const txt = [`# Generated at ${beijingTime()} (Asia/Shanghai)`, ''];
  for (const group of Object.keys(data)) {
    txt.push(`${group},#genre#`);
    for (const name of data[group].order) {
      for (const url of data[group].channels[name]) txt.push(`${name},${url}`);
    }
    txt.push('');
  }
  fs.writeFileSync(OUT_TXT, txt.join('\n'), 'utf-8');

  // ===== 5. 输出 M3U =====
  const m3u = [`#EXTM3U`, `# Generated at ${beijingTime()} (Asia/Shanghai)`, ''];
  for (const group of Object.keys(data)) {
    for (const name of data[group].order) {
      m3u.push(`#EXTINF:-1 group-title="${group}",${name}`);
      for (const url of data[group].channels[name]) m3u.push(url);
      m3u.push('');
    }
  }
  fs.writeFileSync(OUT_M3U, m3u.join('\n'), 'utf-8');

  console.log('✔ result.txt 和 result.m3u 已更新');
})();