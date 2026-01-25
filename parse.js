import fs from "fs";

/* ===== 配置 ===== */
const TEMPLATE_FILE = "template.txt";        // 主模板（Guovin result.txt）
const MERGED_FILE   = "raw_interface.txt";   // 合并后的所有源
const OUTPUT_M3U    = "result.m3u";
const OUTPUT_TXT    = "result.txt";

/* ===== 生成北京时间时间戳 ===== */
function beijingTime() {
  const now = new Date();
  const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);

  const pad = n => String(n).padStart(2, "0");

  return `${utc8.getUTCFullYear()}-${pad(utc8.getUTCMonth() + 1)}-${pad(utc8.getUTCDate())} `
       + `${pad(utc8.getUTCHours())}:${pad(utc8.getUTCMinutes())}:${pad(utc8.getUTCSeconds())}`;
}

const TIME_STAMP = beijingTime();

/* ===== 读取文件 ===== */
const template = fs.readFileSync(TEMPLATE_FILE, "utf-8").split(/\r?\n/);
const pool = fs.readFileSync(MERGED_FILE, "utf-8")
  .split(/\r?\n/)
  .map(l => l.trim())
  .filter(l => l && l.startsWith("http"));

// 去重 URL
const urlSet = new Set(pool);

/* ===== 初始化输出 ===== */
let m3u = `#EXTM3U\n# Generated at: ${TIME_STAMP} (UTC+8 Beijing Time)\n\n`;
let txt = `# Generated at: ${TIME_STAMP} (UTC+8 Beijing Time)\n\n`;

let currentExtinf = null;

/* ===== 按模板输出 ===== */
for (let line of template) {
  line = line.trim();

  if (line.startsWith("#EXTINF")) {
    currentExtinf = line;
    continue;
  }

  if (currentExtinf && line.startsWith("http")) {
    // 模板原始源
    m3u += `${currentExtinf}\n${line}\n`;
    txt += `${currentExtinf}\n${line}\n`;

    // 补充源
    for (const url of urlSet) {
      if (url !== line) {
        m3u += `${currentExtinf}\n${url}\n`;
        txt += `${currentExtinf}\n${url}\n`;
      }
    }

    currentExtinf = null;
  }
}

/* ===== 写文件 ===== */
fs.writeFileSync(OUTPUT_M3U, m3u.trim() + "\n");
fs.writeFileSync(OUTPUT_TXT, txt.trim() + "\n");

console.log("✔ Generated result.m3u & result.txt with Beijing timestamp");