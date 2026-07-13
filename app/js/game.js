// game.js — glue: deck + possession football where EVERY snap is a question.
// Offense: right = you gain, wrong = you get sacked.
// Defense: right = you stop them, wrong = they gain (and enough misses = they score).
// Broadcast field, QB OVR from mastery, local persistence. Single-user, no backend.

import { loadCards, Deck, MASTERY_BOX } from './deck.js';
import { CONFIG } from './config.js';
import {
  HOME, AWAY, resolvePlay, newGame, kickoffTo, turnoverAtSpot,
  advance, downText, yardLabel, inFieldGoalRange, distanceToGoal, punt,
} from './engine.js';

const CARDS_URL = '../content/ohio-permit-cards.json';
const IMG_BASE = '../content/';
const SAVE_KEY = 'permit-football-v2';
const TEAMS = { home: { abbr: 'HOME', name: 'Home' }, away: { abbr: 'RIVALS', name: 'Rivals' } };
const GAME_PLAYS = CONFIG.gamePlays;   // total snaps (offense + defense) per game
const PLAYS_PER_Q = CONFIG.playsPerQuarter;
const COLORS = CONFIG.teamColors;
const DEFAULT_PROFILE = { teamName: 'HOME', color: CONFIG.teamColors[0] };
const CELEB = CONFIG.celebrations;
const PLAYTYPES = CONFIG.playTypes;
const DEFENSETYPES = CONFIG.defenseTypes;
const pickOne = (a) => a[Math.floor(Math.random() * a.length)];

let deck, game, current, session, profile;
let career;

const $ = (id) => document.getElementById(id);
const shuffle = (a) => a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(p => p[1]);
const ovr = () => Math.round(40 + deck.masteryPct() * 59); // mastery-driven only

const save = () => localStorage.setItem(SAVE_KEY, JSON.stringify({ deck: deck.serialize(), career, profile }));
const load = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; } };

async function init() {
  const cards = await loadCards(CARDS_URL);
  const saved = load();
  deck = new Deck(cards, saved?.deck);
  career = { games: 0, plays: 0, correct: 0, wins: 0, losses: 0, ties: 0, streak: 0, lastDay: null, freezes: 1, tokens: 0, upgrades: { speed: 0, power: 0 }, ...(saved?.career || {}) };
  career.upgrades = { speed: 0, power: 0, ...(career.upgrades || {}) };
  profile = { ...DEFAULT_PROFILE, ...(saved?.profile || {}) };
  $('away-abbr').textContent = TEAMS.away.abbr;
  $('ez-away-label').textContent = TEAMS.away.abbr;
  applyProfile();
  buildYardLines();
  $('end-game').addEventListener('click', () => endGame(true));
  $('kickoff').addEventListener('click', kickoff);
  $('open-settings').addEventListener('click', toggleSettings);
  $('save-settings').addEventListener('click', saveSettings);
  $('open-roster').addEventListener('click', openRoster);
  $('roster-close').addEventListener('click', () => { $('roster').hidden = true; });
  $('open-locker').addEventListener('click', openLocker);
  $('locker-close').addEventListener('click', () => { $('locker').hidden = true; });
  renderHome();
}

// ---------- home / personalization ----------
function applyProfile() {
  document.documentElement.style.setProperty('--homecol', profile.color);
  const nm = (profile.teamName || 'HOME').toUpperCase();
  TEAMS.home.abbr = nm;
  TEAMS.home.name = profile.teamName || 'Home';
  $('home-abbr').textContent = nm;
  $('ez-home-label').textContent = nm;
  $('home-team').textContent = nm;
}
function renderHome() {
  $('home-ovr').textContent = ovr();
  $('home-streak').textContent = `${career.streak || 0}🔥${career.freezes > 0 ? ' ❄️' : ''}`;
  $('home-record').textContent = `${career.wins || 0}–${career.losses || 0}`;
  $('home-team').textContent = TEAMS.home.abbr;
  $('open-locker').textContent = `🏪 Locker Room · 🪙 ${career.tokens || 0}`;
}

// Roster = knowledge made visible: each topic is a "player" whose rating is how much
// of that topic he's mastered. Learn more rules -> your players level up.
function openRoster() {
  const byTopic = {};
  for (const c of deck.cards) {
    const s = byTopic[c.topic] || (byTopic[c.topic] = { total: 0, mastered: 0 });
    s.total++;
    if (deck.state[c.id].box >= MASTERY_BOX) s.mastered++;
  }
  const rows = Object.entries(byTopic)
    .map(([topic, s]) => ({ topic, total: s.total, mastered: s.mastered, pct: s.mastered / s.total }))
    .sort((a, b) => b.pct - a.pct || a.topic.localeCompare(b.topic));
  $('roster-ovr').textContent = ovr();
  $('roster-list').innerHTML = rows.map(r => {
    const o = Math.round(40 + r.pct * 59);
    const star = r.pct === 1 ? ' ⭐' : '';
    return `<div class="player">
      <div class="p-ovr">${o}</div>
      <div class="p-info">
        <div class="p-name">${esc(r.topic)}${star}</div>
        <div class="p-bar"><span style="width:${Math.round(r.pct * 100)}%"></span></div>
      </div>
      <div class="p-count">${r.mastered}/${r.total}</div>
    </div>`;
  }).join('');
  $('roster').hidden = false;
}

// Locker Room: spend tokens (1 per right answer) on player upgrades. Upgrades only make
// your GOOD plays bigger — you still have to answer right to gain (determinism preserved).
const UPGRADES = [
  { key: 'speed', name: '⚡ WR Speed', desc: 'More breakaways' },
  { key: 'power', name: '💪 RB Power', desc: 'Bigger gains' },
];
const UP_COST = [10, 20, 35]; // cost to reach level 1, 2, 3
const UP_MAX = 3;
function openLocker() {
  $('locker-tokens').textContent = career.tokens || 0;
  $('locker-list').innerHTML = UPGRADES.map(u => {
    const lvl = career.upgrades[u.key] || 0;
    const maxed = lvl >= UP_MAX;
    const cost = maxed ? null : UP_COST[lvl];
    const can = !maxed && (career.tokens || 0) >= cost;
    return `<div class="player">
      <div class="p-ovr">L${lvl}</div>
      <div class="p-info">
        <div class="p-name">${u.name}</div>
        <div class="p-sub">${u.desc} · ${'●'.repeat(lvl)}${'○'.repeat(UP_MAX - lvl)}</div>
      </div>
      <button class="buy-btn" data-key="${u.key}" ${maxed || !can ? 'disabled' : ''}>${maxed ? 'MAX' : '🪙' + cost}</button>
    </div>`;
  }).join('');
  for (const b of document.querySelectorAll('.buy-btn')) b.addEventListener('click', () => buyUpgrade(b.dataset.key));
  $('locker').hidden = false;
}
function buyUpgrade(key) {
  const lvl = career.upgrades[key] || 0;
  if (lvl >= UP_MAX) return;
  const cost = UP_COST[lvl];
  if ((career.tokens || 0) < cost) return;
  career.tokens -= cost;
  career.upgrades[key] = lvl + 1;
  save();
  openLocker();
  renderHome();
}
function toggleSettings() {
  const s = $('settings');
  s.hidden = !s.hidden;
  if (!s.hidden) { $('team-name').value = profile.teamName === 'HOME' ? '' : profile.teamName; buildSwatches(); }
}
function buildSwatches() {
  const wrap = $('swatches');
  wrap.innerHTML = '';
  for (const c of COLORS) {
    const d = document.createElement('div');
    d.className = 'swatch' + (c === profile.color ? ' sel' : '');
    d.style.background = c;
    d.addEventListener('click', () => {
      profile.color = c;
      document.documentElement.style.setProperty('--homecol', c);
      buildSwatches();
    });
    wrap.appendChild(d);
  }
}
function saveSettings() {
  const name = $('team-name').value.trim();
  if (name) profile.teamName = name;
  applyProfile();
  renderHome();
  save();
  $('settings').hidden = true;
}
function kickoff() { updateStreak(); document.body.className = 'playing'; startGame(); }
function showHome() { document.body.className = 'home'; $('summary').hidden = true; renderHome(); }

// Daily streak: returning on consecutive days grows it; a freeze covers one missed day.
const dayNum = () => Math.floor(new Date(new Date().toDateString()).getTime() / 86400000);
function updateStreak() {
  const today = dayNum();
  if (career.lastDay === today) return;            // already counted today
  if (career.lastDay == null) career.streak = 1;
  else {
    const gap = today - career.lastDay;
    if (gap === 1) career.streak += 1;             // next day — keep the fire going
    else if (gap === 2 && career.freezes > 0) { career.freezes -= 1; career.streak += 1; } // freeze saves it
    else career.streak = 1;                        // streak broken — restart at today
  }
  career.lastDay = today;
  save();
}

function startGame() {
  game = newGame();              // HOME gets the ball first (offense)
  session = { plays: 0, correct: 0, offYards: 0 };
  // pick a random opponent for this game (from the config rivals list)
  const rival = pickOne(CONFIG.rivals);
  TEAMS.away = { abbr: (rival.abbr || rival.name).toUpperCase(), name: rival.name };
  document.documentElement.style.setProperty('--awaycol', rival.color);
  $('away-abbr').textContent = TEAMS.away.abbr;
  $('ez-away-label').textContent = TEAMS.away.abbr;
  renderAll();
  nextPlay();
}

function buildYardLines() {
  const yl = $('yardlines');
  yl.innerHTML = '';
  for (let i = 10; i <= 90; i += 10) {
    const line = document.createElement('div');
    line.className = 'yardline' + (i === 50 ? ' fifty' : '');
    line.style.left = `${i}%`;
    yl.appendChild(line);
    const num = document.createElement('div');
    num.className = 'yardnum';
    num.style.left = `${i}%`;
    num.style.top = '6px';
    num.textContent = i <= 50 ? i : 100 - i;
    yl.appendChild(num);
  }
}

// ---------- rendering ----------
const onOffense = () => game.poss === HOME;
function spotText() {
  const y = yardLabel(game.ballOn);
  if (y >= 50) return 'midfield';
  const side = game.ballOn < 50 ? TEAMS.home.abbr : TEAMS.away.abbr;
  return `${side} ${y}`;
}
function renderAll() {
  $('home-score').textContent = game.home;
  $('away-score').textContent = game.away;
  $('quarter').textContent = game.quarter > 4 ? 'FINAL' : `Q${game.quarter}`;
  $('possession').textContent = onOffense() ? '🏈 YOUR BALL' : '🛡️ ON DEFENSE';
  $('downdist').textContent = downText(game);
  $('spot').textContent = spotText();
  $('ovr').textContent = ovr();
  $('ball').style.left = `${game.ballOn}%`;
  $('los').style.left = `${game.ballOn}%`;
  $('downmarker').style.left = `${game.ballOn}%`;
  $('downmarker').textContent = game.down;
  $('firstdown').style.left = `${Math.min(game.lineToGain, 100)}%`;
  $('fdtag').style.left = `${Math.min(game.lineToGain, 100)}%`;
  $('ball').classList.toggle('flip', !onOffense());
}

// ---------- one snap = one question ----------
// Offense: he CALLS a play first (sets the stakes), then answers the card.
// Defense: straight to the card (the "get a stop" flow is unchanged).
function nextPlay() {
  if (session.plays >= GAME_PLAYS) return endGame(false);
  if (onOffense() && game.down === 4) return fourthDownDecision();
  if (onOffense()) return callPlay();
  return callDefense();
}

// Pre-snap: three buttons. One tap calls the play and snaps the ball.
function callPlay() {
  $('stage').innerHTML = `
    <div class="playcall">
      <div class="phase off">🏈 YOUR BALL — ${esc(downText(game))} · call your play</div>
      <div class="pc-grid">
        ${Object.values(PLAYTYPES).map(pt => `
          <button class="pc-btn pc-${pt.key}" data-key="${pt.key}">
            <span class="pc-label">${pt.label}</span>
            <span class="pc-sub">${esc(pt.sub)}</span>
          </button>`).join('')}
      </div>
    </div>`;
  for (const b of document.querySelectorAll('.pc-btn')) {
    b.addEventListener('click', () => choosePlay(b.dataset.key));
  }
}

function choosePlay(key) {
  const pt = PLAYTYPES[key];
  current = deck.next(pt.diff);   // soft difficulty preference (due cards still served)
  current.playType = pt;
  current.defenseType = null;
  current.typeKey = key;
  presentCard();
}

// Pre-snap on defense: pick a scheme, then face the rival's play (the card).
function callDefense() {
  $('stage').innerHTML = `
    <div class="playcall">
      <div class="phase def">🛡️ ON DEFENSE — ${esc(downText(game))} · call your D</div>
      <div class="pc-grid">
        ${Object.values(DEFENSETYPES).map(dt => `
          <button class="pc-btn pc-${dt.key}" data-key="${dt.key}">
            <span class="pc-label">${dt.label}</span>
            <span class="pc-sub">${esc(dt.sub)}</span>
          </button>`).join('')}
      </div>
    </div>`;
  for (const b of document.querySelectorAll('.pc-btn')) {
    b.addEventListener('click', () => chooseDefense(b.dataset.key));
  }
}

function chooseDefense(key) {
  const dt = DEFENSETYPES[key];
  current = deck.next(dt.diff);
  current.playType = null;
  current.defenseType = dt;
  current.typeKey = key;
  presentCard();
}

// Render the card itself — scouting (teach-then-test) on first exposure, else the question.
function presentCard() {
  const card = current.card;
  const tag = onOffense()
    ? `<div class="phase off">🏈 OFFENSE — ${esc(current.playType ? current.playType.label : 'move the ball')}</div>`
    : `<div class="phase def">🛡️ DEFENSE — ${esc(current.defenseType ? current.defenseType.label : 'get a stop')}</div>`;

  if (current.isNew) {
    $('stage').innerHTML = `
      <div class="scouting">
        ${tag}
        <div class="scouting-tag">📋 SCOUTING REPORT</div>
        <div class="q">${esc(card.question)}</div>
        ${imgHtml(card)}
        <div class="answer-reveal">Answer: <b>${esc(card.answer)}</b></div>
        <p class="explain">${esc(card.explanation)}</p>
        <button class="hike" id="hike">Run the play ▶</button>
      </div>`;
    $('hike').addEventListener('click', () => askQuestion(card, tag));
  } else {
    askQuestion(card, tag);
  }
}

// 4th down: he decides. Punt (pin them), Go for it (answer to convert), or Field goal (in range).
function fourthDownDecision() {
  const fg = inFieldGoalRange(game);
  const fgYds = distanceToGoal(game) + 17; // ~snap+hold distance, for flavor
  $('stage').innerHTML = `
    <div class="fourth">
      <div class="phase off">🏈 4TH DOWN — ${esc(downText(game))} · your call, coach</div>
      <div class="pc-grid">
        <button class="pc-btn pc-punt" data-act="punt">
          <span class="pc-label">🦵 PUNT</span><span class="pc-sub">Pin them deep, no risk</span></button>
        <button class="pc-btn pc-go" data-act="go">
          <span class="pc-label">💪 GO FOR IT</span><span class="pc-sub">Convert or turn it over</span></button>
        <button class="pc-btn pc-fg" data-act="fg" ${fg ? '' : 'disabled'}>
          <span class="pc-label">🏉 FIELD GOAL</span>
          <span class="pc-sub">${fg ? `~${fgYds} yds · 3 pts` : 'Out of range'}</span></button>
      </div>
    </div>`;
  $('stage').querySelector('[data-act="punt"]').addEventListener('click', puntPlay);
  $('stage').querySelector('[data-act="go"]').addEventListener('click', callPlay);
  const fgBtn = $('stage').querySelector('[data-act="fg"]');
  if (fg) fgBtn.addEventListener('click', fieldGoalAttempt);
}

// Punt: no question (a strategic skip). Counts as a snap so games stay finite; no token/rep.
function puntPlay() {
  punt(game);
  session.plays++;
  game.quarter = Math.min(4, 1 + Math.floor(session.plays / PLAYS_PER_Q));
  save();
  fx('🦵 PUNT AWAY');
  renderAll();
  nextPlay();
}

// Field goal: a pressure question. Right = 3 points + kickoff. Wrong = no good, turnover at spot.
function fieldGoalAttempt() {
  current = deck.next('hard');
  current.playType = null;
  current.typeKey = 'fg';
  const card = current.card;
  const tag = `<div class="phase off">🏉 FIELD GOAL — ice it</div>`;
  if (current.isNew) {
    $('stage').innerHTML = `
      <div class="scouting">
        ${tag}
        <div class="scouting-tag">📋 SCOUTING REPORT</div>
        <div class="q">${esc(card.question)}</div>
        ${imgHtml(card)}
        <div class="answer-reveal">Answer: <b>${esc(card.answer)}</b></div>
        <p class="explain">${esc(card.explanation)}</p>
        <button class="hike" id="hike">Kick it ▶</button>
      </div>`;
    $('hike').addEventListener('click', () => askFieldGoal(card, tag));
  } else {
    askFieldGoal(card, tag);
  }
}

function askFieldGoal(card, tag) {
  const opts = shuffle([...card.options]);
  $('stage').innerHTML = `
    <div class="play">
      ${tag}
      <div class="q">${esc(card.question)}</div>
      ${imgHtml(card)}
      <div class="options">
        ${opts.map(o => `<button class="opt" data-val="${escAttr(o)}">${esc(o)}</button>`).join('')}
      </div>
    </div>`;
  for (const b of document.querySelectorAll('.opt')) {
    b.addEventListener('click', () => resolveFieldGoal(card, b.dataset.val, b));
  }
}

function resolveFieldGoal(card, choice, btn) {
  const correct = choice === card.answer;
  for (const b of document.querySelectorAll('.opt')) {
    b.disabled = true;
    if (b.dataset.val === card.answer) b.classList.add('right');
    else if (b === btn) b.classList.add('wrong');
  }
  deck.record(card.id, correct);              // it's a real rep — mastery still counts
  session.plays++; career.plays++;
  if (correct) { session.correct++; career.correct++; career.tokens = (career.tokens || 0) + 1; }
  game.quarter = Math.min(4, 1 + Math.floor(session.plays / PLAYS_PER_Q));

  let banner, eventTxt;
  if (correct) {
    game.home += CONFIG.fourthDown.fgPoints;
    banner = '🏉 IT’S GOOD!'; eventTxt = `+${CONFIG.fourthDown.fgPoints} POINTS`;
    kickoffTo(game, AWAY);                     // after a score, kick off to the rival
  } else {
    banner = '😬 NO GOOD'; eventTxt = `${TEAMS.away.abbr} BALL`;
    turnoverAtSpot(game);                      // missed kick: rival takes over at the spot
  }
  save();
  turfFx(correct ? 'fd' : 'shake');
  renderAll();
  const coaching = correct ? ''
    : `<p class="coaching">✅ Correct answer: <b>${esc(card.answer)}</b><br>${esc(card.explanation)}</p>`;
  $('stage').innerHTML = `
    <div class="result ${correct ? 'good' : 'bad'}">
      <div class="banner">${banner}</div>
      <div class="event">${eventTxt}</div>
      ${coaching}
      <button class="hike" id="continue">Next ▶</button>
    </div>`;
  $('continue').addEventListener('click', () => { if (session.plays >= GAME_PLAYS) return endGame(false); renderAll(); nextPlay(); });
}

function askQuestion(card, tag) {
  const opts = shuffle([...card.options]);
  $('stage').innerHTML = `
    <div class="play">
      ${tag}
      <div class="q">${esc(card.question)}</div>
      ${imgHtml(card)}
      <div class="options">
        ${opts.map(o => `<button class="opt" data-val="${escAttr(o)}">${esc(o)}</button>`).join('')}
      </div>
    </div>`;
  for (const b of document.querySelectorAll('.opt')) {
    b.addEventListener('click', () => answer(card, b.dataset.val, b));
  }
}

function answer(card, choice, btn) {
  const correct = choice === card.answer;
  const offense = onOffense();
  for (const b of document.querySelectorAll('.opt')) {
    b.disabled = true;
    if (b.dataset.val === card.answer) b.classList.add('right');
    else if (b === btn) b.classList.add('wrong');
  }

  deck.record(card.id, correct); // mastery reflects whether HE knew it, regardless of side

  // Player upgrades only make YOUR good plays bigger (offense). Never affects failures.
  const boost = offense ? Math.min(0.6, ((career.upgrades.speed || 0) + (career.upgrades.power || 0)) * 0.1) : 0;
  // On defense the opponent's play is the inverse of his answer: he's right -> they're stuffed.
  const play = resolvePlay(offense ? correct : !correct, { boost, playType: offense ? current.playType : current.defenseType });
  // A turnover (offense interception OR defensive forced fumble) flips possession regardless of down.
  const event = play.turnover ? 'turnover' : advance(game, play.yards);

  session.plays++; career.plays++;
  if (correct) { session.correct++; career.correct++; career.tokens = (career.tokens || 0) + 1; } // 1 token per right answer
  if (offense && play.yards > 0) session.offYards += play.yards;
  game.quarter = Math.min(4, 1 + Math.floor(session.plays / PLAYS_PER_Q));
  save();
  // ball-carrier sprints the gained distance: swap the ball for a running player while it slides
  const ballEl = $('ball');
  ballEl.textContent = '🏃';
  ballEl.classList.add('running');
  renderAll();
  setTimeout(() => { ballEl.textContent = '🏈'; ballEl.classList.remove('running'); }, 650);
  juice(offense, play, event);
  showResult({ card, correct, offense, play, event });
}

// on-field juice
function juice(offense, play, event) {
  if (event === 'touchdown') { fx(offense ? pickOne(CELEB.touchdown) : `${TEAMS.away.abbr} TD`); turfFx('td'); }
  else if (event === 'turnover') { fx(offense ? '⛔ TURNOVER' : pickOne(CELEB.ballBack)); turfFx('shake'); }
  else if (event === 'first_down') { if (offense) fx(pickOne(CELEB.firstDown)); turfFx('fd'); }
  else if (play.yards < 0) { turfFx('shake'); }
  else if (play.tier === 'breakaway') { fx(pickOne(CELEB.breakaway)); }
}
function fx(text) {
  if (!text) return;
  const el = $('fx');
  el.textContent = text;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}
function turfFx(cls) {
  const t = $('turf');
  t.classList.add(cls);
  setTimeout(() => t.classList.remove(cls), cls === 'shake' ? 420 : 850);
}

function showResult({ card, correct, offense, play, event }) {
  let banner, eventTxt = '', yardsTxt;
  if (offense) {
    banner = correct ? '✅ ' + play.label : '🚓 ' + play.label;
    yardsTxt = (play.yards >= 0 ? '+' : '') + play.yards + ' yds';
    eventTxt = { touchdown: '🏈 TOUCHDOWN!', first_down: 'FIRST DOWN',
                 turnover: play.turnover ? '🎯 INTERCEPTED — BALL BACK!' : '⛔ TURNOVER ON DOWNS', play: '' }[event];
  } else {
    banner = correct ? '🛡️ ' + play.label : '😱 ' + TEAMS.away.abbr + ' ' + play.label;
    yardsTxt = correct ? `${TEAMS.away.abbr} held to ${play.yards}` : `${TEAMS.away.abbr} gain +${play.yards}`;
    eventTxt = { touchdown: `💢 ${TEAMS.away.abbr} TOUCHDOWN`, first_down: `${TEAMS.away.abbr} first down`,
                 turnover: play.turnover ? '💥 FORCED FUMBLE — TAKEAWAY!' : '🚨 STOP ON DOWNS — YOUR BALL!', play: '' }[event];
  }
  const coaching = correct ? ''
    : `<p class="coaching">✅ Correct answer: <b>${esc(card.answer)}</b><br>${esc(card.explanation)}</p>`;
  $('stage').innerHTML = `
    <div class="result ${correct ? 'good' : 'bad'}">
      <div class="banner">${banner}</div>
      <div class="yards">${yardsTxt}</div>
      ${eventTxt ? `<div class="event">${eventTxt}</div>` : ''}
      ${coaching}
      <button class="hike" id="continue">Next ▶</button>
    </div>`;
  $('continue').addEventListener('click', () => continueAfter(event));
}

function continueAfter(event) {
  if (session.plays >= GAME_PLAYS) return endGame(false);
  const who = game.poss; // team that just had the ball
  if (event === 'touchdown') {
    if (who === HOME) return patDecision();      // user's TD -> the mini-game
    game.away += CONFIG.pat.kickPoints;          // opponent's automatic extra point
    save(); renderAll();
    kickoffTo(game, HOME);
    renderAll();
    return nextPlay();
  }
  if (event === 'turnover') turnoverAtSpot(game);
  // first_down / play => same possession continues
  renderAll();
  nextPlay();
}

// ---------- PAT mini-game (after the user's touchdown) ----------
function patDecision() {
  $('stage').innerHTML = `
    <div class="pat">
      <div class="phase off">🏈 TOUCHDOWN! +6 · your call</div>
      <div class="uprights"><span class="post l"></span><span class="post r"></span><span class="bar"></span></div>
      <div class="pc-grid">
        <button class="pc-btn pc-go" data-pat="kick">
          <span class="pc-label">🦵 KICK PAT</span><span class="pc-sub">Easy question · +1</span></button>
        <button class="pc-btn pc-bomb" data-pat="two">
          <span class="pc-label">💪 GO FOR 2</span><span class="pc-sub">Hard question · +2</span></button>
      </div>
    </div>`;
  $('stage').querySelector('[data-pat="kick"]').addEventListener('click', () => patAttempt('kick'));
  $('stage').querySelector('[data-pat="two"]').addEventListener('click', () => patAttempt('two'));
}

function patAttempt(kind) {
  const diff = kind === 'kick' ? CONFIG.pat.kickDiff : CONFIG.pat.twoDiff;
  current = deck.next(diff);
  current.playType = null;
  current.typeKey = 'pat-' + kind;
  const card = current.card;
  const tag = `<div class="phase off">${kind === 'kick' ? '🦵 EXTRA POINT — ice it' : '💪 TWO-POINT TRY'}</div>`;
  if (current.isNew) {
    $('stage').innerHTML = `
      <div class="scouting">
        ${tag}
        <div class="scouting-tag">📋 SCOUTING REPORT</div>
        <div class="q">${esc(card.question)}</div>
        ${imgHtml(card)}
        <div class="answer-reveal">Answer: <b>${esc(card.answer)}</b></div>
        <p class="explain">${esc(card.explanation)}</p>
        <button class="hike" id="hike">${kind === 'kick' ? 'Kick it ▶' : 'Go for it ▶'}</button>
      </div>`;
    $('hike').addEventListener('click', () => askPatCard(card, tag, kind));
  } else {
    askPatCard(card, tag, kind);
  }
}

function askPatCard(card, tag, kind) {
  const opts = shuffle([...card.options]);
  $('stage').innerHTML = `
    <div class="play">
      ${tag}
      <div class="q">${esc(card.question)}</div>
      ${imgHtml(card)}
      <div class="options">
        ${opts.map(o => `<button class="opt" data-val="${escAttr(o)}">${esc(o)}</button>`).join('')}
      </div>
    </div>`;
  for (const b of document.querySelectorAll('.opt')) {
    b.addEventListener('click', () => resolvePat(card, b.dataset.val, b, kind));
  }
}

function resolvePat(card, choice, btn, kind) {
  const correct = choice === card.answer;
  for (const b of document.querySelectorAll('.opt')) {
    b.disabled = true;
    if (b.dataset.val === card.answer) b.classList.add('right');
    else if (b === btn) b.classList.add('wrong');
  }
  deck.record(card.id, correct);             // a real rep — mastery still counts
  session.plays++; career.plays++;
  if (correct) { session.correct++; career.correct++; career.tokens = (career.tokens || 0) + 1; }
  const pts = kind === 'kick' ? CONFIG.pat.kickPoints : CONFIG.pat.twoPoints;
  if (correct) game.home += pts;
  game.quarter = Math.min(4, 1 + Math.floor(session.plays / PLAYS_PER_Q));
  save();

  const banner = correct
    ? (kind === 'kick' ? '🏉 IT’S GOOD!' : `💪 TWO-POINT CONVERSION!`)
    : (kind === 'kick' ? '😬 NO GOOD' : '🛑 STUFFED');
  const kickFx = `<div class="uprights"><span class="post l"></span><span class="post r"></span><span class="bar"></span>
                    <span class="kickball ${correct ? 'good' : 'miss'}">🏈</span></div>`;
  const coaching = correct ? ''
    : `<p class="coaching">✅ Correct answer: <b>${esc(card.answer)}</b><br>${esc(card.explanation)}</p>`;
  $('stage').innerHTML = `
    <div class="result ${correct ? 'good' : 'bad'}">
      <div class="banner">${banner}</div>
      ${kickFx}
      <div class="event">${correct ? '+' + pts + ' POINTS' : 'NO POINTS'}</div>
      ${coaching}
      <button class="hike" id="continue">Next ▶</button>
    </div>`;
  turfFx(correct ? 'fd' : 'shake');
  renderAll();
  $('continue').addEventListener('click', () => {
    if (session.plays >= GAME_PLAYS) return endGame(false);
    kickoffTo(game, AWAY);   // after the score, kick off to the rival
    renderAll();
    nextPlay();
  });
}

// ---------- end / summary ----------
function endGame(manual) {
  game.quarter = 5;
  career.games++;
  if (game.home > game.away) career.wins++;
  else if (game.home < game.away) career.losses++;
  else career.ties++;
  save();
  renderAll();
  const acc = session.plays ? Math.round((session.correct / session.plays) * 100) : 0;
  const result = game.home > game.away ? '🏆 You win!' : game.home < game.away ? 'Tough loss' : 'Tie game';
  $('summary-body').innerHTML = `
    <h2>${result}</h2>
    <div style="text-align:center;font-size:26px;font-weight:900;margin-bottom:12px">
      ${TEAMS.home.abbr} ${game.home} — ${game.away} ${TEAMS.away.abbr}</div>
    <ul class="statline">
      <li><span>Snaps played</span><b>${session.plays}</b></li>
      <li><span>Answered right</span><b>${session.correct} (${acc}%)</b></li>
      <li><span>Offense yards</span><b>${session.offYards}</b></li>
    </ul>
    <div class="ovr-final">QB rating <b>${ovr()}</b> · ${deck.masteredCount()}/${deck.cards.length} rules mastered</div>`;
  $('summary').hidden = false;
  $('summary-close').textContent = '🏠 Home';
  $('summary-close').onclick = showHome;
}

// ---------- helpers ----------
function imgHtml(card) { return card.image ? `<img class="sign" src="${IMG_BASE}${card.image}" alt="">` : ''; }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function escAttr(s) { return esc(s).replace(/'/g, '&#39;'); }

init().catch(err => { $('stage').innerHTML = `<p style="color:#fbb">Failed to start: ${esc(err.message)}</p>`; });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
