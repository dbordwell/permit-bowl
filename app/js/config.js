// ============================================================================
// 🏈 PERMIT BOWL — THE TWEAK ZONE
// ----------------------------------------------------------------------------
// This is the FUN file. Change stuff here with your kid, hit Save, refresh the
// game, and watch it change. You can't really break anything — just experiment.
// (The hard machinery lives in the other files; this is the playground.)
//
// 🆕 PLAY CALLS: `playTypes` below sets what each play (run/short/bomb) can do. Want bombs to
//    hit more often? Bump their `success.breakaway`. Want punts longer? `fourthDown.puntNetYards`.
// ============================================================================

export const CONFIG = {
  // How long is a game? (total snaps = your offense + your defense)
  gamePlays: 20,
  playsPerQuarter: 5,

  // The color dots you can pick for YOUR team in Team Settings. Add hex colors!
  teamColors: ['#1763c7', '#0b8a3e', '#c62a2a', '#7b2ff7', '#e08a00', '#127a86', '#d11d6b', '#111'],

  // Teams you play against. A random one shows up each game. ADD YOUR OWN! 🏈
  rivals: [
    { name: 'Rivals',  abbr: 'RIVALS',  color: '#c62a2a' },
    { name: 'Dragons', abbr: 'DRAGONS', color: '#7b2ff7' },
    { name: 'Sharks',  abbr: 'SHARKS',  color: '#127a86' },
    { name: 'Bandits', abbr: 'BANDITS', color: '#e08a00' },
  ],

  // What flashes on the field. Add funny ones — a random one is picked each time.
  celebrations: {
    touchdown: ['🏈 TOUCHDOWN!', '🔥 6 POINTS!', 'HE SCORES!'],
    breakaway: ['💨 BREAKAWAY!', '🚀 GONE!', "CAN'T CATCH HIM!"],
    firstDown: ['1ST DOWN', 'MOVING THE CHAINS', 'KEEP IT GOING'],
    ballBack:  ['🚨 TURNOVER — BALL BACK!', '🙌 TAKEAWAY!'],
  },

  // How plays turn out. RULE WE NEVER BREAK: a right answer is the ONLY way to
  // gain yards. So "success" results are all gains, "fail" results never gain.
  // The numbers are how often each happens — want more breakaways? Bump it up!
  outcomes: {
    success: { short: 0.55, big: 0.32, breakaway: 0.13 }, // right answer (always a gain)
    fail:    { sack: 0.55, nogain: 0.45 },                 // wrong answer (never a gain)
    // yard ranges for each result [min, max]:
    tiers: { sack: [-6, -1], nogain: [0, 0], incomplete: [0, 0], intercept: [0, 0], short: [3, 8], big: [9, 20], breakaway: [21, 40] },
    labels: { sack: 'SACKED', nogain: 'STOPPED', incomplete: 'INCOMPLETE', intercept: 'INTERCEPTED', short: 'NICE GAIN', big: 'BIG GAIN', breakaway: 'BREAKAWAY!' },
  },

  // 🏈 PRE-SNAP PLAY CALLS — he picks one each offensive down; the play sets the STAKES.
  // The card still decides win/lose (a wrong answer never gains). Play type only shapes the
  // upside (how big a good play can get) and the downside (a bomb can be picked; a run can't
  // turn it over). `diff` is a SOFT card-difficulty preference (due cards are still served).
  playTypes: {
    run:   { key: 'run',   label: '🏃 RUN',        sub: 'Safe. Easy question.',  diff: 'easy',
             success: { short: 0.80, big: 0.18, breakaway: 0.02 },
             fail:    { nogain: 0.65, sack: 0.35 } },        // miss = short loss, NEVER a turnover
    short: { key: 'short', label: '🎯 SHORT PASS', sub: 'Balanced.',             diff: 'medium',
             success: { short: 0.50, big: 0.38, breakaway: 0.12 },
             fail:    { incomplete: 1.0 } },                 // miss = incomplete, lose the down
    bomb:  { key: 'bomb',  label: '💣 DEEP BOMB',   sub: 'Hero ball. Hard one.',  diff: 'hard',
             success: { short: 0.18, big: 0.42, breakaway: 0.40 },
             fail:    { intercept: 0.45, sack: 0.55 } },     // miss = risk of a PICK (turnover)
  },

  // 4th-down decisions (offense only).
  fourthDown: { fieldGoalMaxYards: 37, puntNetYards: 40, touchbackAt: 20, fgPoints: 3 },

  // Point-after-touchdown: a TD is 6, then he picks the extra point.
  pat: { kickPoints: 1, twoPoints: 2, kickDiff: 'easy', twoDiff: 'hard' },
};
