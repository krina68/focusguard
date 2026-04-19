// ═══════════════════════════════════════════════════════════
//  FocusGuard · script.js
//  Timer · Music Player · Ringtones · Notes · Notifications
// ═══════════════════════════════════════════════════════════

// ── Helpers ─────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const CIRCUMFERENCE = 2 * Math.PI * 115;   // r=115

// ══════════════════════════════════════════════════════════════
//  TIMER ENGINE
// ══════════════════════════════════════════════════════════════
let focusSec     = 25 * 60;
let breakSec     = 5  * 60;
let totalTime    = focusSec;
let timeLeft     = focusSec;
let timerInterval = null;
let isRunning    = false;
let isBreak      = false;
let sessionsDone = 0;
let distractionCount = 0;
let customOpen   = false;
let selectedRingtone = 'bell';

function initRing() {
  const r = $('ring');
  if (!r) return;
  r.style.strokeDasharray  = CIRCUMFERENCE;
  r.style.strokeDashoffset = 0;
}

function fmt(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

function updateTimer() {
  const d = $('timerDigits');
  const r = $('ring');
  if (d) d.textContent = fmt(timeLeft);
  if (r) {
    const pct = timeLeft / totalTime;
    r.style.strokeDashoffset = CIRCUMFERENCE * (1 - pct);
    r.className = 'ring-fill' + (isBreak ? ' break' : timeLeft <= 60 ? ' ending' : '');
  }
  const sl = $('timerSubLabel');
  if (sl) sl.textContent = isBreak ? 'take a break ☕' : `session ${sessionsDone + 1}/4`;
}

function selectPreset(btn, focusMin, breakMin) {
  if (isRunning) return;
  document.querySelectorAll('.preset-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.custom-inputs').forEach(el => el.style.display = 'none');
  customOpen = false;

  focusSec  = focusMin * 60;
  breakSec  = breakMin * 60;
  resetTimer();
}

function toggleCustom() {
  customOpen = !customOpen;
  const ci = $('customInputs');
  if (ci) ci.style.display = customOpen ? 'flex' : 'none';
  document.querySelectorAll('.preset-pill').forEach(b => b.classList.remove('active'));
  document.querySelector('.custom-pill')?.classList.toggle('active', customOpen);
}

function applyCustom() {
  if (isRunning) return;
  const fm = Math.max(1, Math.min(180, parseInt($('cFocus')?.value) || 25));
  const bm = Math.max(1, Math.min(60,  parseInt($('cBreak')?.value) || 5));
  focusSec = fm * 60;
  breakSec = bm * 60;
  resetTimer();
}

function startTimer() {
  if (isRunning) return;
  isRunning = true;

  const sb = $('startBtn'), pb = $('pauseBtn');
  if (sb) sb.style.display = 'none';
  if (pb) pb.style.display = 'inline-flex';

  if ($('blockToggle')?.checked) {
    fetch('/block').catch(() => {});
  }

  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimer();

    if (timeLeft > 0) return;
    clearInterval(timerInterval);
    isRunning = false;

    if (!isBreak) {
      sessionsDone++;
      markSessionDot(sessionsDone);
      playRingtone();
      sendNotification('Focus session done!', `${fmt(focusSec)} completed. Break time!`);
      completeSession();

      if (sessionsDone >= 4) {
        setTimeout(() => showCelebration(), 400);
        sessionsDone = 0;
        clearDots();
      }

      isBreak   = true;
      totalTime = breakSec;
      timeLeft  = breakSec;
      const pl = $('timerPhase');
      if (pl) pl.textContent = 'BREAK';
      updateTimer();
      startTimer();

    } else {
      playBreakEnd();
      sendNotification('Break over!', 'Time to focus again. You got this!');
      isBreak   = false;
      totalTime = focusSec;
      timeLeft  = focusSec;
      const pl = $('timerPhase');
      if (pl) pl.textContent = 'FOCUS';
      if (sb) { sb.style.display = 'inline-flex'; sb.textContent = '▶ Start'; }
      if (pb) pb.style.display = 'none';
      updateTimer();
    }
  }, 1000);
}

function pauseTimer() {
  clearInterval(timerInterval);
  isRunning = false;
  const sb = $('startBtn'), pb = $('pauseBtn');
  if (sb) { sb.style.display = 'inline-flex'; sb.textContent = '▶ Resume'; }
  if (pb) pb.style.display = 'none';
}

function resetTimer() {
  clearInterval(timerInterval);
  isRunning  = false;
  isBreak    = false;
  totalTime  = focusSec;
  timeLeft   = focusSec;
  distractionCount = 0;
  const dc = $('distractionCount');
  if (dc) dc.textContent = '0';
  const pl = $('timerPhase');
  if (pl) pl.textContent = 'FOCUS';
  const r = $('ring');
  if (r) { r.className = 'ring-fill'; r.style.strokeDashoffset = 0; }
  const sb = $('startBtn'), pb = $('pauseBtn');
  if (sb) { sb.style.display = 'inline-flex'; sb.textContent = '▶ Start'; }
  if (pb) pb.style.display = 'none';
  updateTimer();
}

function addDistraction() {
  distractionCount++;
  const dc = $('distractionCount');
  if (dc) { dc.textContent = distractionCount; dc.style.transform = 'scale(1.5)'; setTimeout(() => dc.style.transform = 'scale(1)', 200); }
}

function markSessionDot(n) {
  const dot = $(`sd${n}`);
  if (dot) dot.classList.add('done');
}

function clearDots() {
  for (let i = 1; i <= 4; i++) $(`sd${i}`)?.classList.remove('done');
}

async function completeSession() {
  try {
    const res = await fetch('/api/session/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ focus_minutes: Math.floor(focusSec / 60), distractions: distractionCount })
    });
    const data = await res.json();
    if (data.success) {
      updatePointsDisplay(data.total_points, data.streak);
      if (data.new_badges?.length) {
        data.new_badges.forEach((b, i) => setTimeout(() => showBadge(b), i * 1500));
      }
    }
  } catch(e) {}
}

function updatePointsDisplay(pts, streak) {
  document.querySelectorAll('.user-pts').forEach(el => {
    el.textContent = `${pts} pts · ${streak}d streak`;
  });
}

function showBadge(badge) {
  const popup = $('badgePopup');
  if (!popup) return;
  $('bpIcon').textContent  = badge.icon;
  $('bpTitle').textContent = `New Badge: ${badge.name}`;
  $('bpDesc').textContent  = badge.desc;
  popup.style.display = 'flex';
}

function showCelebration() {
  alert('🎉 Incredible! You completed 4 Pomodoro sessions. Take a long 15-30 min break — you\'ve earned it!');
}

// ══════════════════════════════════════════════════════════════
//  RINGTONES — Web Audio API
// ══════════════════════════════════════════════════════════════
function getAudioCtx() {
  return new (window.AudioContext || window.webkitAudioContext)();
}

function playTone(ctx, freq, start, dur, type = 'sine', gain = 0.4) {
  const osc = ctx.createOscillator();
  const g   = ctx.createGain();
  osc.connect(g); g.connect(ctx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
  g.gain.setValueAtTime(gain, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + dur + 0.05);
}

const RINGTONES = {
  bell: ctx => {
    playTone(ctx, 880, 0.0, 0.5, 'sine', 0.5);
    playTone(ctx, 1047, 0.5, 0.5, 'sine', 0.5);
    playTone(ctx, 1319, 1.0, 0.7, 'sine', 0.5);
    playTone(ctx, 1047, 1.8, 0.4, 'sine', 0.35);
    playTone(ctx, 880, 2.3, 0.7, 'sine', 0.4);
  },
  chime: ctx => {
    [0, 0.3, 0.6, 0.9, 1.2].forEach((t, i) => {
      playTone(ctx, [523,659,784,1047,1319][i], t, 0.6, 'triangle', 0.35);
    });
  },
  digital: ctx => {
    for (let i = 0; i < 6; i++) {
      playTone(ctx, i % 2 === 0 ? 800 : 600, i * 0.25, 0.18, 'square', 0.25);
    }
  },
  gentle: ctx => {
    playTone(ctx, 528, 0.0, 1.0, 'sine', 0.3);
    playTone(ctx, 639, 0.5, 1.0, 'sine', 0.25);
    playTone(ctx, 741, 1.2, 1.2, 'sine', 0.2);
  }
};

function playRingtone() {
  const rt = document.querySelector('input[name="ringtone"]:checked')?.value || selectedRingtone;
  try {
    const ctx = getAudioCtx();
    (RINGTONES[rt] || RINGTONES.bell)(ctx);
  } catch (e) {}
}

function playBreakEnd() {
  try {
    const ctx = getAudioCtx();
    playTone(ctx, 660, 0.0, 0.4, 'triangle', 0.25);
    playTone(ctx, 528, 0.5, 0.6, 'triangle', 0.2);
  } catch (e) {}
}

function previewAlarm() { playRingtone(); }

async function saveRingtone(rt) {
  selectedRingtone = rt;
  try {
    await fetch('/api/ringtone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ringtone: rt })
    });
  } catch(e) {}
}

// ══════════════════════════════════════════════════════════════
//  FOCUS MUSIC — Web Audio Ambient Generator
// ══════════════════════════════════════════════════════════════
let musicCtx = null;
let musicNodes = [];
let musicVolume = 0.4;
let currentMusic = 'off';

function stopMusic() {
  musicNodes.forEach(n => { try { n.stop(); } catch(e) {} });
  musicNodes = [];
  if (musicCtx) { musicCtx.close(); musicCtx = null; }
}

function createBufferSource(ctx, buffer) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  return src;
}

function genNoise(ctx, type = 'brown') {
  const bufSize = ctx.sampleRate * 4;
  const buf  = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < bufSize; i++) {
    const w = (Math.random() * 2 - 1);
    if (type === 'brown') {
      data[i] = (last + 0.02 * w) / 1.02;
      last = data[i];
      data[i] *= 3.5;
    } else {
      data[i] = w; // white noise
    }
  }
  return buf;
}

function makeGain(ctx, vol) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol * musicVolume, ctx.currentTime);
  g.connect(ctx.destination);
  return g;
}

const MUSIC_MAKERS = {
  rain: ctx => {
    const buf = genNoise(ctx, 'brown');
    const src = createBufferSource(ctx, buf);
    const g   = makeGain(ctx, 0.6);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 600;
    src.connect(filter); filter.connect(g);
    src.start();
    musicNodes.push(src);

    // Occasional heavier drops
    const src2 = createBufferSource(ctx, genNoise(ctx, 'brown'));
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.3;
    lfoGain.gain.value = 0.15;
    lfo.connect(lfoGain); lfoGain.connect(g.gain);
    src2.connect(g); src2.start(); lfo.start();
    musicNodes.push(src2, lfo);
  },

  ocean: ctx => {
    const buf = genNoise(ctx, 'brown');
    const src = createBufferSource(ctx, buf);
    const g   = makeGain(ctx, 0.5);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = 400; filter.Q.value = 0.8;
    src.connect(filter); filter.connect(g);
    src.start();

    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    lfo.type = 'sine'; lfo.frequency.value = 0.1;
    lfoG.gain.value = 0.2;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    lfo.start();
    musicNodes.push(src, lfo);
  },

  white: ctx => {
    const buf = genNoise(ctx, 'white');
    const src = createBufferSource(ctx, buf);
    const g   = makeGain(ctx, 0.3);
    src.connect(g); src.start();
    musicNodes.push(src);
  },

  lofi: ctx => {
    const chords = [[261.6,329.6,392],[220,261.6,329.6],[174.6,220,261.6],[196,261.6,329.6]];
    let beat = 0;
    const g = makeGain(ctx, 0.3);

    const scheduleBeat = () => {
      const chord = chords[beat % chords.length];
      chord.forEach(freq => {
        const osc = ctx.createOscillator();
        const og  = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        og.gain.setValueAtTime(0.12, ctx.currentTime);
        og.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.8);
        osc.connect(og); og.connect(g);
        osc.start(); osc.stop(ctx.currentTime + 2);
        musicNodes.push(osc);
      });
      beat++;
    };

    scheduleBeat();
    const id = setInterval(scheduleBeat, 2000);
    musicNodes.push({ stop: () => clearInterval(id) });
  },

  forest: ctx => {
    // Wind
    const buf = genNoise(ctx, 'brown');
    const wind = createBufferSource(ctx, buf);
    const g    = makeGain(ctx, 0.18);
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass'; filter.frequency.value = 800;
    wind.connect(filter); filter.connect(g); wind.start();
    musicNodes.push(wind);

    // Bird chirps
    const chirp = () => {
      if (!musicCtx) return;
      const osc = ctx.createOscillator();
      const og  = ctx.createGain();
      osc.type = 'sine';
      const base = 1200 + Math.random() * 800;
      osc.frequency.setValueAtTime(base, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(base + 300, ctx.currentTime + 0.08);
      osc.frequency.linearRampToValueAtTime(base, ctx.currentTime + 0.16);
      og.gain.setValueAtTime(0.12, ctx.currentTime);
      og.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.connect(og); og.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.25);
    };

    const id = setInterval(() => { if (musicCtx) chirp(); }, 1200 + Math.random() * 3000);
    musicNodes.push({ stop: () => clearInterval(id) });
  }
};

function setMusic(btn, type) {
  document.querySelectorAll('.music-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentMusic = type;
  stopMusic();

  if (type === 'off') return;

  try {
    musicCtx = getAudioCtx();
    MUSIC_MAKERS[type]?.(musicCtx);
  } catch(e) { console.warn('Music error:', e); }
}

function setVolume(v) {
  musicVolume = parseFloat(v);
  // Live update all gain nodes
  if (!musicCtx) return;
  // Restart music to apply volume
  setMusic(document.querySelector('.music-btn.active'), currentMusic);
}

// ══════════════════════════════════════════════════════════════
//  BROWSER NOTIFICATIONS
// ══════════════════════════════════════════════════════════════
function sendNotification(title, body) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  new Notification(title, { body, icon: '/static/icon.png' });
}

// Daily reminder via setTimeout
function scheduleReminder(timeStr, message) {
  if (!timeStr) return;
  const [h, m] = timeStr.split(':').map(Number);
  const now  = new Date();
  const fire = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  if (fire <= now) fire.setDate(fire.getDate() + 1);
  const delay = fire - now;
  setTimeout(() => {
    sendNotification('FocusGuard Reminder', message || 'Time to study!');
    scheduleReminder(timeStr, message); // reschedule for tomorrow
  }, delay);
}

async function saveReminder() {
  const time    = $('reminderTime')?.value;
  const message = $('reminderMsg')?.value;
  const enabled = $('reminderEnabled')?.checked;

  if (!time) return;

  try {
    await fetch('/api/reminder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ time, message, enabled })
    });

    if (enabled) {
      if (Notification.permission === 'default') {
        const perm = await Notification.requestPermission();
        if (perm === 'granted') scheduleReminder(time, message);
      } else if (Notification.permission === 'granted') {
        scheduleReminder(time, message);
      }
    }

    // Flash confirmation
    const btn = document.querySelector('.timer-side .btn-primary:last-of-type');
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = '✓ Saved!';
      setTimeout(() => btn.textContent = orig, 2000);
    }
  } catch(e) {}
}

// ══════════════════════════════════════════════════════════════
//  NOTES PAGE
// ══════════════════════════════════════════════════════════════
let selectedNoteColor = '#4493f8';
let pendingSave = {};

function openNewNote() {
  const m = $('noteModal');
  if (m) m.style.display = 'flex';
  const tf = $('newTitle');
  if (tf) setTimeout(() => tf.focus(), 50);
}

function closeModal() {
  const m = $('noteModal');
  if (m) { m.style.display = 'none'; }
  const t = $('newTitle'), c = $('newContent');
  if (t) t.value = '';
  if (c) c.value = '';
  selectedNoteColor = '#4493f8';
  document.querySelectorAll('#modalColors .cp-dot').forEach((dot, i) => {
    dot.classList.toggle('selected', i === 0);
  });
}

function selectModalColor(el, color) {
  selectedNoteColor = color;
  document.querySelectorAll('#modalColors .cp-dot').forEach(d => d.classList.remove('selected'));
  el.classList.add('selected');
}

async function createNote() {
  const title   = $('newTitle')?.value.trim();
  const content = $('newContent')?.value.trim();
  if (!title && !content) return;

  try {
    const res = await fetch('/notes/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title || 'Untitled', content, color: selectedNoteColor })
    });
    const data = await res.json();
    if (data.success) {
      closeModal();
      appendNoteCard(data.note);
      $('emptyState')?.remove();
    }
  } catch(e) {}
}

function appendNoteCard(note) {
  const grid = $('notesGrid');
  if (!grid) return;

  const colors = ['#4493f8','#3fb950','#e3b341','#bc8cff','#f778ba','#ff7b72','#39d353'];
  const colorDots = colors.map(c =>
    `<span class="cp-dot" style="background:${c};" onclick="changeNoteColor(${note.id}, '${c}')"></span>`
  ).join('');

  const card = document.createElement('div');
  card.className = 'note-card';
  card.id = `note-${note.id}`;
  card.dataset.color   = note.color;
  card.dataset.title   = (note.title || '').toLowerCase();
  card.dataset.content = (note.content || '').toLowerCase();
  card.style.borderTopColor = note.color;

  card.innerHTML = `
    <div class="note-body">
      <div class="note-title" contenteditable="true" data-id="${note.id}" onblur="saveNote(${note.id})">${esc(note.title)}</div>
      <div class="note-content" contenteditable="true" data-id="${note.id}" onblur="saveNote(${note.id})">${esc(note.content)}</div>
    </div>
    <div class="note-footer">
      <span class="note-date">${note.created_at?.slice(0,10) || 'now'}</span>
      <div class="note-actions">
        <div class="color-picker-wrap">
          <button class="note-act-btn" onclick="toggleColorPicker(${note.id})">🎨</button>
          <div class="color-picker" id="cp-${note.id}" style="display:none;">${colorDots}</div>
        </div>
        <button class="note-act-btn note-del" onclick="deleteNote(${note.id})">🗑</button>
      </div>
    </div>`;

  grid.insertBefore(card, grid.firstChild);
  card.style.opacity = '0'; card.style.transform = 'scale(0.9)';
  requestAnimationFrame(() => {
    card.style.transition = 'opacity 0.3s, transform 0.3s';
    card.style.opacity = '1'; card.style.transform = 'scale(1)';
  });
}

function esc(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function saveNote(id) {
  clearTimeout(pendingSave[id]);
  pendingSave[id] = setTimeout(async () => {
    const card    = $(`note-${id}`);
    if (!card) return;
    const title   = card.querySelector('.note-title')?.innerText.trim();
    const content = card.querySelector('.note-content')?.innerText.trim();
    card.dataset.title   = (title   || '').toLowerCase();
    card.dataset.content = (content || '').toLowerCase();
    try {
      await fetch(`/notes/edit/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content })
      });
    } catch(e) {}
  }, 800);
}

async function deleteNote(id) {
  const card = $(`note-${id}`);
  if (!card) return;
  card.style.transition = 'opacity 0.25s, transform 0.25s';
  card.style.opacity = '0'; card.style.transform = 'scale(0.85)';
  try {
    await fetch(`/notes/delete/${id}`, { method: 'POST' });
  } catch(e) {}
  setTimeout(() => card.remove(), 280);
}

function toggleColorPicker(id) {
  const cp = $(`cp-${id}`);
  if (cp) cp.style.display = cp.style.display === 'none' ? 'flex' : 'none';
}

async function changeNoteColor(id, color) {
  const card = $(`note-${id}`);
  if (card) { card.style.borderTopColor = color; card.dataset.color = color; }
  $(`cp-${id}`).style.display = 'none';
  try {
    await fetch(`/notes/edit/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color })
    });
  } catch(e) {}
}

function filterNotes(q) {
  const query = q.toLowerCase();
  document.querySelectorAll('.note-card').forEach(card => {
    const match = card.dataset.title?.includes(query) || card.dataset.content?.includes(query);
    card.style.display = match ? '' : 'none';
  });
}

function filterByColor(color, btn) {
  document.querySelectorAll('.cf-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.note-card').forEach(card => {
    card.style.display = (!color || card.dataset.color === color) ? '' : 'none';
  });
}

// Close color pickers on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('.color-picker-wrap') && !e.target.closest('.color-picker')) {
    document.querySelectorAll('.color-picker').forEach(cp => cp.style.display = 'none');
  }
});

// ══════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initRing();
  updateTimer();

  // Set document title to timer when on timer page
  const obs = setInterval(() => {
    if ($('timerDigits') && isRunning) {
      document.title = `${$('timerDigits').textContent} · FocusGuard`;
    }
  }, 1000);
});
