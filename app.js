// ─── State ───────────────────────────────────────────────────
const STATE_KEY = 'fitlastchance_v2';
let state = {
  fasts: [],
  weights: [],
  activeFast: null,
  settings: {
    name: '',
    goalHours: 16,
    unit: 'kg',
    goalWeight: null,
    startWeight: null,
    notif: false,
    waterNotif: true,
    phaseNotif: true,
  },
  xp: 0,
  streak: 0,
  bestStreak: 0,
  lastFastDate: null,
  water: 0,
  currentMood: null,
  currentEnergy: null,
  chartRange: 7,
};

function saveState() { localStorage.setItem(STATE_KEY, JSON.stringify(state)); }

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    // migrate from v1 key
    const rawV1 = localStorage.getItem('fitlastchance_v1');
    const src = raw || rawV1;
    if (src) {
      const saved = JSON.parse(src);
      state = { ...state, ...saved };
      state.settings = { ...state.settings, ...(saved.settings || {}) };
    }
  } catch (e) {}
}

// ─── Fasting Phases ───────────────────────────────────────────
const PHASES = [
  { id: 'fed', name: 'Fed State', range: [0, 3], color: '#10b981', icon: '🍽️', desc: 'Your body is digesting. Insulin is elevated, storing glucose as glycogen.', tip: 'Hydrate well — water is your best friend right now.' },
  { id: 'post', name: 'Post-Absorptive', range: [3, 8], color: '#f59e0b', icon: '🔄', desc: 'Digestion complete. Blood sugar stabilizes. Liver releases stored glycogen.', tip: 'Insulin is dropping — fat burning is starting to ramp up!' },
  { id: 'early', name: 'Early Fasting', range: [8, 16], color: '#38bdf8', icon: '⚡', desc: 'Glycogen depleting. Fat oxidation begins. HGH rises. Autophagy initiates.', tip: "You're in the fat-burning zone! This is where the magic begins." },
  { id: 'keto', name: 'Ketosis', range: [16, 24], color: '#8b5cf6', icon: '🔥', desc: 'Fat is your primary fuel. Ketones produced. Mental clarity often improves. Autophagy peaks.', tip: 'Your body is a fat-burning machine right now. Keep going!' },
  { id: 'deep', name: 'Deep Ketosis', range: [24, 999], color: '#f43f5e', icon: '🚀', desc: 'Maximum ketones. Peak autophagy. HGH spikes. Immune regeneration begins.', tip: 'Elite-level fasting. Incredible things are happening in your body!' },
];

function getPhase(hours) { return PHASES.find(p => hours >= p.range[0] && hours < p.range[1]) || PHASES[0]; }

// ─── XP & Levels ─────────────────────────────────────────────
const LEVELS = [
  { n: 1, name: 'Beginner Faster', xp: 0 }, { n: 2, name: 'Fasting Rookie', xp: 100 },
  { n: 3, name: 'Fasting Apprentice', xp: 300 }, { n: 4, name: 'Fasting Adept', xp: 600 },
  { n: 5, name: 'Fasting Expert', xp: 1000 }, { n: 6, name: 'Fasting Master', xp: 1500 },
  { n: 7, name: 'Fasting Champion', xp: 2100 }, { n: 8, name: 'Fasting Warrior', xp: 2800 },
  { n: 9, name: 'Fasting Legend', xp: 3600 }, { n: 10, name: 'Fasting God', xp: 5000 },
];

function getLevelInfo(xp) {
  let cur = LEVELS[0], nxt = LEVELS[1];
  for (let i = LEVELS.length - 1; i >= 0; i--) { if (xp >= LEVELS[i].xp) { cur = LEVELS[i]; nxt = LEVELS[i + 1] || null; break; } }
  const prev = cur.xp, next = nxt ? nxt.xp : cur.xp + 1000;
  const pct = Math.min(100, Math.round(((xp - prev) / (next - prev)) * 100));
  return { cur, nxt, pct, toNext: Math.max(0, next - xp) };
}

function addXP(amount, reason) {
  const before = getLevelInfo(state.xp);
  state.xp += amount;
  const after = getLevelInfo(state.xp);
  saveState();
  showToast(`⚡ +${amount} XP — ${reason}`, 'success');
  if (after.cur.n > before.cur.n) setTimeout(() => { showToast(`🎉 Level Up! You're now a ${after.cur.name}!`, 'success'); confetti(); }, 700);
  updateHeader();
  updateSettingsPage();
}

// ─── Milestones ───────────────────────────────────────────────
const MILESTONES = [
  { id: 'first_fast', icon: '🌟', title: 'First Fast', desc: 'Complete your first fast', check: s => s.fasts.filter(f => f.completed).length >= 1 },
  { id: 'streak_3', icon: '🔥', title: 'On Fire', desc: '3-day fasting streak', check: s => s.streak >= 3 },
  { id: 'streak_7', icon: '💪', title: 'Week Warrior', desc: '7-day fasting streak', check: s => s.streak >= 7 },
  { id: 'streak_30', icon: '👑', title: 'Month Master', desc: '30-day fasting streak', check: s => s.streak >= 30 },
  { id: 'fasts_10', icon: '🏅', title: 'Dedicated', desc: 'Complete 10 fasts', check: s => s.fasts.filter(f => f.completed).length >= 10 },
  { id: 'fasts_50', icon: '🏆', title: 'Fasting Pro', desc: 'Complete 50 fasts', check: s => s.fasts.filter(f => f.completed).length >= 50 },
  { id: 'ketosis', icon: '🔥', title: 'Into Ketosis', desc: 'Reach ketosis (16h+ fast)', check: s => s.fasts.some(f => f.completed && f.duration >= 16) },
  { id: 'deep_keto', icon: '🚀', title: 'Deep Ketosis', desc: 'Complete a 24h+ fast', check: s => s.fasts.some(f => f.completed && f.duration >= 24) },
  { id: 'weight_1', icon: '⚖️', title: 'Scale Scout', desc: 'Log your first weight', check: s => s.weights.length >= 1 },
  { id: 'weight_5', icon: '📉', title: 'Progress Made', desc: 'Log weight 5 times', check: s => s.weights.length >= 5 },
];

function checkMilestones() {
  const achieved = JSON.parse(localStorage.getItem('flc_ms') || '[]');
  MILESTONES.forEach(m => {
    if (!achieved.includes(m.id) && m.check(state)) {
      achieved.push(m.id);
      localStorage.setItem('flc_ms', JSON.stringify(achieved));
      setTimeout(() => { showToast(`🏆 ${m.title} unlocked!`, 'success'); confetti(); }, 600);
    }
  });
}

function getAchieved() { return JSON.parse(localStorage.getItem('flc_ms') || '[]'); }

// ─── Fast Controls ────────────────────────────────────────────
let timerInterval = null;

function selectProtocol(h) {
  state.settings.goalHours = h;
  document.getElementById('custom-goal').value = h;
  document.querySelectorAll('.proto-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById(`proto-${h}`)?.classList.add('selected');
  saveState();
}

function setCustomGoal(val) {
  state.settings.goalHours = parseInt(val) || 16;
  document.querySelectorAll('.proto-btn').forEach(b => b.classList.remove('selected'));
  saveState();
}

function startFast() {
  state.activeFast = { id: Date.now(), startTime: Date.now(), goalHours: state.settings.goalHours, water: 0, mood: null, energy: null, phaseNotified: [] };
  state.water = 0;
  state.currentMood = null;
  state.currentEnergy = null;
  saveState();
  showFastActive();
  scheduleFastNotifications();
  showToast('🚀 Fast started! You\'ve got this!', 'info');
}

function endFast(completed) {
  if (!state.activeFast) return;
  clearInterval(timerInterval);
  const elapsed = (Date.now() - state.activeFast.startTime) / 3600000;
  const fast = {
    id: state.activeFast.id, startTime: state.activeFast.startTime,
    endTime: Date.now(), goalHours: state.activeFast.goalHours,
    duration: parseFloat(elapsed.toFixed(2)), completed,
    water: state.water, mood: state.currentMood, energy: state.currentEnergy,
  };
  state.fasts.unshift(fast);
  state.activeFast = null;
  saveState();
  if (completed) {
    updateStreak();
    addXP(Math.round(50 + (elapsed >= fast.goalHours ? 50 : 0) + elapsed * 2), 'Completed fast');
    confetti();
    showToast(`🎉 ${formatDur(elapsed)} fasted — incredible!`, 'success');
  } else {
    showToast('Fast cancelled. Tomorrow is a fresh start!', 'info');
  }
  checkMilestones();
  showFastIdle();
  renderFastHistory();
  updateSettingsPage();
}

function updateStreak() {
  const today = new Date().toDateString();
  const yest = new Date(Date.now() - 86400000).toDateString();
  if (state.lastFastDate === today) return;
  state.streak = (state.lastFastDate === yest || !state.lastFastDate) ? state.streak + 1 : 1;
  state.lastFastDate = today;
  if (state.streak > state.bestStreak) state.bestStreak = state.streak;
  saveState();
  updateHeader();
}

function showFastIdle() {
  document.getElementById('fast-idle').classList.remove('hidden');
  document.getElementById('fast-active').classList.add('hidden');
  clearInterval(timerInterval);
}

function showFastActive() {
  document.getElementById('fast-idle').classList.add('hidden');
  document.getElementById('fast-active').classList.remove('hidden');
  renderPhasesList();
  renderWaterCups();
  startTimer();
}

function startTimer() {
  clearInterval(timerInterval);
  tickTimer();
  timerInterval = setInterval(tickTimer, 1000);
}

let lastPhaseId = null;

function tickTimer() {
  if (!state.activeFast) return;
  const elapsedSec = (Date.now() - state.activeFast.startTime) / 1000;
  const goalSec = state.activeFast.goalHours * 3600;
  const pct = Math.min(100, (elapsedSec / goalSec) * 100);
  const elapsedH = elapsedSec / 3600;

  // Elapsed display — show HH:MM when under 1h else HH:MM
  const h = Math.floor(elapsedSec / 3600);
  const m = Math.floor((elapsedSec % 3600) / 60);
  const s = Math.floor(elapsedSec % 60);
  const el = document.getElementById('fast-elapsed');
  if (el) el.textContent = h > 0 ? `${pad(h)}:${pad(m)}` : `${pad(m)}:${pad(s)}`;

  // Percent
  const pctEl = document.getElementById('fast-percent');
  if (pctEl) pctEl.textContent = pct.toFixed(1) + '%';

  // Ring
  const circ = 2 * Math.PI * 88;
  const offset = circ - (pct / 100) * circ;
  const ring = document.getElementById('ring-fill');
  if (ring) {
    ring.style.strokeDasharray = circ;
    ring.style.strokeDashoffset = offset;
    const phase = getPhase(elapsedH);
    ring.style.color = phase.color;
    ring.style.stroke = phase.color;

    // Phase changed — update badge + phases list
    if (phase.id !== lastPhaseId) {
      lastPhaseId = phase.id;
      const badge = document.getElementById('fast-phase-badge');
      if (badge) {
        badge.textContent = `${phase.icon} ${phase.name}`;
        badge.style.background = phase.color + '18';
        badge.style.color = phase.color;
        badge.style.borderColor = phase.color + '35';
      }
      renderPhasesList();
    }
  }

  // Times
  const start = new Date(state.activeFast.startTime);
  const eat = new Date(state.activeFast.startTime + state.activeFast.goalHours * 3600000);
  const stEl = document.getElementById('fast-start-time');
  const etEl = document.getElementById('fast-eat-time');
  const gEl = document.getElementById('fast-goal-display');
  if (stEl) stEl.textContent = fmtClock(start);
  if (etEl) etEl.textContent = fmtClock(eat);
  if (gEl) gEl.textContent = state.activeFast.goalHours + 'h';

  // Remaining
  const remSec = Math.max(0, goalSec - elapsedSec);
  const rEl = document.getElementById('fast-remaining');
  if (rEl) {
    if (remSec <= 0) {
      rEl.textContent = '✅ Goal reached!';
      rEl.style.color = '#10b981';
    } else {
      const rh = Math.floor(remSec / 3600);
      const rm = Math.floor((remSec % 3600) / 60);
      rEl.textContent = rh > 0 ? `${rh}h ${rm}m left` : `${rm}m left`;
      rEl.style.color = remSec < 3600 ? '#f59e0b' : '#38bdf8';
    }
  }

  // Phase notifications
  checkPhaseNotifs(elapsedH);
}

function checkPhaseNotifs(hours) {
  if (!state.activeFast || !state.settings.phaseNotif) return;
  PHASES.forEach(p => {
    if (hours >= p.range[0] && !state.activeFast.phaseNotified.includes(p.id) && p.range[0] > 0) {
      state.activeFast.phaseNotified.push(p.id);
      saveState();
      sendNotif(`${p.icon} Entering ${p.name}`, p.tip);
    }
  });
}

function addWater() {
  state.water = (state.water || 0) + 1;
  if (state.activeFast) state.activeFast.water = state.water;
  saveState();
  renderWaterCups();
  if (state.water % 4 === 0) showToast('💧 Amazing hydration! You got this! 💪', 'info');
  else if (state.water === 1) showToast('💧 First glass down — keep it up!', 'info');
}

function renderWaterCups() {
  const c = document.getElementById('water-cups');
  const cnt = document.getElementById('water-count');
  if (!c) return;
  const w = state.water || 0;
  c.innerHTML = '';
  for (let i = 0; i < Math.max(6, w + 1); i++) {
    const el = document.createElement('span');
    el.style.cssText = `font-size:1.1rem;opacity:${i < w ? '1' : '0.2'};cursor:pointer;transition:all 0.15s;display:inline-block;`;
    el.textContent = i < w ? '💧' : '○';
    c.appendChild(el);
  }
  if (cnt) cnt.textContent = w;
}

function setMood(type, val) {
  if (type === 'mood') { state.currentMood = val; if (state.activeFast) state.activeFast.mood = val; }
  else { state.currentEnergy = val; if (state.activeFast) state.activeFast.energy = val; }
  saveState();
  document.querySelectorAll(`.mood-btn[data-type="${type}"]`).forEach(b => {
    b.classList.toggle('selected', parseInt(b.dataset.val) === val);
  });
}

function renderPhasesList() {
  const c = document.getElementById('phases-list');
  if (!c) return;
  const hours = state.activeFast ? (Date.now() - state.activeFast.startTime) / 3600000 : 0;
  c.innerHTML = PHASES.map(p => {
    const active = hours >= p.range[0] && hours < p.range[1];
    const done = hours >= p.range[1];
    return `
      <div style="display:flex;align-items:flex-start;gap:10px;padding:10px;border-radius:12px;border:1px solid ${active ? p.color + '30' : 'var(--border)'};background:${active ? p.color + '0c' : 'rgba(255,255,255,0.02)'};transition:all 0.3s;">
        <div style="width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:0.9rem;flex-shrink:0;background:${active ? p.color + '20' : done ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.04)'};">
          ${done ? '✅' : p.icon}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:${active ? '5px' : '0'};">
            <span style="font-size:0.8rem;font-weight:700;color:${active ? p.color : done ? '#10b981' : 'var(--muted)'};">${p.name}</span>
            <span style="font-size:0.67rem;color:var(--muted);">${p.range[0]}h${p.range[1] < 999 ? '–' + p.range[1] + 'h' : '+'}</span>
            ${active ? `<span style="font-size:0.62rem;padding:1px 7px;border-radius:100px;font-weight:700;letter-spacing:0.06em;background:${p.color}20;color:${p.color};">NOW</span>` : ''}
          </div>
          ${active ? `<p style="font-size:0.73rem;color:#94a3b8;line-height:1.4;">${p.desc}</p>` : ''}
        </div>
      </div>`;
  }).join('');
}

// ─── Weight ───────────────────────────────────────────────────
let weightChart = null;

function logWeight() {
  const inp = document.getElementById('weight-input');
  const date = document.getElementById('weight-date');
  const note = document.getElementById('weight-note');
  const val = parseFloat(inp.value);
  if (!val || val <= 0) { showToast('Enter a valid weight', 'error'); return; }

  state.weights.unshift({
    id: Date.now(), weight: val,
    unit: state.settings.unit,
    date: date.value || new Date().toISOString().split('T')[0],
    note: note.value.trim(),
    timestamp: Date.now(),
  });
  saveState();
  inp.value = ''; note.value = '';
  addXP(10, 'Logged weight');
  checkMilestones();
  renderWeightPage();
  showToast('⚖️ Weight logged!', 'success');
}

function deleteWeight(id) {
  state.weights = state.weights.filter(w => w.id !== id);
  saveState();
  renderWeightPage();
}

function changeUnit(u) { state.settings.unit = u; saveState(); }

function toggleGoalEdit() {
  const el = document.getElementById('goal-edit');
  el.classList.toggle('hidden');
  if (!el.classList.contains('hidden')) {
    document.getElementById('goal-weight-input').value = state.settings.goalWeight || '';
    document.getElementById('start-weight-input').value = state.settings.startWeight || '';
  }
}

function saveGoal() {
  const gw = parseFloat(document.getElementById('goal-weight-input').value);
  const sw = parseFloat(document.getElementById('start-weight-input').value);
  if (gw) state.settings.goalWeight = gw;
  if (sw) state.settings.startWeight = sw;
  saveState();
  document.getElementById('goal-edit').classList.add('hidden');
  renderWeightPage();
  showToast('🎯 Goal saved!', 'success');
}

function setChartRange(days) {
  state.chartRange = days;
  ['7', '30', '90'].forEach(d => document.getElementById(`chart-${d}`)?.classList.toggle('active', d == days));
  renderWeightChart();
}

function renderWeightPage() {
  renderGoalHero();
  renderWeightStats();
  renderWeightChart();
  renderWeightList();
}

function renderGoalHero() {
  const sorted = [...state.weights].sort((a, b) => new Date(a.date) - new Date(b.date));
  const current = sorted.length ? sorted[sorted.length - 1].weight : null;
  const unit = state.settings.unit;
  const sw = state.settings.startWeight;
  const gw = state.settings.goalWeight;

  // Subtitle
  const sub = document.getElementById('goal-hero-subtitle');
  if (!gw) {
    if (sub) sub.textContent = 'Set your goal weight to track progress';
    return;
  }

  // Values
  const el = (id) => document.getElementById(id);
  el('goal-start-val').textContent = sw ? `${sw} ${unit}` : '--';
  el('goal-current-val').textContent = current ? `${current} ${unit}` : '--';
  el('goal-target-val').textContent = `${gw} ${unit}`;

  // Progress
  let pct = 0;
  let toGo = '--';
  if (sw && gw && current !== null) {
    const totalDelta = Math.abs(sw - gw);
    const achieved = Math.abs(sw - current);
    pct = Math.min(100, Math.max(0, (achieved / totalDelta) * 100));
    const diff = (current - gw).toFixed(1);
    toGo = diff > 0 ? `${diff} ${unit} to go` : '🎯 Goal reached!';
  }

  // Labels
  if (sw && gw) {
    el('goal-start-label').textContent = `${sw}${unit}`;
    el('goal-end-label').textContent = `${gw}${unit}`;
  }

  // Milestone label
  const msEl = el('goal-milestone-label');
  if (msEl) {
    if (pct >= 100) msEl.textContent = '🏆 Complete!';
    else if (pct >= 75) msEl.textContent = '75% there!';
    else if (pct >= 50) msEl.textContent = '🔥 Halfway!';
    else if (pct >= 25) msEl.textContent = '25% done';
    else msEl.textContent = '';
  }

  el('goal-to-go').textContent = toGo;
  if (sub) sub.textContent = pct >= 100 ? '🎉 You hit your goal!' : `${pct.toFixed(1)}% of your goal achieved`;

  // Progress bar
  el('goal-bar').style.width = pct + '%';

  // Circular ring
  const circ = 2 * Math.PI * 46;
  const offset = circ - (pct / 100) * circ;
  const ringFill = el('goal-ring-fill');
  if (ringFill) {
    ringFill.style.strokeDasharray = circ;
    ringFill.style.strokeDashoffset = offset;
    ringFill.style.stroke = pct >= 100 ? '#f59e0b' : '#10b981';
  }
  el('goal-ring-pct').textContent = Math.round(pct) + '%';
  if (pct >= 100) el('goal-ring-pct').style.color = '#f59e0b';
}

function renderWeightStats() {
  const sorted = [...state.weights].sort((a, b) => new Date(a.date) - new Date(b.date));
  const unit = state.settings.unit;
  const current = sorted.length ? sorted[sorted.length - 1].weight : null;
  const first = sorted.length > 1 ? sorted[0].weight : null;
  const change = current && first ? (current - first) : null;
  const sw = state.settings.startWeight;
  const lost = current && sw ? (sw - current) : (change !== null ? -change : null);

  const cel = document.getElementById('stat-current');
  const chEl = document.getElementById('stat-change');
  const lEl = document.getElementById('stat-bmi');

  if (cel) cel.textContent = current ? `${current} ${unit}` : '--';
  if (chEl) {
    chEl.textContent = change !== null ? `${change > 0 ? '+' : ''}${change.toFixed(1)} ${unit}` : '--';
    chEl.style.color = change < 0 ? '#10b981' : change > 0 ? '#ef4444' : 'var(--text)';
  }
  if (lEl) {
    lEl.textContent = lost !== null && lost > 0 ? `-${lost.toFixed(1)} ${unit}` : '--';
    lEl.style.color = lost > 0 ? '#a78bfa' : 'var(--muted)';
  }
}

function renderWeightChart() {
  const canvas = document.getElementById('weightChart');
  if (!canvas) return;
  const cutoff = Date.now() - state.chartRange * 86400000;
  const filtered = state.weights
    .filter(w => new Date(w.date).getTime() >= cutoff)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const labels = filtered.map(w => { const d = new Date(w.date); return `${d.getMonth() + 1}/${d.getDate()}`; });
  const data = filtered.map(w => w.weight);

  if (weightChart) weightChart.destroy();
  const gCtx = canvas.getContext('2d');
  const grad = gCtx.createLinearGradient(0, 0, 0, 160);
  grad.addColorStop(0, 'rgba(56,189,248,0.15)');
  grad.addColorStop(1, 'rgba(56,189,248,0)');

  weightChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: '#38bdf8',
        backgroundColor: grad,
        borderWidth: 2,
        pointBackgroundColor: '#38bdf8',
        pointBorderColor: '#0d1117',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(13,17,23,0.95)',
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 10,
          callbacks: { label: ctx => ` ${ctx.parsed.y} ${state.settings.unit}` }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false }, ticks: { color: '#475569', font: { size: 10 } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false }, ticks: { color: '#475569', font: { size: 10 } } },
      }
    }
  });
}

function renderWeightList() {
  const c = document.getElementById('weight-log-list');
  const cnt = document.getElementById('weight-log-count');
  if (!c) return;
  const sorted = [...state.weights].sort((a, b) => new Date(b.date) - new Date(a.date));
  if (cnt) cnt.textContent = `${sorted.length} entries`;
  if (!sorted.length) { c.innerHTML = '<p style="font-size:0.8rem;color:var(--muted);text-align:center;padding:16px 0;">No weight logged yet.</p>'; return; }
  c.innerHTML = sorted.slice(0, 25).map(w => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
      <div>
        <div style="font-size:0.9rem;font-weight:700;color:var(--text);">${w.weight} ${w.unit || state.settings.unit}</div>
        ${w.note ? `<div style="font-size:0.72rem;color:var(--muted);margin-top:1px;">${esc(w.note)}</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="font-size:0.72rem;color:var(--muted);">${fmtDate(w.date)}</div>
        <button onclick="deleteWeight(${w.id})" style="font-size:0.7rem;color:var(--muted);background:none;border:none;cursor:pointer;padding:2px 4px;border-radius:4px;transition:color 0.2s;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='var(--muted)'">✕</button>
      </div>
    </div>`).join('');
}

// ─── Fast History ─────────────────────────────────────────────
function renderFastHistory() {
  const c = document.getElementById('fast-history');
  const cnt = document.getElementById('history-count');
  if (!c) return;
  if (cnt) cnt.textContent = `${state.fasts.length} fasts`;
  if (!state.fasts.length) { c.innerHTML = '<p style="font-size:0.8rem;color:var(--muted);text-align:center;padding:16px 0;">No fasts yet — start your first!</p>'; return; }
  c.innerHTML = state.fasts.slice(0, 8).map(f => {
    const phase = getPhase(f.duration);
    const d = new Date(f.startTime);
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:10px;border-radius:12px;background:rgba(255,255,255,0.02);border:1px solid var(--border);margin-bottom:6px;">
        <div style="width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1rem;background:${phase.color}15;flex-shrink:0;">${f.completed ? phase.icon : '❌'}</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="font-size:0.85rem;font-weight:700;color:var(--text);">${formatDur(f.duration)}</span>
            <span style="font-size:0.65rem;padding:2px 7px;border-radius:100px;font-weight:700;background:${f.completed ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)'};color:${f.completed ? '#10b981' : '#ef4444'};">${f.completed ? 'Done' : 'Cancelled'}</span>
          </div>
          <div style="font-size:0.7rem;color:var(--muted);margin-top:1px;">${fmtDate(d.toISOString().split('T')[0])} · Goal ${f.goalHours}h</div>
        </div>
        <div style="display:flex;gap:3px;font-size:0.85rem;">
          ${f.mood ? ['😔','😐','😊','🤩'][f.mood - 1] : ''}
          ${f.energy ? ['🪫','😴','⚡','🚀'][f.energy - 1] : ''}
        </div>
      </div>`;
  }).join('');
}

// ─── Settings Page ────────────────────────────────────────────
function updateSettingsPage() {
  const li = getLevelInfo(state.xp);
  const el = (id) => document.getElementById(id);

  el('level-badge').textContent = li.cur.n;
  el('level-name').textContent = li.cur.name;
  el('level-xp').textContent = `${state.xp} XP`;
  el('xp-fill').style.width = li.pct + '%';
  el('level-next').textContent = li.nxt ? `${li.toNext} XP to ${li.nxt.name}` : 'MAX LEVEL';
  el('streak-label').textContent = `${state.streak} day streak`;
  el('best-streak').textContent = state.bestStreak;

  const comp = state.fasts.filter(f => f.completed);
  el('stats-total').textContent = state.fasts.length;
  el('stats-completed').textContent = comp.length;
  const avg = comp.length ? comp.reduce((a, f) => a + f.duration, 0) / comp.length : 0;
  el('stats-avg').textContent = avg ? formatDur(avg) : '0h';
  const longest = comp.length ? Math.max(...comp.map(f => f.duration)) : 0;
  el('stats-longest').textContent = longest ? formatDur(longest) : '0h';

  renderMilestones();
}

function renderMilestones() {
  const c = document.getElementById('milestones-list');
  if (!c) return;
  const achieved = getAchieved();
  c.innerHTML = MILESTONES.map(m => {
    const done = achieved.includes(m.id);
    return `<div class="milestone ${done ? 'done' : ''}">
      <div style="font-size:1.4rem;${done ? '' : 'filter:grayscale(1);opacity:0.35;'}">${m.icon}</div>
      <div>
        <div style="font-size:0.82rem;font-weight:700;color:${done ? 'var(--text)' : 'var(--muted)'};">${m.title}</div>
        <div style="font-size:0.7rem;color:var(--muted);">${m.desc}</div>
      </div>
      ${done ? '<span style="margin-left:auto;font-size:0.75rem;color:#f59e0b;">✓</span>' : ''}
    </div>`;
  }).join('');
}

// ─── Header ───────────────────────────────────────────────────
function updateHeader() {
  const xEl = document.getElementById('header-xp');
  const sEl = document.getElementById('header-streak');
  if (xEl) xEl.textContent = `${state.xp} XP`;
  if (sEl) sEl.textContent = state.streak;
}

// ─── Navigation ───────────────────────────────────────────────
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById(`page-${name}`)?.classList.add('active');
  document.getElementById(`nav-${name}`)?.classList.add('active');
  if (name === 'weight') renderWeightPage();
  if (name === 'settings') updateSettingsPage();
}

// ─── Settings Actions ─────────────────────────────────────────
function saveName() {
  const n = document.getElementById('settings-name').value.trim();
  state.settings.name = n;
  saveState();
  if (n) {
    const h = document.getElementById('header-greeting');
    if (h) h.textContent = `Hey ${n}! 👋`;
  }
  showToast(n ? `Saved! Hi ${n} 👋` : 'Name cleared', 'success');
}

function toggleNotifications() {
  if (!state.settings.notif) {
    Notification.requestPermission().then(p => {
      state.settings.notif = p === 'granted';
      saveState(); updateToggles();
      if (p === 'granted') showToast('Notifications enabled!', 'success');
      else showToast('Allow notifications in browser settings', 'error');
    });
  } else { state.settings.notif = false; saveState(); updateToggles(); }
}

function toggleSetting(key) {
  state.settings[key + 'Notif'] = !state.settings[key + 'Notif'];
  saveState(); updateToggles();
}

function updateToggles() {
  const set = (id, on) => {
    const el = document.getElementById(id);
    if (el) { el.classList.toggle('on', on); }
  };
  set('notif-toggle', state.settings.notif);
  set('water-toggle', state.settings.waterNotif);
  set('phase-toggle', state.settings.phaseNotif);
}

// ─── Notifications ────────────────────────────────────────────
function sendNotif(title, body) {
  if (!state.settings.notif || Notification.permission !== 'granted') return;
  try { new Notification(title, { body, icon: 'icons/icon-192.png' }); } catch (e) {}
}

const WATER_MSGS = [
  "You got this, stay hydrated! 💧",
  "Drink up! Water powers your fast ⚡",
  "Hydration is your superpower! 🌊",
  "Sip sip hooray! 🎉",
];

function scheduleFastNotifications() {
  if (!state.settings.notif) return;
  if (state.settings.waterNotif) {
    for (let i = 1; i <= Math.floor(state.settings.goalHours / 2); i++) {
      setTimeout(() => {
        if (state.activeFast) sendNotif('💧 Water Reminder', WATER_MSGS[Math.floor(Math.random() * WATER_MSGS.length)]);
      }, i * 2 * 3600000);
    }
    const goalMs = state.settings.goalHours * 3600000;
    [2 * 3600000, 3600000, 30 * 60000].forEach(tl => {
      const delay = goalMs - tl;
      if (delay > 0) setTimeout(() => {
        if (!state.activeFast) return;
        const label = tl >= 3600000 ? `${tl / 3600000}h` : `${tl / 60000}m`;
        sendNotif('⏰ Almost there!', `Just ${label} left — you're crushing it! 🔥`);
      }, delay);
    });
  }
}

// ─── Backup ───────────────────────────────────────────────────
function exportData() {
  const blob = new Blob([JSON.stringify({ state, milestones: getAchieved(), exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = `flc-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click(); URL.revokeObjectURL(url);
  showToast('Backup exported!', 'success');
}

function importData(input) {
  const file = input.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.state) { state = { ...state, ...data.state }; state.settings = { ...state.settings, ...(data.state.settings || {}) }; saveState(); }
      if (data.milestones) localStorage.setItem('flc_ms', JSON.stringify(data.milestones));
      showToast('Backup imported!', 'success');
      location.reload();
    } catch { showToast('Invalid backup file', 'error'); }
  };
  r.readAsText(file);
}

function confirmReset() {
  openModal(`
    <h3 style="font-size:1.1rem;font-weight:800;color:var(--text);margin-bottom:8px;">Reset All Data?</h3>
    <p style="font-size:0.82rem;color:var(--muted);margin-bottom:16px;">This permanently deletes all fasting and weight data. Cannot be undone.</p>
    <button onclick="resetData()" class="btn btn-danger" style="margin-bottom:8px;">Yes, delete everything</button>
    <button onclick="closeModal()" class="btn btn-ghost">Cancel</button>
  `);
}

function resetData() {
  localStorage.removeItem(STATE_KEY);
  localStorage.removeItem('fitlastchance_v1');
  localStorage.removeItem('flc_ms');
  closeModal();
  location.reload();
}

// ─── Modal ────────────────────────────────────────────────────
function openModal(html) {
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('overlay').style.display = 'block';
  document.getElementById('modal').style.display = 'block';
}
function closeModal() {
  document.getElementById('overlay').style.display = 'none';
  document.getElementById('modal').style.display = 'none';
}

// ─── Toast ────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  const accent = { success: 'rgba(16,185,129,0.25)', error: 'rgba(239,68,68,0.25)', info: 'rgba(56,189,248,0.2)' };
  t.className = 'toast';
  t.style.borderLeftColor = accent[type] || accent.info;
  t.style.borderLeft = `3px solid ${accent[type] || accent.info}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(16px)'; t.style.transition = 'all 0.3s'; setTimeout(() => t.remove(), 300); }, 3000);
}

// ─── Confetti ─────────────────────────────────────────────────
function confetti() {
  const colors = ['#0ea5e9', '#6d28d9', '#f59e0b', '#10b981', '#f43f5e', '#8b5cf6', '#38bdf8'];
  for (let i = 0; i < 50; i++) {
    const p = document.createElement('div');
    p.className = 'cp';
    p.style.cssText = `left:${Math.random() * 100}vw;top:-10px;width:${5 + Math.random() * 6}px;height:${5 + Math.random() * 6}px;background:${colors[Math.floor(Math.random() * colors.length)]};animation-duration:${1.5 + Math.random() * 2}s;animation-delay:${Math.random() * 0.4}s;border-radius:${Math.random() > 0.5 ? '50%' : '2px'};`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 3500);
  }
}

// ─── PWA ─────────────────────────────────────────────────────
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredInstall = e;
  const btn = document.getElementById('install-btn');
  const note = document.getElementById('install-note');
  if (btn) btn.classList.remove('hidden');
  if (note) note.style.display = 'none';
});
function installPWA() {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  deferredInstall.userChoice.then(r => { deferredInstall = null; if (r.outcome === 'accepted') showToast('App installed!', 'success'); });
}

// ─── Utils ────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }
function formatDur(h) { const hh = Math.floor(h), mm = Math.round((h - hh) * 60); return mm > 0 ? `${hh}h ${mm}m` : `${hh}h`; }
function fmtClock(d) { return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function fmtDate(s) { const d = new Date(s + 'T00:00:00'); return d.toLocaleDateString([], { month: 'short', day: 'numeric' }); }
function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// ─── Init ─────────────────────────────────────────────────────
function init() {
  loadState();
  updateHeader();
  updateToggles();

  // Set date inputs
  const today = new Date().toISOString().split('T')[0];
  const wd = document.getElementById('weight-date');
  if (wd) wd.value = today;
  const wu = document.getElementById('weight-unit');
  if (wu) wu.value = state.settings.unit;
  const cg = document.getElementById('custom-goal');
  if (cg) cg.value = state.settings.goalHours;

  // Restore protocol selection
  const protos = [16, 18, 20];
  if (protos.includes(state.settings.goalHours)) {
    document.querySelectorAll('.proto-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById(`proto-${state.settings.goalHours}`)?.classList.add('selected');
  }

  // Restore name greeting
  if (state.settings.name) {
    const g = document.getElementById('header-greeting');
    if (g) g.textContent = `Hey ${state.settings.name}! 👋`;
    const sn = document.getElementById('settings-name');
    if (sn) sn.value = state.settings.name;
  }

  // Restore active fast
  if (state.activeFast) {
    showFastActive();
    if (state.currentMood) setMood('mood', state.currentMood);
    if (state.currentEnergy) setMood('energy', state.currentEnergy);
  } else {
    showFastIdle();
  }

  renderFastHistory();

  // SW
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  // Welcome toast
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const name = state.settings.name;
  setTimeout(() => showToast(`${greeting}${name ? ', ' + name : ''}! 👋`, 'info'), 400);
}

document.addEventListener('DOMContentLoaded', init);
