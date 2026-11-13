// 기존 표에 새 기간의 집계를 더한다. 개수는 더하고 비율은 표본 수로 가중해 다시 구한다.
const round6 = (x) => {
  const y = x * 1e6, f = Math.floor(y);
  if (y - f === 0.5) return (f % 2 === 0 ? f : f + 1) / 1e6;
  return Math.round(y) / 1e6;
};

const SPEC = {
  baseline: { key: ["cnt", "p_throws", "stand", "role", "pitch"], state: ["cnt", "p_throws", "stand", "role"], stats: true },
  inning: { key: ["cnt", "p_throws", "stand", "role", "inning_group", "pitch"], state: ["cnt", "p_throws", "stand", "role", "inning_group"], stats: true },
  baseOut: { key: ["cnt", "p_throws", "stand", "role", "base", "outs_when_up", "pitch"], state: ["cnt", "p_throws", "stand", "role", "base", "outs_when_up"], stats: true },
  fatigue: { key: ["cnt", "p_throws", "stand", "role", "pitch_count", "pitch"], state: ["cnt", "p_throws", "stand", "role", "pitch_count"], stats: true },
  zone: { key: ["cnt", "p_throws", "stand", "role", "pitch", "zone"], state: ["cnt", "p_throws", "stand", "role", "pitch"], stats: false },
  sequence: { key: ["cnt", "p_throws", "stand", "role", "prev_pitch", "prev_outcome", "pitch"], state: ["cnt", "p_throws", "stand", "role", "prev_pitch", "prev_outcome"], stats: true },
  outcome: { key: ["outcome", "pitch"], state: ["outcome"], stats: false, stateName: "outcome_n" },
};

const cmp = (a, b) => (typeof a === "number" && typeof b === "number" ? a - b : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);

function mergeTable(name, oldRows, newRows) {
  const spec = SPEC[name];
  const keyOf = (r) => spec.key.map((k) => r[k]).join("|");
  const cells = new Map();
  for (const r of oldRows) {
    const c = { n: r.n };
    for (const k of spec.key) c[k] = r[k];
    if (spec.stats) {
      c.cswSum = r.csw == null ? 0 : r.csw * r.n; c.cswW = r.csw == null ? 0 : r.n;
      c.hitSum = r.hit == null ? 0 : r.hit * r.n; c.hitW = r.hit == null ? 0 : r.n;
      c.rvSum = r.rv == null ? 0 : r.rv * r.n; c.rvW = r.rv == null ? 0 : r.n;
      c.mphSum = r.mph == null ? 0 : r.mph * r.n; c.mphW = r.mph == null ? 0 : r.n;
    }
    cells.set(keyOf(r), c);
  }
  for (const r of newRows) {
    let c = cells.get(keyOf(r));
    if (!c) {
      c = { n: 0, cswSum: 0, cswW: 0, hitSum: 0, hitW: 0, rvSum: 0, rvW: 0, mphSum: 0, mphW: 0 };
      for (const k of spec.key) c[k] = r[k];
      cells.set(keyOf(r), c);
    }
    c.n += r.n;
    if (spec.stats) {
      c.cswSum += r.cswN; c.cswW += r.n;
      c.hitSum += r.hitN; c.hitW += r.n;
      c.rvSum += r.rvSum; c.rvW += r.rvN;
      c.mphSum += r.mphSum; c.mphW += r.mphN;
    }
  }
  const stateOf = (c) => spec.state.map((k) => c[k]).join("|");
  const stateN = new Map();
  for (const c of cells.values()) stateN.set(stateOf(c), (stateN.get(stateOf(c)) || 0) + c.n);
  // 기존 파일의 행 순서: 전체 역할(ALL) 묶음이 먼저, 그 뒤에 선발·불펜이 열 순서대로
  const rank = (c) => (c.role === "ALL" || c.role === undefined ? 0 : 1);
  const rows = [...cells.values()].sort((a, b) => { if (rank(a) !== rank(b)) return rank(a) - rank(b); for (const k of spec.key) { const d = cmp(a[k], b[k]); if (d) return d; } return 0; });
  return rows.map((c) => {
    const out = {};
    for (const k of spec.key) out[k] = c[k];
    out.n = c.n;
    if (spec.stats) {
      out.csw = c.cswW ? round6(c.cswSum / c.cswW) : null;
      out.hit = c.hitW ? round6(c.hitSum / c.hitW) : null;
      out.rv = c.rvW ? round6(c.rvSum / c.rvW) : null;
      out.mph = c.mphW ? round6(c.mphSum / c.mphW) : null;
    }
    const sn = stateN.get(stateOf(c));
    out[spec.stateName || "state_n"] = sn;
    out.p = round6(c.n / sn);
    return out;
  });
}

function merge(old, neu) {
  const out = { meta: { ...old.meta }, pitchOrder: old.pitchOrder, pitchNames: old.pitchNames };
  for (const name of Object.keys(SPEC)) out[name] = mergeTable(name, old[name], neu ? neu[name] : []);
  if (neu) {
    out.meta.pitches = old.meta.pitches + neu.meta.pitches;
    out.meta.games = old.meta.games + neu.meta.games;
    out.meta.pairs = old.meta.pairs + neu.meta.pairs;
    out.meta.coverageEnd = neu.meta.lastDate;
  }
  return out;
}

module.exports = { merge, SPEC };
