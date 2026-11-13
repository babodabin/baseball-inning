// 따옴표가 있는 CSV를 읽어 객체 배열로 돌려준다.
const fs = require("fs");
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift();
  return rows.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}
function loadDir(dir, from, to) {
  const out = [];
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".csv")).sort()) {
    const day = f.slice(0, 10);
    if ((from && day < from) || (to && day > to)) continue;
    out.push(...parseCsv(fs.readFileSync(dir + "/" + f, "utf8")));
  }
  return out;
}
module.exports = { parseCsv, loadDir };
