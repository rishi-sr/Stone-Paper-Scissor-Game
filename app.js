'use strict';

// ---------- Rules ----------
const MOVES = {
    stone: { name: 'Stone', beats: 'scissors', verb: 'crushes' },
    paper: { name: 'Paper', beats: 'stone', verb: 'covers' },
    scissors: { name: 'Scissors', beats: 'paper', verb: 'cut' },
};
const MOVE_KEYS = Object.keys(MOVES);
const KEY_TO_MOVE = { 1: 'stone', 2: 'paper', 3: 'scissors' };
const FORMATS = [3, 5, 7, 0]; // 0 = endless

const outcome = (you, cpu) => {
    if (you === cpu) return 'draw';
    return MOVES[you].beats === cpu ? 'win' : 'lose';
};
const counterTo = (move) => MOVE_KEYS.find((key) => MOVES[key].beats === move);
const randomMove = () => MOVE_KEYS[Math.floor(Math.random() * MOVE_KEYS.length)];
const explain = (winner, loser) => `${MOVES[winner].name} ${MOVES[winner].verb} ${loser}.`;
const winsNeeded = (format) => (format ? Math.ceil(format / 2) : Infinity);
const lower = (move) => MOVES[move].name.toLowerCase();

// ---------- Storage (fails quietly in private mode) ----------
const store = {
    load(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
        } catch {
            return { ...fallback };
        }
    },
    save(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch {
            /* storage unavailable */
        }
    },
};

const DEFAULT_STATS = { matchesPlayed: 0, matchesWon: 0, roundsWon: 0, roundsLost: 0, roundsDrawn: 0, bestStreak: 0 };
const settings = store.load('sps.settings', { format: 5, opponent: 'adaptive', sound: true });
settings.format = FORMATS.includes(Number(settings.format)) ? Number(settings.format) : 5;
if (!['adaptive', 'random'].includes(settings.opponent)) settings.opponent = 'adaptive';
let stats = store.load('sps.stats', DEFAULT_STATS);

// ---------- State ----------
const session = { playerMoves: [], streak: 0 };
let match;
let busy = false;

const newMatch = () => ({
    format: settings.format,
    opponent: settings.opponent,
    you: 0,
    cpu: 0,
    rounds: [],
    reads: 0,
    hits: 0,
    over: false,
});

// ---------- Elements ----------
const $ = (id) => document.getElementById(id);
const els = {
    arena: $('arena'),
    youRing: $('youRing'),
    cpuRing: $('cpuRing'),
    youGlyph: $('youGlyph'),
    cpuGlyph: $('cpuGlyph'),
    cpuScan: $('cpuScan'),
    youScore: $('youScore'),
    cpuScore: $('cpuScore'),
    youPips: $('youPips'),
    cpuPips: $('cpuPips'),
    roundLabel: $('roundLabel'),
    formatLabel: $('formatLabel'),
    headline: $('headline'),
    ruleLine: $('ruleLine'),
    readout: $('readout'),
    status: $('status'),
    pad: $('pad'),
    moves: document.querySelectorAll('.move'),
    history: $('history'),
    soundBtn: $('soundBtn'),
    rulesDialog: $('rulesDialog'),
    setupDialog: $('setupDialog'),
    setupForm: $('setupForm'),
    formatHint: $('formatHint'),
    resetStats: $('resetStats'),
    overDialog: $('overDialog'),
};

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- Machine opponent ----------
// Blends three guesses about your next move: overall habit, what you play
// after your last move, and what you play after your last two moves.
function predictNext(history) {
    const n = history.length;
    const blend = { stone: 0, paper: 0, scissors: 0 };
    let weightUsed = 0;
    const tally = () => ({ stone: 0, paper: 0, scissors: 0 });
    const mix = (counts, weight) => {
        const sum = counts.stone + counts.paper + counts.scissors;
        if (!sum) return;
        const w = weight * Math.min(1, sum / 4); // trust sparse patterns less
        MOVE_KEYS.forEach((m) => { blend[m] += (w * counts[m]) / sum; });
        weightUsed += w;
    };

    const habit = tally();
    history.slice(-20).forEach((m) => { habit[m]++; });
    mix(habit, 1);

    const afterLast = tally();
    for (let i = 1; i < n; i++) {
        if (history[i - 1] === history[n - 1]) afterLast[history[i]]++;
    }
    mix(afterLast, 2);

    const afterPair = tally();
    for (let i = 2; i < n; i++) {
        if (history[i - 2] === history[n - 2] && history[i - 1] === history[n - 1]) afterPair[history[i]]++;
    }
    mix(afterPair, 3);

    return MOVE_KEYS
        .map((move) => ({ move, p: blend[move] / weightUsed + Math.random() * 1e-6 }))
        .sort((a, b) => b.p - a.p)[0];
}

// Called before the machine learns your current move, so it can't cheat.
function machinePick(history) {
    if (match.opponent === 'random') return { move: randomMove(), note: 'random' };
    if (history.length < 3) return { move: randomMove(), note: 'learning' };
    const guess = predictNext(history);
    if (guess.p < 0.42 || Math.random() < 0.15) return { move: randomMove(), note: 'unsure' };
    return { move: counterTo(guess.move), note: 'predicted', guess };
}

function readoutFor(pick, you) {
    switch (pick.note) {
        case 'random':
            return 'The machine picked at random.';
        case 'learning':
            return 'The machine is still studying your moves.';
        case 'unsure':
            return "The machine couldn't read you, so it guessed.";
        default: {
            const pct = Math.round(pick.guess.p * 100);
            const right = pick.guess.move === you;
            return `The machine predicted <strong>${lower(pick.guess.move)}</strong> (${pct}% sure) and was ${right ? 'right' : 'wrong'}.`;
        }
    }
}

// ---------- Sound and vibration ----------
const sfx = (() => {
    let ctx;
    const ensure = () => {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        if (!ctx) ctx = new AC();
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    };
    const play = (notes) => {
        if (!settings.sound) return;
        const c = ensure();
        if (!c) return;
        const now = c.currentTime;
        notes.forEach(([freq, at, dur, type = 'triangle', peak = 0.07]) => {
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = type;
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.0001, now + at);
            gain.gain.exponentialRampToValueAtTime(peak, now + at + 0.012);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + at + dur);
            osc.connect(gain).connect(c.destination);
            osc.start(now + at);
            osc.stop(now + at + dur + 0.02);
        });
    };
    return {
        tap: () => play([[620, 0, 0.05, 'square', 0.025]]),
        tick: (i) => play([[300 + i * 90, 0, 0.09, 'triangle', 0.06]]),
        win: () => play([[523, 0, 0.12], [659, 0.08, 0.12], [784, 0.16, 0.22]]),
        lose: () => play([[392, 0, 0.14, 'sawtooth', 0.03], [294, 0.12, 0.26, 'sawtooth', 0.03]]),
        draw: () => play([[440, 0, 0.1], [440, 0.14, 0.12]]),
        victory: () => play([[523, 0, 0.14], [659, 0.1, 0.14], [784, 0.2, 0.14], [1047, 0.3, 0.4]]),
        defeat: () => play([[330, 0, 0.2, 'sawtooth', 0.03], [262, 0.18, 0.2, 'sawtooth', 0.03], [196, 0.36, 0.45, 'sawtooth', 0.03]]),
    };
})();

const buzz = (pattern) => {
    if (!settings.sound || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch { /* not supported */ }
};

// ---------- Motion ----------
const scan = els.cpuScan.animate(
    [{ transform: 'rotate(0turn)' }, { transform: 'rotate(1turn)' }],
    { duration: 14000, iterations: Infinity },
);
if (reduceMotion.matches) scan.pause();
const setScanSpeed = (rate) => {
    if (!reduceMotion.matches) scan.updatePlaybackRate(rate);
};

const animate = (el, frames, options) => {
    if (!reduceMotion.matches) el.animate(frames, options);
};
const pump = () => {
    [els.youRing, els.cpuRing].forEach((ring) => animate(ring,
        [{ transform: 'translateY(0)' }, { transform: 'translateY(8px)', offset: 0.4 }, { transform: 'translateY(0)' }],
        { duration: 240, easing: 'ease-out' }));
};
const pop = (el) => animate(el,
    [{ transform: 'scale(.55)', opacity: 0 }, { transform: 'scale(1.08)', opacity: 1, offset: 0.6 }, { transform: 'scale(1)' }],
    { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
const burst = (ring) => animate(ring.querySelector('.ring-burst'),
    [{ transform: 'scale(.9)', opacity: 0.9 }, { transform: 'scale(1.4)', opacity: 0 }],
    { duration: 700, easing: 'ease-out' });

// ---------- Rendering ----------
const setGlyph = (svg, id) => svg.querySelector('use').setAttribute('href', `#g-${id}`);

function renderPips(container, score, needed) {
    container.replaceChildren();
    if (!Number.isFinite(needed)) return;
    for (let i = 0; i < needed; i++) {
        const pip = document.createElement('span');
        pip.className = `pip${i < score ? ' is-on' : ''}`;
        container.append(pip);
    }
}

function renderScore() {
    const needed = winsNeeded(match.format);
    els.youScore.textContent = match.you;
    els.cpuScore.textContent = match.cpu;
    renderPips(els.youPips, match.you, needed);
    renderPips(els.cpuPips, match.cpu, needed);
    els.roundLabel.textContent = match.over ? 'Match over' : `Round ${match.rounds.length + 1}`;
    els.formatLabel.textContent = match.format
        ? `Best of ${match.format}, first to ${needed} wins`
        : 'Endless match';
}

function renderHistory() {
    const recent = match.rounds.slice(-12);
    els.history.replaceChildren(...recent.map((round, i) => {
        const li = document.createElement('li');
        const number = match.rounds.length - recent.length + i + 1;
        const word = { win: 'won', lose: 'lost', draw: 'draw' }[round.result];
        li.className = `chip chip--${round.result}`;
        li.title = `Round ${number}: ${lower(round.you)} vs ${lower(round.cpu)}, ${word}`;
        li.setAttribute('aria-label', li.title);
        return li;
    }));
    els.history.parentElement.classList.toggle('has-rounds', recent.length > 0);
}

function renderIntro() {
    els.arena.dataset.state = 'idle';
    els.arena.dataset.result = '';
    setGlyph(els.youGlyph, 'idle-you');
    setGlyph(els.cpuGlyph, 'idle-cpu');
    els.headline.textContent = 'Choose your move';
    els.ruleLine.textContent = 'Stone crushes scissors, scissors cut paper, paper covers stone.';
    els.readout.textContent = match.opponent === 'adaptive'
        ? 'This machine learns your habits as you play.'
        : 'This machine picks every move at random.';
}

function setBusy(on, picked) {
    busy = on;
    els.pad.setAttribute('aria-busy', String(on));
    els.moves.forEach((btn) => {
        btn.classList.toggle('is-picked', on && btn.dataset.move === picked);
        btn.setAttribute('aria-disabled', String(on));
    });
}

// ---------- Game flow ----------
function startMatch() {
    match = newMatch();
    setBusy(false);
    renderScore();
    renderHistory();
    renderIntro();
}

async function play(you) {
    if (busy || match.over || document.querySelector('dialog[open]')) return;

    const pick = machinePick(session.playerMoves);
    const cpu = pick.move;
    session.playerMoves.push(you);

    setBusy(true, you);
    sfx.tap();
    buzz(10);

    // Countdown: "Stone… Paper… Scissors…"
    els.arena.dataset.result = '';
    els.arena.dataset.state = 'throwing';
    setGlyph(els.youGlyph, 'idle-you');
    setGlyph(els.cpuGlyph, 'idle-cpu');
    els.ruleLine.textContent = ' ';
    els.readout.textContent = '';
    setScanSpeed(14);
    const beat = reduceMotion.matches ? 140 : 300;
    for (const [i, key] of MOVE_KEYS.entries()) {
        els.headline.textContent = `${MOVES[key].name}…`;
        sfx.tick(i);
        pump();
        await wait(beat);
    }
    setScanSpeed(1);

    // Reveal
    const result = outcome(you, cpu);
    els.arena.dataset.state = 'revealed';
    els.arena.dataset.result = result;
    setGlyph(els.youGlyph, you);
    setGlyph(els.cpuGlyph, cpu);
    pop(els.youGlyph);
    pop(els.cpuGlyph);

    match.rounds.push({ you, cpu, result });
    if (pick.note === 'predicted') {
        match.reads++;
        if (pick.guess.move === you) match.hits++;
    }

    if (result === 'win') {
        match.you++;
        stats.roundsWon++;
        session.streak++;
        stats.bestStreak = Math.max(stats.bestStreak, session.streak);
        els.headline.textContent = 'You take the round';
        els.ruleLine.textContent = explain(you, cpu);
        burst(els.youRing);
        sfx.win();
        buzz([20, 40, 20]);
    } else if (result === 'lose') {
        match.cpu++;
        stats.roundsLost++;
        session.streak = 0;
        els.headline.textContent = 'The machine takes the round';
        els.ruleLine.textContent = explain(cpu, you);
        burst(els.cpuRing);
        sfx.lose();
        buzz(70);
    } else {
        stats.roundsDrawn++;
        els.headline.textContent = 'Draw';
        els.ruleLine.textContent = `You both chose ${lower(you)}. Draws don't score.`;
        sfx.draw();
        buzz(15);
    }
    els.readout.innerHTML = readoutFor(pick, you);
    els.status.textContent = `${els.headline.textContent}. ${els.ruleLine.textContent} Score: you ${match.you}, machine ${match.cpu}.`;

    const needed = winsNeeded(match.format);
    if (match.you >= needed || match.cpu >= needed) {
        match.over = true;
        stats.matchesPlayed++;
        if (match.you > match.cpu) stats.matchesWon++;
    }
    store.save('sps.stats', stats);
    renderScore();
    renderHistory();

    if (match.over) {
        await wait(reduceMotion.matches ? 500 : 1100);
        openMatchOver();
        return; // the pad stays locked until a new match starts
    }
    setBusy(false);
}

// ---------- Dialogs ----------
function openDialog(dialog) {
    dialog.returnValue = '';
    dialog.showModal();
}

function favouriteMove(rounds) {
    const counts = {};
    rounds.forEach(({ you }) => { counts[you] = (counts[you] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function openMatchOver() {
    const won = match.you > match.cpu;
    const title = $('overTitle');
    title.textContent = won ? 'You won the match' : 'The machine won the match';
    title.className = `over-title ${won ? 'is-win' : 'is-lose'}`;
    $('overYou').textContent = match.you;
    $('overCpu').textContent = match.cpu;

    const rows = [
        ['Rounds played', match.rounds.length],
        ['Draws', match.rounds.filter((r) => r.result === 'draw').length],
        ['Your most-played move', MOVES[favouriteMove(match.rounds)].name],
    ];
    if (match.reads > 0) {
        rows.push(['Machine predictions that were right', `${match.hits} of ${match.reads}`]);
    }
    $('overStats').replaceChildren(...rows.map(([label, value]) => {
        const row = document.createElement('div');
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = label;
        dd.textContent = value;
        row.append(dt, dd);
        return row;
    }));

    if (won) { sfx.victory(); buzz([30, 50, 30, 50, 60]); } else { sfx.defeat(); buzz([120]); }
    openDialog(els.overDialog);
}

function updateFormatHint() {
    const format = Number(els.setupForm.elements.format.value);
    els.formatHint.textContent = format
        ? `First to ${winsNeeded(format)} round wins takes the match. Draws don't count.`
        : 'No finish line. Play as many rounds as you like.';
}

function renderRecord() {
    const rounds = stats.roundsWon + stats.roundsLost + stats.roundsDrawn;
    $('statMatches').textContent = `${stats.matchesWon} of ${stats.matchesPlayed}`;
    $('statRounds').textContent = rounds
        ? `${Math.round((stats.roundsWon / rounds) * 100)}% of ${rounds}`
        : 'No rounds yet';
    $('statStreak').textContent = stats.bestStreak;
}

function openSetup() {
    els.setupForm.elements.format.value = String(settings.format);
    els.setupForm.elements.opponent.value = settings.opponent;
    updateFormatHint();
    renderRecord();
    els.resetStats.classList.remove('is-armed');
    els.resetStats.textContent = 'Reset record';
    openDialog(els.setupDialog);
}

// Clicking the dimmed backdrop closes a dialog
document.querySelectorAll('dialog').forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close('cancel');
    });
});

els.setupDialog.addEventListener('close', () => {
    if (els.setupDialog.returnValue === 'start') {
        settings.format = Number(els.setupForm.elements.format.value);
        settings.opponent = els.setupForm.elements.opponent.value;
        store.save('sps.settings', settings);
        startMatch();
    } else if (match.over) {
        startMatch();
    }
});

els.overDialog.addEventListener('close', () => {
    if (els.overDialog.returnValue === 'setup') openSetup();
    else startMatch();
});

els.setupForm.addEventListener('change', (event) => {
    if (event.target.name === 'format') updateFormatHint();
});

els.resetStats.addEventListener('click', () => {
    if (!els.resetStats.classList.contains('is-armed')) {
        els.resetStats.classList.add('is-armed');
        els.resetStats.textContent = 'Tap again to erase your record';
        return;
    }
    stats = { ...DEFAULT_STATS };
    session.streak = 0;
    store.save('sps.stats', stats);
    renderRecord();
    els.resetStats.classList.remove('is-armed');
    els.resetStats.textContent = 'Record erased';
});

// ---------- Input ----------
els.moves.forEach((btn) => {
    btn.addEventListener('click', () => play(btn.dataset.move));
});

document.addEventListener('keydown', (event) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const move = KEY_TO_MOVE[event.key];
    if (move) play(move);
});

$('rulesBtn').addEventListener('click', () => openDialog(els.rulesDialog));
$('setupBtn').addEventListener('click', () => { if (!busy || match.over) openSetup(); });

const renderSound = () => els.soundBtn.setAttribute('aria-pressed', String(settings.sound));
els.soundBtn.addEventListener('click', () => {
    settings.sound = !settings.sound;
    store.save('sps.settings', settings);
    renderSound();
    sfx.tap();
});

reduceMotion.addEventListener('change', () => {
    if (reduceMotion.matches) scan.pause(); else scan.play();
});

// ---------- Boot ----------
renderSound();
startMatch();
