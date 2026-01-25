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

// ================= 分组规则 =================
function getGroup(name) {
  if (/^CCTV|中国教育|CGTN/i.test(name)) return '央视';
  if (/卫视/.test(name)) return '卫视';

  if (
    /(北京|上海|广东|深圳|江苏|浙江|山东|河南|湖北|湖南|四川|重庆|安徽|福建|江西|广西|云南|贵州|陕西|山西|河北|辽宁|吉林|黑龙江|内蒙古|宁夏|青海|新疆|西藏|海南|甘肃|天津)/.test(
      name
    ) ||
    /(都市|生活|新闻|公共|影视|综艺|经济|法治|少儿)/.test(name)
  ) {
    return '地方台';
  }

  return '其它';
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

  // group -> channelName -> { urls:Set, sources:Set }
  const groups = new Map();

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
        const group = getGroup(currentName);
        if (!groups.has(group)) groups.set(group, new Map());

        const chMap = groups.get(group);
        if (!chMap.has(currentName)) {
          chMap.set(currentName, { urls: new Set(), sources: new Set() });
        }

        const ch = chMap.get(currentName);
        ch.urls.add(line);
        ch.sources.add(upstream);
        currentName = '';
      }
    }
  }

  // ================= 输出 =================
  const m3u = [
    '#EXTM3U',
    `# Generated at ${beijingTime()}`,
    ''
  ];
  const apiTxt = [];

  for (const [group, channels] of groups) {
    const names = Array.from(channels.keys()).sort((a, b) =>
      a.localeCompare(b, 'zh-CN')
    );

    for (const name of names) {
      const { urls } = channels.get(name);
      for (const url of urls) {
        m3u.push(`#EXTINF:-1 group-title="${group}",${name}`);
        m3u.push(url);
        apiTxt.push(`${name},${url}`);
      }
    }
  }

  fs.writeFileSync(M3U_OUTPUT, m3u.join('\n') + '\n', 'utf-8');
  fs.writeFileSync(API_OUTPUT, apiTxt.join('\n') + '\n', 'utf-8');

  console.log('Done.');
})();