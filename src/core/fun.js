/**
 * core/fun.js — the mission control nonsense, kept in one honest place.
 *
 * A tool that waits a lot should look alive. A tool that lies is worse than a tool that looks dead.
 * So every line in this file is **labelled as fun** everywhere it appears: the popup tags it `fun`, the
 * installer prints it with a `·` and a different colour, and the terminal header says BARBOS MODE so
 * nobody mistakes a joke about Pluto's laser for a real progress report.
 *
 * House rules for this file, because a joke can still be a bug:
 *   1. no line may claim a real action happened ("files written", "host connected");
 *   2. no line may imply the user's data was sent anywhere — this product has no network of its own;
 *   3. nothing about credentials, keys or the audit log, ever, even as a joke;
 *   4. keep them short; a ticker that wraps is a layout bug with a punchline.
 */
(() => {
  'use strict';
  const MDH = globalThis.MDH;

  /** The space programme this product definitely does not have. */
  const MISSION = [
    'contacting the aliens on the Moon…',
    'Moon aliens are on a call. Holding.',
    'Moon aliens asked if we have a NASA PC. We said no.',
    'taking data from Mars…',
    'waiting for data from Mars (light delay: 12 minutes, patience: less)',
    'Mars says the data is on its way. Mars is lying.',
    'routing packets through Apollo 11…',
    'Apollo 11 has no route to host. Actually, no host at all.',
    'asking Sputnik 1 for directions. Sputnik is 1957 years old in satellite years.',
    'Sputnik answered. It only says "beep".',
    'calibrating the satellite dish with a coat hanger…',
    'satellite is down. It has been down since Tuesday.',
    'satellite is up. It is just not talking to us.',
    'repointing the dish at Jupiter…',
    'Jupiter declined the connection. Too much interference.',
    'sending a polite missile to Jupiter (it is a paper plane)…',
    'Jupiter missile returned to sender. Postage due.',
    'setting up the laser weapon on Pluto…',
    'Pluto laser at 12 %. Pluto is far. Pluto is also no longer a planet, but it keeps the laser.',
    'Pluto laser charged. Do not point at the Moon aliens.',
    'calling the aliens back…',
    'the aliens left a voicemail. It is 45 minutes long and starts with "so anyway".',
    'translating the voicemail from radio bursts…',
    'the voicemail was a fax. We are now decoding a fax from 1974.',
    'aligning the telescope with the router…',
    'turning it off and on again, but in orbit…',
    'rebooting the cosmic microwave background…',
    'defragmenting the asteroid belt…',
    'the asteroid belt was already defragmented, thank you',
    'recalibrating the quantum modem…',
    'the quantum modem is both connected and not connected',
    'waiting for a reply from Voyager 1. It left in 1977, like our patience.',
    'Voyager 1 replied "brb". That was 22 hours ago.',
    'checking the ISS for a spare Ethernet cable…',
    'the ISS says the cable is behind the fridge',
    'sending a strongly worded email to the black hole…',
    'the black hole read it. The black hole read everything.',
    'using the Sun as a heatsink. It is warm, but it works.',
    'borrowing bandwidth from a passing comet…',
    'the comet charges roaming fees',
    'asking the Moon for a status update…',
    'the Moon says it is fine and asks about you',
    'deploying the solar sail. It is a bedsheet.',
  ];

  /** Loading-screen wisdom, for moments when progress is genuinely invisible. */
  const QUOTES = [
    'Any sufficiently advanced tool is indistinguishable from magic, until it throws a stack trace.',
    'Space is hard. Websites are harder: they change their DOM on Tuesdays.',
    'The developer does not have a NASA PC. He has one laptop and a cat with keyboard access.',
    'A satellite is just a server that forgot to come back down.',
    'There is no cloud. It is someone else\'s computer — except here, where it is your computer.',
    'Sputnik transmitted for 21 days. This extension has to survive a Tuesday redesign.',
    'The first bug was a moth in a relay in 1947. Ours is usually a renamed CSS class.',
    'Two hard things in computing: cache invalidation, naming, and off-by-one errors.',
    'If it works on the first try, check that you actually ran it.',
    'The missile is fake. The shell command is real. Read the approval card.',
    'Patience is cheaper than a rate-limit ban. This is the whole architecture.',
    'Pluto is not a planet, but it is still on the network. Classifications are like APIs.',
    'A laser on Pluto has excellent range and terrible latency.',
    'Do not panic. Panic is a background process that eats all the CPU.',
    'The aliens are not coming. If they were, they would have to support Firefox first.',
  ];

  /** Extra flavour for the barbo log, so a real event and a joke never look alike. */
  const TAGS = ['FUN', 'MOON', 'MARS', 'JUPITER', 'PLUTO', 'DEEP SPACE'];

  const pick = (list, i) => list[Math.abs(Math.floor(i)) % list.length];

  /** Deterministic so tests never flake, and so a reload does not repeat the same joke twice. */
  function missionAt(index) {
    return pick(MISSION, index);
  }

  function quoteAt(index) {
    return pick(QUOTES, index);
  }

  /**
   * Rotate lines into a node. Returns a stop function.
   * Respects prefers-reduced-motion (static line instead of churn) and pauses in a hidden tab.
   */
  function rotate(node, { pool = MISSION, everyMs = 2600, startAt = 0, onChange } = {}) {
    if (!node) return () => {};
    let index = startAt;
    let timer = null;
    const reduced = matchMediaSafe('(prefers-reduced-motion: reduce)');

    const step = () => {
      node.textContent = pick(pool, index);
      onChange?.(index);
      index += 1;
    };

    step();
    if (reduced) return () => {};

    const tick = () => {
      if (document.visibilityState === 'visible') step();
      timer = setTimeout(tick, everyMs);
    };
    timer = setTimeout(tick, everyMs);

    return () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
  }

  function matchMediaSafe(query) {
    try {
      return globalThis.matchMedia?.(query).matches === true;
    } catch {
      return false;
    }
  }

  MDH.fun = {
    MISSION,
    QUOTES,
    TAGS,
    missionAt,
    quoteAt,
    rotate,
    tagAt: (index) => pick(TAGS, index),
    /** One line for the in-page chip: short, tagged, obviously not a status. */
    chip: (index) => `☾ ${missionAt(index)}`,
  };
})();
