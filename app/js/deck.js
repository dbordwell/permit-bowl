// deck.js — loads the verified card deck and runs the hidden learning engine:
// deck-position spaced repetition (reps, not clock) + difficulty-gated introduction
// + teach-then-test on first exposure. The football game never sees any of this.

const GAPS = [2, 4, 8, 16, 32, 64]; // reps before a card returns, indexed by box level
export const MASTERY_BOX = 4;       // box >= 4 == "mastered" (survived several spaced recalls)
const DIFF_ORDER = { easy: 0, medium: 1, hard: 2 };

export async function loadCards(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load cards (${res.status})`);
  return res.json();
}

export class Deck {
  constructor(cards, saved = null) {
    this.cards = cards;
    this.pos = saved?.pos ?? 0; // global rep counter — this is our "clock" (counts plays, not time)
    this.state = {};
    for (const c of cards) {
      this.state[c.id] =
        saved?.state?.[c.id] ?? { seen: false, box: 0, streak: 0, dueAt: 0, correct: 0, wrong: 0 };
    }
  }

  masteredCount() { return this.cards.filter(c => this.state[c.id].box >= MASTERY_BOX).length; }
  masteryPct() { return this.cards.length ? this.masteredCount() / this.cards.length : 0; }
  seenCount() { return this.cards.filter(c => this.state[c.id].seen).length; }

  // Choose the next card. `pref` ('easy'|'medium'|'hard'|null) is a SOFT play-call preference:
  // due cards are always served (no dodging hard material) — pref only chooses among matches and
  // orders new-card introduction. Bias: keep a small review backlog, else introduce easy-first.
  next(pref = null) {
    const due = this.cards
      .filter(c => this.state[c.id].seen && this.state[c.id].dueAt <= this.pos)
      .sort((a, b) => this.state[a.id].dueAt - this.state[b.id].dueAt);

    if (due.length < 3) {
      const fresh = this.cards
        .filter(c => !this.state[c.id].seen)
        .sort((a, b) => (DIFF_ORDER[a.difficulty] ?? 1) - (DIFF_ORDER[b.difficulty] ?? 1));
      if (fresh.length) {
        const pick = (pref && fresh.find(c => c.difficulty === pref)) || fresh[0];
        return { card: pick, isNew: true };
      }
    }
    if (due.length) {
      const pick = (pref && due.find(c => c.difficulty === pref)) || due[0];
      return { card: pick, isNew: false };
    }
    // nothing due and nothing new — replay the soonest-due so play never stalls
    const soon = [...this.cards].sort((a, b) => this.state[a.id].dueAt - this.state[b.id].dueAt)[0];
    return { card: soon, isNew: false };
  }

  // Record an answer: advance the rep counter and reschedule via expanding/!collapsing lags.
  record(cardId, correct) {
    this.pos += 1;
    const s = this.state[cardId];
    s.seen = true;
    if (correct) {
      s.correct++; s.streak++;
      s.box = Math.min(s.box + 1, GAPS.length - 1);
    } else {
      s.wrong++; s.streak = 0;
      s.box = Math.max(0, s.box - 1);
    }
    s.dueAt = this.pos + (correct ? GAPS[s.box] : 2); // a miss brings it back soon
  }

  serialize() { return { pos: this.pos, state: this.state }; }
}
