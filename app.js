// ============================================================
// FitLastChance — Intermittent Fasting & Weight Tracker
// ============================================================

// ─── State ───────────────────────────────────────────────────
const STATE_KEY = 'fitlastchance_v1';
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
  level: 1,
  streak: 0,
  bestStreak: 0,
  lastFastDate: null,
  water: 0,
  currentMood: null,
  currentEnergy: null,
  chartRange: 7,
};

function saveState() {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function loadState() {
  const raw = localStorage.getItem(STATE_KEY);
  if (raw) {
    try {
      const saved = JSON.parse(raw);
      state = { ...state, ...saved };
      state.settings = { ...state.settings, ...(saved.settings || {}) };
    } catch (e) {}
  }
}

// ─── Fasting Phases ──────────────────────────────────────────
const PHASES = [
  {
    id: 'fed',
    name: 'Fed State',
    range: [0, 3],
    color: '#10b981',
    bg: 'bg-emerald-900/40',
    text: 'text-emerald-300',
    icon: '🍽️',
    description: 'Your body is digesting and absorbing nutrients. Insulin levels are elevated, storing glucose as glycogen.',
    tip: 'Great time to hydrate! Drink a large glass of water.',
  },
  {
    id: 'post-absorptive',
    name: 'Post-Absorptive',
    range: [3, 8],
    color: '#f59e0b',
    bg: 'bg-yellow-900/40',
    text: 'text-yellow-300',
    icon: '🔄',
    description: 'Digestion is complete. Blood sugar stabilizes. Your liver starts releasing stored glycogen for energy.',
    tip: 'Insulin is dropping — this is where fat burning begins to ramp up!',
  },
  {
    id: 'early-fasting',
    name: 'Early Fasting',
    range: [8, 16],
    color: '#0ea5e9',
    bg: 'bg-sky-900/40',
    text: 'text-sky-300',
    icon: '⚡',
    description: 'Glycogen stores depleting. Your body shifts to fat oxidation. HGH begins to rise. Cellular repair (autophagy) initiates.',
    tip: 'You\'re in the fat-burning zone! Stay strong — the results are happening now.',
  },
  {
    id: 'ketosis',
    name: 'Ketosis',
    range: [16, 24],
    color: '#8b5cf6',
    bg: 'bg-violet-900/40',
    text: 'text-violet-300',
    icon: '🔥',
    description: 'Fat is your primary fuel. Ketone bodies are being produced. Mental clarity often improves. Autophagy is in full swing.',
    tip: 'This is where the MAGIC happens. Your body is becoming a fat-burning machine!',
  },
  {
    id: 'deep-ketosis',
    name: 'Deep Ketosis',
    range: [24, 999],
    color: '#f43f5e',
    bg: 'bg-rose-900/40',
    text: 'text-rose-300',
    icon: '🚀',
    description: 'Ketone levels are high. Maximum fat burning and autophagy. Growth hormone spikes. Immune system regeneration begins.',
    tip: 'Elite level fasting! Your body is doing incredible work right now.',
  },
];

function getPhase(hours) {
  return PHASES.find(p => hours >= p.range[0] && hours < p.range[1]) || PHASES[0];
}

// ─── XP & Levels ─────────────────────────────────────────────
const LEVELS = [
  { level: 1, name: 'Beginner Faster', xpNeeded: 0 },
  { level: 2, name: 'Fasting Rookie', xpNeeded: 100 },
  { level: 3, name: 'Fasting Apprentice', xpNeeded: 300 },
  { level: 4, name: 'Fasting Adept', xpNeeded: 600 },
  { level: 5, name: 'Fasting Expert', xpNeeded: 1000 },
  { level: 6, name: 'Fasting Master', xpNeeded: 1500 },
  { level: 7, name: 'Fasting Champion', xpNeeded: 2100 },
  { level: 8, name: 'Fasting Warrior', xpNeeded: 2800 },
  { level: 9, name: 'Fasting Legend', xpNeeded: 3600 },
  { level: 10, name: 'Fasting God', xpNeeded: 5000 },
];

function getLevelInfo(xp) {
  let current = LEVELS[0], next = LEVELS[1];
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].xpNeeded) { current = LEVELS[i]; next = LEVELS[i + 1] || null; break; }
  }
  const prevXp = current.xpNeeded;
  const nextXp = next ? next.xpNeeded : prevXp + 1000;
  const progress = Math.min(100, Math.round(((xp - prevXp) / (nextXp - prevXp)) * 100));
  return { level: current, next, progress, toNext: Math.max(0, nextXp - xp) };
}

function addXP(amount, reason) {
  const before = getLevelInfo(state.xp);
  state.xp += amount;
  const after = getLevelInfo(state.xp);
  saveState();
  showToast(`⚡ +${amount} XP — ${reason}`, 'success');
  if (after.level.level > before.level.level) {
    setTimeout(() => {
      showToast(`🎉 Level Up! You're now a ${after.level.name}!`, 'success');
      confetti();
    }, 800);
  }
  updateHeader();
  updateStatsPage();
}

// ─── Milestones ───────────────────────────────────────────────
const MILESTONES = [
  { id: 'first_fast', icon: '🌟', title: 'First Fast', desc: 'Complete your first fast', check: (s) => s.fasts.filter(f => f.completed).length >= 1 },
  { id: 'streak_3', icon: '🔥', title: 'On Fire', desc: '3-day fasting streak', check: (s) => s.streak >= 3 },
  { id: 'streak_7', icon: '💪', title: 'Week Warrior', desc: '7-day fasting streak', check: (s) => s.streak >= 7 },
  { id: 'streak_30', icon: '👑', title: 'Month Master', desc: '30-day fasting streak', check: (s) => s.streak >= 30 },
  { id: 'fasts_10', icon: '🏅', title: 'Dedicated', desc: 'Complete 10 fasts', check: (s) => s.fasts.filter(f => f.completed).length >= 10 },
  { id: 'fasts_50', icon: '🏆', title: 'Fasting Pro', desc: 'Complete 50 fasts', check: (s) => s.fasts.filter(f => f.completed).length >= 50 },
  { id: 'ketosis', icon: '🔥', title: 'Into Ketosis', desc: 'Reach ketosis phase (16h)', check: (s) => s.fasts.some(f => f.completed && f.duration >= 16) },
  { id: 'deep_ketosis', icon: '🚀', title: 'Deep Ketosis', desc: 'Complete a 24h+ fast', check: (s) => s.fasts.some(f => f.completed && f.duration >= 24) },
  { id: 'weight_logged', icon: '⚖️', title: 'Scale Scout', desc: 'Log your first weight', check: (s) => s.weights.length >= 1 },
  { id: 'weight_5', icon: '📉', title: 'Progress Made', desc: 'Log weight 5 times', check: (s) => s.weights.length >= 5 },
];

function checkMilestones() {
  const achieved = JSON.parse(localStorage.getItem('flc_milestones') || '[]');
  MILESTONES.forEach(m => {
    if (!achieved.includes(m.id) && m.check(state)) {
      achieved.push(m.id);
      localStorage.setItem('flc_milestones', JSON.stringify(achieved));
      setTimeout(() => {
        showToast(`🏆 Milestone: ${m.title} — ${m.desc}!`, 'success');
        confetti();
      }, 500);
    }
  });
}

function getAchievedMilestones() {
  return JSON.parse(localStorage.getItem('flc_milestones') || '[]');
}

// ─── Fast Controls ────────────────────────────────────────────
let fastTimerInterval = null;

function selectProtocol(hours) {
  state.settings.goalHours = hours;
  document.getElementById('custom-goal').value = hours;
  document.querySelectorAll('.proto-btn').forEach(b => {
    b.classList.remove('border-brand-500', 'bg-brand-900/20');
  });
  const btn = document.getElementById(`proto-${hours}`);
  if (btn) { btn.classList.add('border-brand-500', 'bg-brand-900/20'); }
  saveState();
}

function setCustomGoal(val) {
  state.settings.goalHours = parseInt(val) || 16;
  document.querySelectorAll('.proto-btn').forEach(b => b.classList.remove('border-brand-500', 'bg-brand-900/20'));
  saveState();
}

function startFast() {
  state.activeFast = {
    id: Date.now(),
    startTime: Date.now(),
    goalHours: state.settings.goalHours,
    water: 0,
    mood: null,
    energy: null,
    phaseNotified: [],
  };
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
  clearInterval(fastTimerInterval);

  const elapsed = (Date.now() - state.activeFast.startTime) / 3600000;
  const fast = {
    id: state.activeFast.id,
    startTime: state.activeFast.startTime,
    endTime: Date.now(),
    goalHours: state.activeFast.goalHours,
    duration: parseFloat(elapsed.toFixed(2)),
    completed,
    water: state.water,
    mood: state.currentMood,
    energy: state.currentEnergy,
  };

  state.fasts.unshift(fast);
  state.activeFast = null;
  saveState();

  if (completed) {
    updateStreak();
    const xpEarned = Math.round(50 + (elapsed >= fast.goalHours ? 50 : 0) + (elapsed * 2));
    addXP(xpEarned, 'Completed fast');
    confetti();
    showToast(`🎉 Amazing! Fast complete — ${formatDuration(elapsed)} fasted!`, 'success');
  } else {
    showToast('Fast cancelled. Tomorrow is a new opportunity!', 'info');
  }

  checkMilestones();
  showFastIdle();
  renderFastHistory();
  updateStatsPage();
}

function updateStreak() {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  if (state.lastFastDate === today) return;
  if (state.lastFastDate === yesterday || !state.lastFastDate) {
    state.streak++;
  } else {
    state.streak = 1;
  }
  state.lastFastDate = today;
  if (state.streak > state.bestStreak) state.bestStreak = state.streak;
  saveState();
  updateHeader();
}

function showFastIdle() {
  document.getElementById('fast-idle').classList.remove('hidden');
  document.getElementById('fast-active').classList.add('hidden');
  clearInterval(fastTimerInterval);
}

function showFastActive() {
  document.getElementById('fast-idle').classList.add('hidden');
  document.getElementById('fast-active').classList.remove('hidden');
  renderPhasesList();
  startFastTimer();
  renderWaterCups();
}

function startFastTimer() {
  clearInterval(fastTimerInterval);
  tickFastTimer();
  fastTimerInterval = setInterval(tickFastTimer, 1000);
}

function tickFastTimer() {
  if (!state.activeFast) return;
  const elapsed = (Date.now() - state.activeFast.startTime) / 1000;
  const goalSecs = state.activeFast.goalHours * 3600;
  const pct = Math.min(100, (elapsed / goalSecs) * 100);

  // Timer display
  document.getElementById('fast-elapsed').textContent = formatTime(elapsed);
  document.getElementById('fast-percent').textContent = pct.toFixed(1) + '%';

  // Ring
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (pct / 100) * circumference;
  const ring = document.getElementById('ring-fill');
  if (ring) ring.style.strokeDashoffset = offset;

  // Times
  const start = new Date(state.activeFast.startTime);
  const eat = new Date(state.activeFast.startTime + state.activeFast.goalHours * 3600000);
  document.getElementById('fast-start-time').textContent = formatClock(start);
  document.getElementById('fast-eat-time').textContent = formatClock(eat);
  document.getElementById('fast-goal-display').textContent = state.activeFast.goalHours + ':00';

  // Phase
  const hours = elapsed / 3600;
  const phase = getPhase(hours);
  const badge = document.getElementById('fast-phase-badge');
  if (badge) badge.textContent = phase.icon + ' ' + phase.name;

  // Phase notifications
  checkPhaseNotifications(hours);

  // Update ring color by phase
  if (ring) ring.style.stroke = phase.color;
}

function checkPhaseNotifications(hours) {
  if (!state.activeFast || !state.settings.phaseNotif) return;
  PHASES.forEach(p => {
    if (hours >= p.range[0] && !state.activeFast.phaseNotified.includes(p.id) && p.range[0] > 0) {
      state.activeFast.phaseNotified.push(p.id);
      saveState();
      sendNotification(`${p.icon} Entering ${p.name}`, p.tip);
    }
  });
}

function addWater() {
  state.water = (state.water || 0) + 1;
  if (state.activeFast) state.activeFast.water = state.water;
  saveState();
  renderWaterCups();
  const btn = document.querySelector('[onclick="addWater()"]');
  if (btn) btn.classList.add('ripple');
  setTimeout(() => btn && btn.classList.remove('ripple'), 400);
  if (state.water % 3 === 0) {
    showToast('💧 Great job staying hydrated! You got this!', 'info');
  }
}

function renderWaterCups() {
  const container = document.getElementById('water-cups');
  const count = document.getElementById('water-count');
  if (!container) return;
  const w = state.water || 0;
  container.innerHTML = '';
  for (let i = 0; i < Math.max(8, w); i++) {
    const cup = document.createElement('span');
    cup.textContent = i < w ? '💧' : '○';
    cup.className = 'text-sm ' + (i < w ? 'text-blue-400' : 'text-slate-600');
    container.appendChild(cup);
  }
  if (count) count.textContent = `${w} glass${w !== 1 ? 'es' : ''}`;
}

function setMood(type, val) {
  if (type === 'mood') {
    state.currentMood = val;
    if (state.activeFast) state.activeFast.mood = val;
  } else {
    state.currentEnergy = val;
    if (state.activeFast) state.activeFast.energy = val;
  }
  saveState();
  document.querySelectorAll(`.mood-btn[data-type="${type}"]`).forEach(b => {
    b.classList.toggle('selected', parseInt(b.dataset.val) === val);
  });
}

function renderPhasesList() {
  const container = document.getElementById('phases-list');
  if (!container) return;
  const hours = state.activeFast ? (Date.now() - state.activeFast.startTime) / 3600000 : 0;
  container.innerHTML = PHASES.map(p => {
    const active = hours >= p.range[0] && hours < p.range[1];
    const done = hours >= p.range[1];
    return `
      <div class="flex gap-3 p-3 rounded-xl border transition-all ${active ? p.bg + ' border-opacity-50' : 'border-surface-700'}" style="border-color: ${active ? p.color + '40' : ''}">
        <div class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm ${done ? 'bg-emerald-900/50' : active ? '' : 'bg-surface-900'}" style="${active ? 'background:' + p.color + '20' : ''}">
          ${done ? '✅' : active ? p.icon : '<span class="text-slate-600">' + p.icon + '</span>'}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold ${active ? p.text : done ? 'text-emerald-400' : 'text-slate-500'}">${p.name}</span>
            <span class="text-xs text-slate-600">${p.range[0]}h${p.range[1] < 999 ? '–' + p.range[1] + 'h' : '+'}</span>
            ${active ? '<span class="text-xs px-1.5 py-0.5 rounded-full font-bold animate-pulse" style="background:' + p.color + '20;color:' + p.color + '">NOW</span>' : ''}
          </div>
          ${active ? `<p class="text-xs text-slate-400 mt-0.5 leading-relaxed">${p.description}</p>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// ─── Weight ───────────────────────────────────────────────────
let weightChart = null;

function logWeight() {
  const input = document.getElementById('weight-input');
  const dateInput = document.getElementById('weight-date');
  const noteInput = document.getElementById('weight-note');
  const val = parseFloat(input.value);
  if (!val || val <= 0) { showToast('Please enter a valid weight', 'error'); return; }

  const entry = {
    id: Date.now(),
    weight: val,
    unit: state.settings.unit,
    date: dateInput.value || new Date().toISOString().split('T')[0],
    note: noteInput.value.trim(),
    timestamp: Date.now(),
  };

  state.weights.unshift(entry);
  saveState();
  input.value = '';
  noteInput.value = '';

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

function changeUnit(unit) {
  state.settings.unit = unit;
  saveState();
}

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
  toggleGoalEdit();
  renderWeightPage();
  showToast('Goal saved!', 'success');
}

function setChartRange(days) {
  state.chartRange = days;
  ['7', '30', '90'].forEach(d => {
    document.getElementById(`chart-${d}`)?.classList.toggle('active', d == days);
  });
  renderWeightChart();
}

function renderWeightPage() {
  renderWeightStats();
  renderWeightChart();
  renderWeightList();
}

function renderWeightStats() {
  const weights = [...state.weights].sort((a, b) => new Date(a.date) - new Date(b.date));
  const unit = state.settings.unit;

  const current = weights.length ? weights[weights.length - 1].weight : null;
  const first = weights.length > 1 ? weights[0].weight : null;
  const change = current && first ? (current - first).toFixed(1) : null;

  document.getElementById('stat-current').textContent = current ? `${current} ${unit}` : '--';
  document.getElementById('stat-change').textContent = change !== null ? `${change > 0 ? '+' : ''}${change} ${unit}` : '--';
  document.getElementById('stat-change').className = 'text-lg font-bold ' + (change < 0 ? 'text-emerald-400' : change > 0 ? 'text-red-400' : 'text-white');
  document.getElementById('stat-goal').textContent = state.settings.goalWeight ? `${state.settings.goalWeight} ${unit}` : '--';

  // Progress bar
  if (state.settings.startWeight && state.settings.goalWeight && current) {
    const start = state.settings.startWeight;
    const goal = state.settings.goalWeight;
    const progress = Math.min(100, Math.max(0, ((start - current) / (start - goal)) * 100));
    document.getElementById('goal-progress-bar').style.width = progress + '%';
    document.getElementById('goal-percent-text').textContent = Math.round(progress) + '%';
  }
}

function renderWeightChart() {
  const canvas = document.getElementById('weightChart');
  if (!canvas) return;

  const days = state.chartRange;
  const cutoff = Date.now() - days * 86400000;
  const filtered = state.weights
    .filter(w => new Date(w.date).getTime() >= cutoff)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const labels = filtered.map(w => {
    const d = new Date(w.date);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });
  const data = filtered.map(w => w.weight);

  if (weightChart) weightChart.destroy();

  weightChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: `Weight (${state.settings.unit})`,
        data,
        borderColor: '#0ea5e9',
        backgroundColor: 'rgba(14,165,233,0.1)',
        borderWidth: 2,
        pointBackgroundColor: '#0ea5e9',
        pointRadius: 4,
        fill: true,
        tension: 0.4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1e293b', titleColor: '#e2e8f0', bodyColor: '#94a3b8', borderColor: '#334155', borderWidth: 1 } },
      scales: {
        x: { grid: { color: '#1e293b' }, ticks: { color: '#64748b', font: { size: 10 } } },
        y: { grid: { color: '#1e293b' }, ticks: { color: '#64748b', font: { size: 10 } } },
      }
    }
  });
}

function renderWeightList() {
  const container = document.getElementById('weight-log-list');
  const count = document.getElementById('weight-log-count');
  if (!container) return;

  const sorted = [...state.weights].sort((a, b) => new Date(b.date) - new Date(a.date));
  count.textContent = `${sorted.length} entries`;

  if (!sorted.length) {
    container.innerHTML = '<p class="text-slate-500 text-xs text-center py-4">No weight logged yet.</p>';
    return;
  }

  container.innerHTML = sorted.slice(0, 20).map(w => `
    <div class="flex items-center justify-between py-2 border-b border-surface-700 last:border-0">
      <div>
        <div class="text-sm font-semibold text-white">${w.weight} ${w.unit || state.settings.unit}</div>
        ${w.note ? `<div class="text-xs text-slate-500">${escHtml(w.note)}</div>` : ''}
      </div>
      <div class="flex items-center gap-2">
        <div class="text-xs text-slate-400">${formatDate(w.date)}</div>
        <button onclick="deleteWeight(${w.id})" class="text-slate-600 hover:text-red-400 transition-colors text-xs">✕</button>
      </div>
    </div>
  `).join('');
}

// ─── Fast History ─────────────────────────────────────────────
function renderFastHistory() {
  const container = document.getElementById('fast-history');
  const count = document.getElementById('history-count');
  if (!container) return;

  count.textContent = `${state.fasts.length} fasts`;

  if (!state.fasts.length) {
    container.innerHTML = '<p class="text-slate-500 text-xs text-center py-4">No fasts logged yet. Start your first fast!</p>';
    return;
  }

  container.innerHTML = state.fasts.slice(0, 10).map(f => {
    const start = new Date(f.startTime);
    const phase = getPhase(f.duration);
    return `
      <div class="flex items-center gap-3 p-3 bg-surface-900 rounded-xl">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center text-base" style="background:${phase.color}20">${f.completed ? phase.icon : '❌'}</div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-white">${formatDuration(f.duration)}</span>
            <span class="text-xs px-1.5 py-0.5 rounded-full ${f.completed ? 'bg-emerald-900/50 text-emerald-400' : 'bg-red-900/50 text-red-400'}">${f.completed ? 'Completed' : 'Cancelled'}</span>
          </div>
          <div class="text-xs text-slate-400">${formatDate(start.toISOString().split('T')[0])} · Goal: ${f.goalHours}h</div>
        </div>
        <div class="flex gap-1 text-xs">
          ${f.mood ? `<span>${['😢','😐','😊','😄'][f.mood - 1]}</span>` : ''}
          ${f.energy ? `<span>${['🪫','😴','⚡','🚀'][f.energy - 1]}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// ─── Stats Page ───────────────────────────────────────────────
let fastChart = null;

function updateStatsPage() {
  const li = getLevelInfo(state.xp);
  document.getElementById('stats-level-badge').textContent = li.level.level;
  document.getElementById('stats-level-name').textContent = li.level.name;
  document.getElementById('stats-xp-text').textContent = `${state.xp} XP`;
  document.getElementById('stats-xp-bar').style.width = li.progress + '%';
  document.getElementById('stats-xp-next').textContent = li.next ? `${li.toNext} XP to ${li.next.name}` : 'Max level!';

  document.getElementById('stats-streak').textContent = `${state.streak} day streak`;
  document.getElementById('stats-best-streak').textContent = state.bestStreak;

  const completed = state.fasts.filter(f => f.completed);
  document.getElementById('stats-total-fasts').textContent = state.fasts.length;
  document.getElementById('stats-completed-fasts').textContent = completed.length;

  const avg = completed.length ? completed.reduce((a, f) => a + f.duration, 0) / completed.length : 0;
  document.getElementById('stats-avg-fast').textContent = avg ? formatDuration(avg) : '0h';

  const longest = completed.length ? Math.max(...completed.map(f => f.duration)) : 0;
  document.getElementById('stats-longest-fast').textContent = longest ? formatDuration(longest) : '0h';

  renderFastChart();
  renderMilestonesList();
}

function renderFastChart() {
  const canvas = document.getElementById('fastChart');
  if (!canvas) return;

  const days = 14;
  const labels = [];
  const data = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const dateStr = d.toISOString().split('T')[0];
    labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
    const dayFasts = state.fasts.filter(f => {
      const fd = new Date(f.startTime).toISOString().split('T')[0];
      return fd === dateStr && f.completed;
    });
    data.push(dayFasts.length ? dayFasts.reduce((a, f) => a + f.duration, 0) : 0);
  }

  if (fastChart) fastChart.destroy();
  fastChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Hours fasted',
        data,
        backgroundColor: data.map(v => v >= 16 ? '#8b5cf6' : v > 0 ? '#0ea5e9' : '#1e293b'),
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1e293b', titleColor: '#e2e8f0', bodyColor: '#94a3b8' } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 9 } } },
        y: { grid: { color: '#1e293b' }, ticks: { color: '#64748b', font: { size: 10 } }, beginAtZero: true },
      }
    }
  });
}

function renderMilestonesList() {
  const container = document.getElementById('milestones-list');
  if (!container) return;
  const achieved = getAchievedMilestones();
  container.innerHTML = MILESTONES.map(m => {
    const done = achieved.includes(m.id);
    return `
      <div class="milestone ${done ? 'achieved' : ''}">
        <div class="text-2xl ${done ? '' : 'grayscale opacity-40'}">${m.icon}</div>
        <div>
          <div class="text-sm font-semibold ${done ? 'text-white' : 'text-slate-500'}">${m.title}</div>
          <div class="text-xs ${done ? 'text-slate-400' : 'text-slate-600'}">${m.desc}</div>
        </div>
        ${done ? '<span class="ml-auto text-yellow-400 text-xs">✓</span>' : ''}
      </div>
    `;
  }).join('');
}

// ─── Header ───────────────────────────────────────────────────
function updateHeader() {
  document.getElementById('header-xp').textContent = `${state.xp} XP`;
  document.getElementById('header-streak').textContent = state.streak;
}

// ─── Navigation ───────────────────────────────────────────────
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`page-${name}`)?.classList.add('active');
  document.getElementById(`nav-${name}`)?.classList.add('active');

  if (name === 'weight') renderWeightPage();
  if (name === 'stats') updateStatsPage();
}

// ─── Settings ─────────────────────────────────────────────────
function saveName() {
  const name = document.getElementById('settings-name').value.trim();
  state.settings.name = name;
  saveState();
  showToast(name ? `Hi ${name}! 👋` : 'Name cleared', 'success');
}

function toggleNotifications() {
  if (!state.settings.notif) {
    Notification.requestPermission().then(perm => {
      state.settings.notif = perm === 'granted';
      saveState();
      updateToggleUI();
      if (perm === 'granted') showToast('Notifications enabled!', 'success');
      else showToast('Please allow notifications in browser settings', 'error');
    });
  } else {
    state.settings.notif = false;
    saveState();
    updateToggleUI();
  }
}

function toggleSetting(key) {
  state.settings[key + 'Notif'] = !state.settings[key + 'Notif'];
  saveState();
  updateToggleUI();
}

function updateToggleUI() {
  const setToggle = (id, thumbId, on) => {
    const el = document.getElementById(id);
    const thumb = document.getElementById(thumbId);
    if (el) el.className = `relative w-12 h-6 rounded-full transition-all ${on ? 'bg-brand-500' : 'bg-surface-700'}`;
    if (thumb) thumb.className = `absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${on ? 'left-7' : 'left-1'}`;
  };
  setToggle('notif-toggle', 'notif-thumb', state.settings.notif);
  setToggle('water-toggle', 'water-thumb', state.settings.waterNotif);
  setToggle('phase-toggle', 'phase-thumb', state.settings.phaseNotif);
}

// ─── Notifications ────────────────────────────────────────────
function sendNotification(title, body) {
  if (!state.settings.notif || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' });
  } catch (e) {}
}

const WATER_MESSAGES = [
  "You got this, stay hydrated! 💧",
  "Drink up! Water fuels your fast ⚡",
  "Hydration is your superpower! 🌊",
  "A glass of water keeps the hunger away! 💪",
  "Sip sip hooray! Keep hydrating! 🎉",
];

function scheduleFastNotifications() {
  if (!state.settings.notif || !('serviceWorker' in navigator)) return;
  // Water reminders every 2 hours
  if (state.settings.waterNotif) {
    for (let i = 1; i <= Math.floor(state.settings.goalHours / 2); i++) {
      const delay = i * 2 * 3600 * 1000;
      setTimeout(() => {
        if (state.activeFast) {
          const msg = WATER_MESSAGES[Math.floor(Math.random() * WATER_MESSAGES.length)];
          sendNotification('💧 Water Reminder', msg);
        }
      }, delay);
    }
    // Countdown reminders
    const goalMs = state.settings.goalHours * 3600000;
    [2 * 3600000, 1 * 3600000, 30 * 60000].forEach(timeLeft => {
      const delay = goalMs - timeLeft;
      if (delay > 0) {
        setTimeout(() => {
          if (state.activeFast) {
            const h = Math.round(timeLeft / 3600000);
            const m = Math.round(timeLeft / 60000);
            const label = h >= 1 ? `${h} hour${h > 1 ? 's' : ''}` : `${m} minutes`;
            sendNotification('⏰ Almost there!', `Just ${label} left — you're crushing it! 🔥`);
          }
        }, delay);
      }
    });
  }
}

// ─── Data Backup ──────────────────────────────────────────────
function exportData() {
  const data = { state, milestones: getAchievedMilestones(), exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fitlastchance-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Backup exported!', 'success');
}

function importData(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.state) {
        state = { ...state, ...data.state };
        state.settings = { ...state.settings, ...(data.state.settings || {}) };
        saveState();
      }
      if (data.milestones) localStorage.setItem('flc_milestones', JSON.stringify(data.milestones));
      showToast('Backup imported successfully!', 'success');
      location.reload();
    } catch (err) {
      showToast('Invalid backup file', 'error');
    }
  };
  reader.readAsText(file);
}

function confirmReset() {
  openModal(`
    <h3 class="font-bold text-white text-lg mb-2">Reset All Data?</h3>
    <p class="text-slate-400 text-sm mb-4">This will permanently delete all your fasting and weight data. This cannot be undone.</p>
    <button onclick="resetData()" class="btn-danger mb-2">Yes, Delete Everything</button>
    <button onclick="closeModal()" class="btn-ghost">Cancel</button>
  `);
}

function resetData() {
  localStorage.removeItem(STATE_KEY);
  localStorage.removeItem('flc_milestones');
  closeModal();
  location.reload();
}

// ─── Settings Modal ───────────────────────────────────────────
function openSettingsModal() {
  document.getElementById('settings-name').value = state.settings.name;
  showPage('settings');
}

// ─── Modal ────────────────────────────────────────────────────
function openModal(html) {
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('overlay').style.display = 'block';
  document.getElementById('modal').style.display = 'block';
}

function closeModal() {
  document.getElementById('overlay').style.display = 'none';
  document.getElementById('modal').style.display = 'none';
}

// ─── Toast ────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const colors = { success: 'border-emerald-500/40', error: 'border-red-500/40', info: 'border-brand-500/40' };
  toast.className = `toast ${colors[type] || colors.info}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ─── Confetti ─────────────────────────────────────────────────
function confetti() {
  const colors = ['#0ea5e9', '#6366f1', '#f59e0b', '#10b981', '#f43f5e', '#8b5cf6'];
  for (let i = 0; i < 60; i++) {
    const particle = document.createElement('div');
    particle.className = 'confetti-particle';
    particle.style.cssText = `
      left: ${Math.random() * 100}vw;
      top: -10px;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      animation-duration: ${1.5 + Math.random() * 2}s;
      animation-delay: ${Math.random() * 0.5}s;
      transform: rotate(${Math.random() * 360}deg);
      width: ${6 + Math.random() * 6}px;
      height: ${6 + Math.random() * 6}px;
    `;
    document.body.appendChild(particle);
    setTimeout(() => particle.remove(), 3500);
  }
}

// ─── PWA Install ──────────────────────────────────────────────
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = document.getElementById('install-btn');
  const note = document.getElementById('install-note');
  if (btn) btn.classList.remove('hidden');
  if (note) note.classList.add('hidden');
});

function installPWA() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  deferredInstallPrompt.userChoice.then((result) => {
    deferredInstallPrompt = null;
    if (result.outcome === 'accepted') showToast('App installed!', 'success');
  });
}

// ─── Utilities ────────────────────────────────────────────────
function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function formatDuration(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatClock(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Init ─────────────────────────────────────────────────────
function init() {
  loadState();
  updateHeader();
  updateToggleUI();

  // Restore active fast
  if (state.activeFast) {
    showFastActive();
    renderWaterCups();
    if (state.currentMood) setMood('mood', state.currentMood);
    if (state.currentEnergy) setMood('energy', state.currentEnergy);
  }

  renderFastHistory();

  // Set today's date on weight page
  document.getElementById('weight-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('weight-unit').value = state.settings.unit;

  // Set custom goal
  document.getElementById('custom-goal').value = state.settings.goalHours;

  // Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Greeting
  if (state.settings.name) {
    showToast(`Welcome back, ${state.settings.name}! 👋`, 'info');
  }
}

document.addEventListener('DOMContentLoaded', init);
