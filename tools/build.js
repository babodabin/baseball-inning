// index.html 안의 데이터에 새 기간 집계를 더해 새 index.html을 만든다.
// 사용: node build.js <기존 index.html> <새 집계.json> <출력 index.html>
const fs = require("fs");
const { merge, SPEC } = require("./merge.js");
const [srcFile, newFile, outFile] = process.argv.slice(2);

const lines = fs.readFileSync(srcFile, "utf8").split("\n");
const at = lines.findIndex((x) => x.startsWith("window.CONTEXT_DATA = "));
if (at < 0) throw new Error("데이터 줄을 못 찾음");
const line = lines[at];
const start = line.indexOf("{"), end = line.lastIndexOf("}");
const old = JSON.parse(line.slice(start, end + 1));
const neu = JSON.parse(fs.readFileSync(newFile, "utf8"));

if (neu.meta.firstDate <= old.meta.coverageEnd) throw new Error(`새 기간(${neu.meta.firstDate}~)이 기존 범위(~${old.meta.coverageEnd})와 겹침. 두 번 더해지는 것을 막기 위해 중단.`);

const merged = merge(old, neu);
merged.meta.partialLatestSeason = false;

// 합친 결과가 앞뒤가 맞는지 확인
const problems = [];
for (const name of Object.keys(SPEC)) {
  const spec = SPEC[name], rows = merged[name], sums = new Map();
  for (const r of rows) {
    const k = spec.state.map((x) => r[x]).join("|");
    const s = sums.get(k) || { n: 0, p: 0, state: r[spec.stateName || "state_n"] };
    s.n += r.n; s.p += r.p; sums.set(k, s);
    if (!(r.n > 0) || !(r.p >= 0 && r.p <= 1)) problems.push(`${name}: 이상한 값 ${JSON.stringify(r)}`);
  }
  for (const [k, s] of sums) {
    if (s.n !== s.state) problems.push(`${name} ${k}: 개수 합 ${s.n} ≠ ${s.state}`);
    if (Math.abs(s.p - 1) > 0.005) problems.push(`${name} ${k}: 확률 합 ${s.p}`);
  }
  if (spec.key.includes("role")) {
    const t = { ALL: 0, SP: 0, RP: 0 };
    rows.forEach((r) => { t[r.role] += r.n; });
    if (t.ALL !== t.SP + t.RP) problems.push(`${name}: 전체 ${t.ALL} ≠ 선발+불펜 ${t.SP + t.RP}`);
    const expect = name === "sequence" ? merged.meta.pairs : merged.meta.pitches;
    if (t.ALL !== expect) problems.push(`${name}: 전체 ${t.ALL} ≠ meta ${expect}`);
  }
}
if (problems.length) { console.log(problems.slice(0, 20).join("\n")); throw new Error(`검사 실패 ${problems.length}건`); }

lines[at] = line.slice(0, start) + JSON.stringify(merged) + line.slice(end + 1);
fs.writeFileSync(outFile, lines.join("\n"));
console.log(`투구 ${old.meta.pitches} → ${merged.meta.pitches} (+${neu.meta.pitches})`);
console.log(`경기 ${old.meta.games} → ${merged.meta.games} (+${neu.meta.games})`);
console.log(`연속 쌍 ${old.meta.pairs} → ${merged.meta.pairs} (+${neu.meta.pairs})`);
console.log(`범위 ~${old.meta.coverageEnd} → ~${merged.meta.coverageEnd}`);
for (const name of Object.keys(SPEC)) console.log(`  ${name.padEnd(9)} 행 ${String(old[name].length).padStart(6)} → ${String(merged[name].length).padStart(6)}`);
console.log("내부 검사 통과 (개수 합, 확률 합, 전체 = 선발 + 불펜, 표 총량 = meta)");
