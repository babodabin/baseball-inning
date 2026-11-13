// 하루치씩 Statcast CSV를 받는다. 이미 받은 날은 건너뛴다.
const fs = require("fs");
const [from, to, dir] = [process.argv[2], process.argv[3], process.argv[4] || "sc"];
const days = [];
for (let d = new Date(from + "T00:00:00Z"); d <= new Date(to + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));
const url = (day) => `https://baseballsavant.mlb.com/statcast_search/csv?all=true&type=details&hfGT=R%7C&hfSea=${day.slice(0, 4)}%7C&player_type=pitcher&game_date_gt=${day}&game_date_lt=${day}&min_pitches=0&min_results=0&min_pas=0&sort_col=pitches&sort_order=desc`;
async function one(day) {
  const file = `${dir}/${day}.csv`;
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return "skip";
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const r = await fetch(url(day), { headers: { "User-Agent": "statcast-fetch" } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const text = await r.text();
      if (!text.includes("pitch_type")) throw new Error("머리글 없음");
      fs.writeFileSync(file, text);
      const rows = text.split("\n").length - 2;
      if (rows >= 24990) console.log(`★ ${day}: ${rows}행 — 상한에 걸렸을 수 있음`);
      return rows;
    } catch (e) {
      if (attempt === 4) { console.log(`실패 ${day}: ${e.message}`); return "fail"; }
      await new Promise((res) => setTimeout(res, 3000 * attempt));
    }
  }
}
(async () => {
  let i = 0, total = 0, fail = 0;
  const worker = async () => { while (i < days.length) { const day = days[i++]; const r = await one(day); if (typeof r === "number") total += r; if (r === "fail") fail++; } };
  await Promise.all([worker(), worker()]);
  console.log(`완료: ${days.length}일, 새로 받은 투구 ${total}, 실패 ${fail}`);
})();
