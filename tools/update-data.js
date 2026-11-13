// 피치 리더 데이터에 새 기간을 더한다.
//
//   node tools/update-data.js 2027-03-25 2027-09-30
//
// 1) Baseball Savant에서 그 기간의 정규시즌 투구를 하루치씩 받는다 (임시 폴더에 저장)
// 2) 앱의 표 구조로 집계한다
// 3) index.html 안의 데이터에 더하고, 앞뒤가 맞는지 검사한 뒤 index.html을 바꾼다
//
// 이미 들어 있는 기간을 다시 넣으려 하면 두 번 더해지지 않도록 멈춘다.
// 바꾸기 전 파일은 index.backup.html로 남긴다.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const [from, to] = process.argv.slice(2);
if (!/^\d{4}-\d{2}-\d{2}$/.test(from || "") || !/^\d{4}-\d{2}-\d{2}$/.test(to || "")) {
  console.log("사용: node tools/update-data.js <시작일 YYYY-MM-DD> <종료일 YYYY-MM-DD>");
  process.exit(1);
}
const here = __dirname;
const index = path.join(here, "..", "index.html");
const work = path.join(os.tmpdir(), "pitch-reader-statcast");
const csvDir = path.join(work, "csv");
fs.mkdirSync(csvDir, { recursive: true });
const run = (script, ...args) => execFileSync(process.execPath, [path.join(here, script), ...args], { stdio: "inherit" });

run("fetch.js", from, to, csvDir);
const agg = path.join(work, `agg-${from}-${to}.json`);
run("aggregate.js", csvDir, from, to, agg);
const next = path.join(work, "index.next.html");
run("build.js", index, agg, next);
fs.copyFileSync(index, path.join(here, "..", "index.backup.html"));
fs.copyFileSync(next, index);
console.log("index.html을 바꿨습니다. 이전 파일은 index.backup.html입니다.");
console.log("화면의 날짜 문구(상단, 하단, 설명)는 따로 고쳐야 합니다.");
