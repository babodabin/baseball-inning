// Statcast 투구 CSV를 피치 리더의 표 구조로 집계한다.
// 사용: node aggregate.js <csv폴더> <시작일> <종료일> <출력.json>
const fs = require("fs");
const { loadDir } = require("./csv.js");

const PITCHES = ["FF", "SI", "FC", "SL", "ST", "CU", "KC", "CH", "FS", "SV"];
const TEN = new Set(PITCHES);
const OUTCOME = {
  called_strike: "루킹",
  swinging_strike: "헛스윙", swinging_strike_blocked: "헛스윙",
  foul: "파울", foul_tip: "파울",
};
const HITS = new Set(["single", "double", "triple", "home_run"]);

function aggregate(rows) {
  // 같은 투구가 두 번 들어온 경우를 걸러낸다
  const seen = new Set();
  rows = rows.filter((r) => {
    const k = r.game_pk + "|" + r.at_bat_number + "|" + r.pitch_number;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
  rows = rows.filter((r) => r.game_type === "R");
  rows.forEach((r) => { r.ab = +r.at_bat_number; r.pn = +r.pitch_number; });
  rows.sort((a, b) => (a.game_pk - b.game_pk) || (a.ab - b.ab) || (a.pn - b.pn));

  // 선발 = 그 경기에서 팀의 첫 투수. 투구수 = 그 경기에서 그 투수가 던진 순번.
  const starter = new Map(), thrown = new Map();
  let before = null;
  for (const r of rows) {
    r.prevRow = before && before.game_pk === r.game_pk && before.ab === r.ab ? before : null;
    before = r;
    const side = r.game_pk + "|" + r.inning_topbot;
    if (!starter.has(side)) starter.set(side, r.pitcher);
    r.role = starter.get(side) === r.pitcher ? "SP" : "RP";
    const pk = r.game_pk + "|" + r.pitcher;
    const n = (thrown.get(pk) || 0) + 1;
    thrown.set(pk, n);
    r.pitchCount = n <= 30 ? "1-30" : n <= 60 ? "31-60" : n <= 90 ? "61-90" : "91+";
  }

  const valid = (r) => TEN.has(r.pitch_type) && r.zone !== "" && r.balls !== "" && r.strikes !== "" && +r.balls <= 3 && +r.strikes <= 2;
  const kept = rows.filter(valid);
  const tables = { baseline: new Map(), inning: new Map(), baseOut: new Map(), fatigue: new Map(), zone: new Map(), sequence: new Map(), outcome: new Map() };
  const add = (table, keyObj, r, withStats = true) => {
    const key = Object.values(keyObj).join("|");
    let cell = table.get(key);
    if (!cell) { cell = { ...keyObj, n: 0, cswN: 0, hitN: 0, rvSum: 0, rvN: 0, mphSum: 0, mphN: 0 }; table.set(key, cell); }
    cell.n++;
    if (!withStats) return;
    if (r.out === "루킹" || r.out === "헛스윙") cell.cswN++;
    if (r.isHit) cell.hitN++;
    if (r.delta_run_exp !== "") { cell.rvSum += +r.delta_run_exp; cell.rvN++; }
    if (r.release_speed !== "") { cell.mphSum += +r.release_speed; cell.mphN++; }
  };

  let pairs = 0;
  for (const r of kept) {
    const prev = r.prevRow && valid(r.prevRow) ? r.prevRow : null;
    r.cnt = r.balls + "-" + r.strikes;
    r.out = OUTCOME[r.description] || null;
    r.isHit = HITS.has(r.events);
    const inn = +r.inning;
    const inningGroup = inn <= 3 ? "1-3" : inn <= 6 ? "4-6" : inn <= 8 ? "7-8" : "9+";
    const base = r.on_2b !== "" || r.on_3b !== "" ? "risp" : r.on_1b !== "" ? "first" : "none";
    for (const role of ["ALL", r.role]) {
      const core = { cnt: r.cnt, p_throws: r.p_throws, stand: r.stand, role };
      add(tables.baseline, { ...core, pitch: r.pitch_type }, r);
      add(tables.inning, { ...core, inning_group: inningGroup, pitch: r.pitch_type }, r);
      add(tables.baseOut, { ...core, base, outs_when_up: +r.outs_when_up, pitch: r.pitch_type }, r);
      add(tables.fatigue, { ...core, pitch_count: r.pitchCount, pitch: r.pitch_type }, r);
      add(tables.zone, { ...core, pitch: r.pitch_type, zone: +r.zone }, r, false);
      // 직전 공: 같은 타석의 바로 앞 공이 스트라이크 세 종류 중 하나일 때만
      if (prev && prev.out) {
        add(tables.sequence, { ...core, prev_pitch: prev.pitch_type, prev_outcome: prev.out, pitch: r.pitch_type }, r);
        if (role === "ALL") pairs++;
      }
    }
    if (r.out) add(tables.outcome, { outcome: r.out, pitch: r.pitch_type }, r, false);
    if (r.isHit) add(tables.outcome, { outcome: "안타", pitch: r.pitch_type }, r, false);
  }

  const out = { meta: { pitches: kept.length, games: new Set(kept.map((r) => r.game_pk)).size, pairs, firstDate: null, lastDate: null } };
  const dates = kept.map((r) => r.game_date.slice(0, 10)).sort();
  out.meta.firstDate = dates[0]; out.meta.lastDate = dates[dates.length - 1];
  for (const [name, table] of Object.entries(tables)) out[name] = [...table.values()];
  return out;
}

module.exports = { aggregate, PITCHES };

if (require.main === module) {
  const [dir, from, to, outFile] = process.argv.slice(2);
  const rows = loadDir(dir, from, to);
  const result = aggregate(rows);
  fs.writeFileSync(outFile, JSON.stringify(result));
  console.log(`읽은 행 ${rows.length} → 집계 투구 ${result.meta.pitches}, 경기 ${result.meta.games}, 연속 쌍 ${result.meta.pairs}, ${result.meta.firstDate} ~ ${result.meta.lastDate}`);
}
