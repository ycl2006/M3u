import fs from "fs";

const TEMPLATE_FILE = "template.txt";        // Guovin result.txt
const MERGED_FILE   = "raw_interface.txt";   // 所有源合并后的接口池
const OUTPUT_M3U    = "result.m3u";
const OUTPUT_TXT    = "result.txt";

// 读取文件
const template = fs.readFileSync(TEMPLATE_FILE, "utf-8").split("\n");
const pool = fs.readFileSync(MERGED_FILE, "utf-8")
  .split("\n")
  .map(l => l.trim())
  .filter(l => l && l.startsWith("http"));

// URL 去重
const urlSet = new Set(pool);

// 输出内容
let m3u = `#EXTM3U\n`;
let txt = ``;

let currentExtinf = null;

for (let line of template) {
  line = line.trim();

  // EXTINF 行，直接作为模板
  if (line.startsWith("#EXTINF")) {
    currentExtinf = line;
    continue;
  }

  // 模板里的播放地址
  if (currentExtinf && line.startsWith("http")) {
    // 主源地址
    m3u += `${currentExtinf}\n`;
    m3u += `${line}\n`;

    txt += `${currentExtinf}\n`;
    txt += `${line}\n`;

    // 补充源地址（全部追加）
    for (const url of urlSet) {
      if (url !== line) {
        m3u += `${currentExtinf}\n${url}\n`;
        txt += `${currentExtinf}\n${url}\n`;
      }
    }

    currentExtinf = null;
  }
}

// 写文件
fs.writeFileSync(OUTPUT_M3U, m3u);
fs.writeFileSync(OUTPUT_TXT, txt);

console.log("✔ M3U & TXT generated");