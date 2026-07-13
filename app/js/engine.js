// engine.js — football logic with a real possession model.
// One absolute field, 0–100: 0 = HOME's goal line (left end zone), 100 = AWAY's goal
// line (right end zone). HOME drives → (toward 100); AWAY drives ← (toward 0).
// A turnover flips possession AT THE SPOT and the new team attacks the other end zone.

import { CONFIG } from './config.js';

export const HOME = 'home';
export const AWAY = 'away';
export const dirOf = (poss) => (poss === HOME ? 1 : -1);

// ---- play outcome (correctness sets win/loss; randomness sets the yardage drama) ----
// Outcome QUALITY is fully determined by the answer — never by dice:
//   success (right answer for the carrying side)  -> ALWAYS a gain
//   failure (wrong answer)                         -> NEVER a gain (sack or no gain)
// Only the MAGNITUDE of a good play varies (upside flavor), so the player is always in control.
// The weights/ranges/labels live in config.js (the "tweak zone") so they're easy to tune together.
const O = CONFIG.outcomes;

function pickTier(dist, rng) {
  let r = rng();
  for (const [tier, p] of dist) { if ((r -= p) <= 0) return tier; }
  return dist[dist.length - 1][0];
}
const randInt = (lo, hi, rng) => Math.floor(rng() * (hi - lo + 1)) + lo;

// The CARD decides win/lose. `playType` (optional) sets the STAKES: its own success/fail
// tier weights. `boost` only ever upgrades a GOOD play to a bigger one — it can NEVER turn a
// failure into a gain. With no playType we fall back to the default outcomes (used by defense).
// Returns `turnover: true` when the rolled tier is an interception.
export function resolvePlay(success, { boost = 0, playType = null, rng = Math.random } = {}) {
  const succDist = Object.entries(playType ? playType.success : O.success);
  const failDist = Object.entries(playType ? playType.fail : O.fail);
  let tier = pickTier(success ? succDist : failDist, rng);
  if (success && boost > 0) {
    const order = ['short', 'big', 'breakaway'];
    let idx = order.indexOf(tier);
    if (idx >= 0) { while (idx < order.length - 1 && rng() < boost) idx++; tier = order[idx]; }
  }
  const [lo, hi] = O.tiers[tier];
  return { tier, label: O.labels[tier], yards: randInt(lo, hi, rng), turnover: tier === 'intercept' || tier === 'fumble' };
}

// ---- game state ----
export function newGame() {
  const g = { poss: HOME, ballOn: 25, down: 1, toGo: 10, lineToGain: 35,
              home: 0, away: 0, quarter: 1, plays: 0 };
  return g;
}

// new set of downs for `poss`, ball spotted at `ballOn`
export function setDrive(g, poss, ballOn) {
  g.poss = poss;
  g.ballOn = Math.max(1, Math.min(99, ballOn));
  g.down = 1; g.toGo = 10;
  g.lineToGain = Math.max(1, Math.min(100, g.ballOn + dirOf(poss) * 10));
}
// scoring team kicks off → other team starts at its own 25
export const kickoffTo = (g, poss) => setDrive(g, poss, poss === HOME ? 25 : 75);
// turnover on downs → other team takes over at the current spot, attacking the other way
export const turnoverAtSpot = (g) => setDrive(g, g.poss === HOME ? AWAY : HOME, g.ballOn);

// ---- 4th-down decisions (offense only) ----
export function distanceToGoal(g) { return g.poss === HOME ? 100 - g.ballOn : g.ballOn; }
export function inFieldGoalRange(g) { return distanceToGoal(g) <= CONFIG.fourthDown.fieldGoalMaxYards; }

// Punt: flip possession and spot the ball `puntNetYards` downfield; touchback if it reaches
// the receiving team's end zone (spotted at `touchbackAt` from their goal line).
export function punt(g) {
  const fd = CONFIG.fourthDown;
  const other = g.poss === HOME ? AWAY : HOME;
  let spot = g.ballOn + dirOf(g.poss) * fd.puntNetYards;
  if (other === AWAY && spot >= 100 - fd.touchbackAt) spot = 100 - fd.touchbackAt; // AWAY ball at 80
  if (other === HOME && spot <= fd.touchbackAt) spot = fd.touchbackAt;             // HOME ball at 20
  setDrive(g, other, spot);
}

// Apply yardage to the current possession. Returns the event; mutates g.
// events: 'touchdown' | 'first_down' | 'turnover' | 'play'
export function advance(g, yards) {
  const d = dirOf(g.poss);
  const raw = g.ballOn + d * yards;

  if (g.poss === HOME && raw >= 100) { g.ballOn = 100; g.home += 6; return 'touchdown'; }
  if (g.poss === AWAY && raw <= 0)   { g.ballOn = 0;   g.away += 6; return 'touchdown'; }

  g.ballOn = Math.max(1, Math.min(99, raw));

  const reached = g.poss === HOME ? g.ballOn >= g.lineToGain : g.ballOn <= g.lineToGain;
  if (reached) {
    g.down = 1; g.toGo = 10;
    g.lineToGain = Math.max(1, Math.min(100, g.ballOn + d * 10));
    return 'first_down';
  }
  g.down += 1;
  g.toGo = Math.abs(g.lineToGain - g.ballOn);
  if (g.down > 4) return 'turnover';
  return 'play';
}

export function downText(g) {
  const ord = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' }[g.down] || `${g.down}th`;
  const toGoal = g.poss === HOME ? 100 - g.ballOn : g.ballOn;
  const dist = g.toGo >= toGoal ? 'Goal' : Math.round(g.toGo);
  return `${ord} & ${dist}`;
}

// yard-line label for a 0–100 position (50 at midfield, counting down to each goal)
export function yardLabel(pos) {
  const n = pos <= 50 ? pos : 100 - pos;
  return Math.round(n / 10) * 10;
}
