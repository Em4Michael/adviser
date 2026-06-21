// ============================================================
//  AGRISENSE v2.1 — APP.JS
//  WebSocket + Live Graphs + Rich Animations
// ============================================================

// ── Configuration ──────────────────────────────────────────
const SERVER_URL = 'adviser-server.onrender.com';
const USE_SSL    = true;

const wsProtocol  = USE_SSL ? 'wss:' : 'ws:';
const httpProtocol = USE_SSL ? 'https:' : 'http:';
const wsUrl  = `${wsProtocol}//${SERVER_URL}`;
const apiUrl = `${httpProtocol}//${SERVER_URL}`;

// ── State ───────────────────────────────────────────────────
let ws = null;
let reconnectAttempts = 0;
let soundEnabled = false;
let audioContext  = null;
let historyData   = [];
const MAX_HISTORY = 20;
let allReadingsCache = [];

// Chart instances
let mainChart    = null;
let tempSpark    = null;
let humSpark     = null;
let moistSpark   = null;
let uvSpark      = null;
let rainSpark    = null;
let multiChart   = null;

// Mini spark data buffers
const sparkData = { TP:[], HM:[], MO:[], UV:[], RN:[] };
const MAX_SPARK = 24;

// Modal state
let currentSensor    = null;
let currentTimeRange = 24;

// Prev readings for trend arrows
let prevReadings = {};

// ── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  showLoader();
  loadTheme();
  loadSoundState();
  initClock();
  buildHeatmap();
  buildUVHourBars();
  buildRainBars();
  initMiniSparks();
  initMultiChart();

  // Staggered reveal after brief loader
  setTimeout(() => {
    hideLoader();
    revealElements();
  }, 1800);

  connect();
  fetchInitialData();

  // Modal keyboard dismiss
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeGraphModal(); });
  document.getElementById('graphModal').addEventListener('click', e => {
    if (e.target.id === 'graphModal') closeGraphModal();
  });
  // Theme menu dismiss
  document.addEventListener('click', e => {
    if (!e.target.closest('.theme-dropdown'))
      document.getElementById('themeMenu').classList.remove('active');
  });
});

// ── Loader ──────────────────────────────────────────────────
function showLoader() {
  document.getElementById('pageLoader').classList.remove('hidden');
}
function hideLoader() {
  document.getElementById('pageLoader').classList.add('hidden');
}

// ── Stagger reveal ──────────────────────────────────────────
function revealElements() {
  const cards  = document.querySelectorAll('.card');
  const stats  = document.querySelectorAll('.stat-card');
  const header = document.getElementById('mainHeader');

  header?.classList.add('visible');

  stats.forEach((el, i) => {
    setTimeout(() => el.classList.add('visible'), 60 + i * 60);
  });
  cards.forEach((el, i) => {
    setTimeout(() => el.classList.add('visible'), 200 + i * 70);
  });
  // Heatmap cells
  const cells = document.querySelectorAll('.hm-cell');
  cells.forEach((c, i) => {
    setTimeout(() => c.classList.add('visible'), 600 + i * 18);
  });
  // Health bars animate to actual widths
  setTimeout(() => {
    document.querySelectorAll('.hm-bar-fill').forEach(el => {
      el.style.width = el.style.getPropertyValue('--pct') || '0%';
    });
  }, 800);
}

// ── Clock ────────────────────────────────────────────────────
function initClock() {
  tick();
  setInterval(tick, 1000);
}
function tick() {
  const now = new Date();
  const t = now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true });
  const d = now.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' });
  const el = document.getElementById('clock');
  if (el) el.textContent = t;
  const de = document.getElementById('dateDisplay');
  if (de) de.textContent = d;
  const fd = document.getElementById('footerDate');
  if (fd) fd.textContent = d;
}

// ── Theme ────────────────────────────────────────────────────
function loadTheme() {
  setTheme(localStorage.getItem('agrisense-theme') || 'dark', false);
}
function setTheme(name, save = true) {
  document.documentElement.setAttribute('data-theme', name);
  if (save) localStorage.setItem('agrisense-theme', name);
  const icons  = { dark:'🌙', light:'☀️', midnight:'🌌', forest:'🌲', ocean:'🌊' };
  const labels = { dark:'Dark', light:'Light', midnight:'Midnight', forest:'Forest', ocean:'Ocean' };
  const ti = document.getElementById('themeIcon');
  const tn = document.getElementById('themeName');
  if (ti) ti.textContent = icons[name]  || '🌙';
  if (tn) tn.textContent = labels[name] || 'Dark';
  document.querySelectorAll('.theme-opt').forEach(o => o.classList.toggle('active', o.dataset.theme === name));
  document.getElementById('themeMenu')?.classList.remove('active');
  updateChartsTheme();
}
function toggleThemeMenu() {
  document.getElementById('themeMenu')?.classList.toggle('active');
}

function getChartColors() {
  const s = getComputedStyle(document.documentElement);
  return {
    primary:   s.getPropertyValue('--accent').trim()          || '#22c55e',
    text:      s.getPropertyValue('--text-primary').trim()    || '#e8edf2',
    muted:     s.getPropertyValue('--text-muted').trim()      || '#4a5560',
    grid:      s.getPropertyValue('--border').trim()          || 'rgba(255,255,255,.07)',
    bg:        s.getPropertyValue('--bg-card').trim()         || '#161b21',
    surface:   s.getPropertyValue('--bg-surface').trim()      || '#111519',
  };
}
function updateChartsTheme() {
  const c = getChartColors();
  [tempSpark, humSpark, moistSpark, uvSpark, rainSpark].forEach(ch => {
    if (!ch) return;
    ch.data.datasets[0].borderColor = c.primary;
    ch.data.datasets[0].backgroundColor = hexToRgba(c.primary, .08);
    ch.update('none');
  });
  if (multiChart) {
    multiChart.options.scales.x.grid.color = c.grid;
    multiChart.options.scales.y.grid.color = c.grid;
    multiChart.update('none');
  }
}

// ── Sound ────────────────────────────────────────────────────
function loadSoundState() {
  soundEnabled = localStorage.getItem('agrisense-sound') === 'true';
  updateSoundUI();
}
function updateSoundUI() {
  const btn  = document.getElementById('soundBtn');
  const icon = document.getElementById('soundIcon');
  btn?.classList.toggle('enabled', soundEnabled);
  if (icon) icon.textContent = soundEnabled ? '🔊' : '🔇';
}
function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem('agrisense-sound', soundEnabled);
  updateSoundUI();
  if (soundEnabled) playNotificationSound();
}
function getAudio() {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  return audioContext;
}
function playNotificationSound() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudio(); const now = ctx.currentTime;
    [523.25, 659.25].forEach(freq => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = freq; o.type = 'sine';
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(.12, now + .05);
      g.gain.exponentialRampToValueAtTime(.001, now + .4);
      o.start(now); o.stop(now + .4);
    });
  } catch(e) {}
}
function playAlertSound(type) {
  if (!soundEnabled) return;
  try {
    const ctx = getAudio(); const now = ctx.currentTime;
    const freqs = type === 'uv_high' ? [880, 698, 587] : [523, 659, 784];
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = f;
      o.type = type === 'uv_high' ? 'triangle' : 'sine';
      const t = now + i * .13;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(.15, t + .02);
      g.gain.exponentialRampToValueAtTime(.001, t + .13);
      o.start(t); o.stop(t + .2);
    });
  } catch(e) {}
}

// ── WebSocket ────────────────────────────────────────────────
function connect() {
  ws = new WebSocket(wsUrl);
  const dot   = document.getElementById('connDot');
  const label = document.getElementById('connLabel');

  ws.onopen = () => {
    dot?.classList.add('connected');
    if (label) label.textContent = 'Connected';
    reconnectAttempts = 0;
    ws.send(JSON.stringify({ type:'dashboard' }));
  };
  ws.onclose = () => {
    dot?.classList.remove('connected');
    if (label) label.textContent = 'Reconnecting…';
    reconnectAttempts++;
    setTimeout(connect, Math.min(1000 * reconnectAttempts, 10000));
  };
  ws.onerror = () => { if (label) label.textContent = 'Error'; };
  ws.onmessage = ({ data }) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'sensor') {
        updateDashboard(msg.data);
        addToHistory(msg.data);
        addToSparkBuffers(msg.data);
        updateMiniSparks();
        cacheReading(msg.data);
        updateMultiChart();
      } else if (msg.type === 'alert') {
        showToast(msg.data);
        addAlertToList(msg.data);
      } else if (msg.type === 'recent_alerts') {
        msg.data.slice().reverse().forEach(a => addAlertToList(a));
      }
    } catch(e) { console.error(e); }
  };
}

// ── Initial fetch ─────────────────────────────────────────────
async function fetchInitialData() {
  try {
    const res = await fetch(`${apiUrl}/api/readings?limit=200`);
    const readings = await res.json();
    if (Array.isArray(readings) && readings.length > 0) {
      allReadingsCache = readings.slice().reverse();
      historyData = allReadingsCache.slice(-MAX_HISTORY).slice().reverse();
      renderHistory();
      const last = allReadingsCache[allReadingsCache.length - 1];
      updateDashboard(last);
      allReadingsCache.slice(-MAX_SPARK).forEach(r => {
        ['TP','HM','MO','UV','RN'].forEach(k => { if (r[k] != null) addToSparkBuffer(k, r[k]); });
      });
      updateMiniSparks();
      updateMultiChart();
    }
    const ar = await fetch(`${apiUrl}/api/alerts?limit=8`);
    const alerts = await ar.json();
    if (Array.isArray(alerts)) alerts.slice().reverse().forEach(a => addAlertToList(a));
  } catch(e) {
    console.warn('Could not fetch initial data:', e);
    // Use demo data so the UI isn't empty
    seedDemoData();
  }
}

// ── Demo seed (used when no server) ──────────────────────────
function seedDemoData() {
  const now = Date.now();
  const demo = Array.from({length:24},(_,i)=>({
    TP: 27 + Math.sin(i/4)*5 + Math.random(),
    HM: 75 + Math.cos(i/3)*10 + Math.random()*2,
    MO: 48 - i*.4 + Math.random()*3,
    UV: i >= 6 && i <= 18 ? Math.max(0, 7*Math.sin(Math.PI*(i-6)/12) + Math.random()) : 0,
    RN: Math.random() < .25 ? Math.random()*30 : 0,
    HI: 30 + Math.sin(i/4)*6,
    Pump: i>14 && i<18 ? 1 : 0,
    Time: new Date(now - (23-i)*3600000).toLocaleTimeString(),
    timestamp: new Date(now - (23-i)*3600000).toISOString(),
  }));
  allReadingsCache = demo;
  historyData = demo.slice(-MAX_HISTORY).slice().reverse();
  renderHistory();
  updateDashboard(demo[demo.length-1]);
  demo.forEach(r => { ['TP','HM','MO','UV','RN'].forEach(k=>{ if(r[k]!=null) addToSparkBuffer(k,r[k]); }); });
  updateMiniSparks();
  updateMultiChart();
}

// ── Readings cache ────────────────────────────────────────────
function cacheReading(data) {
  allReadingsCache.push({ ...data, timestamp: data.timestamp || new Date().toISOString() });
  if (allReadingsCache.length > 500) allReadingsCache.shift();
}

// ── Dashboard update ──────────────────────────────────────────
function updateDashboard(data) {
  // UV ring
  updateUVRing(data.UV);
  // Heat Index needle
  updateHINeedle(data.HI, data.TP, data.HM);
  // Stat strip — update inner span values (units are in sibling .stat-unit spans)
  setSpanText('sc-tp-val', formatVal(data.TP, 1));
  setSpanText('sc-hm-val', formatVal(data.HM, 0));
  setSpanText('sc-uv-val', formatVal(data.UV, 1));
  setSpanText('sc-mo-val', formatVal(data.MO, 0));
  setSpanText('sc-rn-val', formatVal(data.RN, 0));
  // Temperature big card
  flashSet('tempBig', formatVal(data.TP, 1));
  computeTempStats();
  // Trend badges
  setTrend('trend-tp', data.TP, 'TP');
  setTrend('trend-hm', data.HM, 'HM');
  setTrend('trend-mo', data.MO, 'MO');
  // Donuts
  updateDonut('soilDonut', data.MO, 100, 'soilVal', '%', 'soilZone');
  updateDonut('humDonut',  data.HM, 100, 'humVal',  '%', 'humZone');
  // Pump
  updatePump(data.Pump);
  // UV badge
  updateUVBadge(data.UV);
  // Save prev
  ['TP','HM','MO','UV','RN'].forEach(k => { if (data[k] != null) prevReadings[k] = data[k]; });
}

function formatVal(v, dec=1) {
  if (v == null || isNaN(v)) return '--';
  return Number(v).toFixed(dec);
}

// Set text on a plain element (no child spans to preserve)
function flashSet(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.classList.remove('updating');
  void el.offsetWidth;
  el.classList.add('updating');
  setTimeout(() => el.classList.remove('updating'), 500);
}

// Set text on a <span> inside a stat-num (preserves sibling .stat-unit)
function setSpanText(id, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.classList.remove('updating');
  void el.offsetWidth;
  el.classList.add('updating');
  setTimeout(() => el.classList.remove('updating'), 500);
}

function flash(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('updating');
  void el.offsetWidth;
  el.classList.add('updating');
}

// ── UV Ring ───────────────────────────────────────────────────
function updateUVRing(uv) {
  if (uv == null) return;
  const circ = 2 * Math.PI * 66; // ~415
  const pct  = Math.min(uv / 11, 1);
  const offset = circ - pct * circ;
  const ring = document.getElementById('uvRingFill');
  if (ring) ring.style.strokeDashoffset = offset;

  const valEl   = document.getElementById('uvValue');
  const labelEl = document.getElementById('uvLabel');
  const badgeEl = document.getElementById('uvBadge');
  const cardEl  = document.getElementById('uvCard');

  if (valEl) { valEl.textContent = Number(uv).toFixed(1); flash('uvValue'); }

  let status, cls;
  if (uv <= 2)      { status = 'Low';       cls = ''; }
  else if (uv <= 5) { status = 'Moderate';  cls = 'badge-y'; }
  else if (uv <= 7) { status = 'High';      cls = 'badge-y'; }
  else              { status = 'Very High'; cls = 'badge-r'; }

  if (labelEl) labelEl.textContent = status.toUpperCase();
  if (badgeEl) { badgeEl.textContent = status; badgeEl.className = 'badge ' + cls; }
  if (cardEl)  cardEl.classList.toggle('uv-alert', uv > 5);
}

// Also update stat-strip uv badge
function updateUVBadge(uv) {
  const b = document.getElementById('uv-badge');
  if (!b || uv == null) return;
  let status, cls;
  if (uv <= 2)      { status='Low';       cls='badge-g'; }
  else if (uv <= 5) { status='Moderate';  cls='badge-y'; }
  else if (uv <= 7) { status='High';      cls='badge-y'; }
  else              { status='Very High'; cls='badge-r'; }
  b.textContent = status;
  b.className = 'badge ' + cls;
}

// ── HI Needle ─────────────────────────────────────────────────
function updateHINeedle(hi, tp, hm) {
  const hiVal = hi != null ? hi : (tp != null ? tp : 35);
  const val = document.getElementById('hiValue');
  const needle = document.getElementById('hiNeedle');
  const badge  = document.getElementById('hiBadge');
  const prog   = document.getElementById('hiProgress');
  const add    = document.getElementById('hiHumAdd');
  const real   = document.getElementById('hiRealTemp');

  if (val) { val.textContent = Number(hiVal).toFixed(1); flash('hiValue'); }

  const pct = Math.max(0, Math.min(1, (hiVal - 20) / 30));
  const deg = -90 + pct * 180;
  if (needle) needle.style.transform = `rotate(${deg}deg)`;

  let cls, label;
  if (pct < .35)      { cls='badge-g'; label='Good'; }
  else if (pct < .65) { cls='badge-y'; label='Caution'; }
  else                { cls='badge-r'; label='Danger'; }
  if (badge) { badge.textContent = label; badge.className = 'badge ' + cls; }
  if (prog)  { prog.style.width = (pct*100)+'%'; }

  const diff = hi != null && tp != null ? (hi - tp).toFixed(1) : '--';
  if (add)  add.textContent  = diff !== '--' ? `+${diff}°` : '--';
  if (real) real.textContent = tp != null ? `${Number(tp).toFixed(1)}°C` : '--';
}

// ── Trend badges ──────────────────────────────────────────────
function setTrend(id, val, key) {
  const el = document.getElementById(id);
  if (!el || val == null) return;
  const prev = prevReadings[key];
  if (prev == null) return;
  const diff = val - prev;
  if (Math.abs(diff) < 0.1) { el.textContent=''; return; }
  el.textContent = diff > 0 ? `↑ ${Math.abs(diff).toFixed(1)}` : `↓ ${Math.abs(diff).toFixed(1)}`;
  el.className   = 'trend-badge ' + (diff > 0 ? 'trend-up' : 'trend-down');
}

// ── Donut update ─────────────────────────────────────────────
function updateDonut(donutId, val, max, valId, unit, zoneId) {
  if (val == null) return;
  const circ = 2 * Math.PI * 40; // r=40
  const pct  = Math.min(val / max, 1);
  const offset = circ - pct * circ;
  const d = document.getElementById(donutId);
  if (d) d.style.strokeDashoffset = offset;
  const v = document.getElementById(valId);
  if (v) { v.textContent = Math.round(val) + unit; flash(valId); }
  const z = document.getElementById(zoneId);
  if (z) z.style.width = pct * 100 + '%';
}

// ── Pump update ───────────────────────────────────────────────
function updatePump(pumpOn) {
  const isOn = pumpOn === 1;
  const pill = document.getElementById('pumpPill');
  const dot  = document.getElementById('pumpDot');
  const lbl  = document.getElementById('pumpLabel');
  pill?.classList.toggle('active', isOn);
  dot?.classList.toggle('active', isOn);
  if (lbl) lbl.textContent = isOn ? 'Pump ON' : 'Pump OFF';
}

// ── Temp stats ────────────────────────────────────────────────
function computeTempStats() {
  const vals = allReadingsCache.map(r => r.TP).filter(v => v != null && !isNaN(v));
  if (!vals.length) return;
  const min = Math.min(...vals), max = Math.max(...vals);
  const avg = vals.reduce((a,b)=>a+b,0)/vals.length;
  const el = id => document.getElementById(id);
  const set = (id, v) => { const e=el(id); if(e) e.textContent = Number(v).toFixed(1)+'°'; };
  set('tempMin', min); set('tempAvg', avg); set('tempMax', max);
  const diff = vals.length > 1 ? (vals[vals.length-1] - vals[vals.length-2]).toFixed(1) : null;
  const tag = document.getElementById('tempTrendTag');
  if (tag && diff != null) {
    tag.textContent = Number(diff) > 0 ? `↑ ${Math.abs(diff)}° from last reading` : `↓ ${Math.abs(diff)}° from last reading`;
    tag.style.color = Number(diff) > 0 ? 'var(--accent-red)' : 'var(--accent)';
  }
}

// ── Sparkline buffers ─────────────────────────────────────────
function addToSparkBuffer(key, val) {
  sparkData[key].push(val);
  if (sparkData[key].length > MAX_SPARK) sparkData[key].shift();
}
function addToSparkBuffers(data) {
  ['TP','HM','MO','UV','RN'].forEach(k => { if (data[k] != null) addToSparkBuffer(k, data[k]); });
}

// ── Mini sparklines ───────────────────────────────────────────
function initMiniSparks() {
  const cfg = (id, color) => {
    const canvas = document.getElementById(id);
    if (!canvas) return null;
    return new Chart(canvas, {
      type:'line',
      data:{ labels:[], datasets:[{ data:[], borderColor:color, backgroundColor:hexToRgba(color,.08), borderWidth:1.5, fill:true, tension:.4, pointRadius:0 }] },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false} },
        scales:{ x:{display:false}, y:{display:false} },
        animation:{ duration:400 }
      }
    });
  };
  tempSpark  = cfg('spark-tp','#ef4444');
  humSpark   = cfg('spark-hm','#3b82f6');
  uvSpark    = cfg('spark-uv','#eab308');
  moistSpark = cfg('spark-mo','#22c55e');
  rainSpark  = cfg('spark-rn','#9333ea');

  // Also the dedicated sparkline canvases
  initDedicatedSpark('tempSparkline',  '#ef4444');
  initDedicatedSpark('rainSparkline',  '#9333ea');
}
function initDedicatedSpark(id, color) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();
  new Chart(canvas, {
    type:'line',
    data:{ labels:[], datasets:[{ data:[], borderColor:color, backgroundColor:hexToRgba(color,.1), borderWidth:2, fill:true, tension:.4, pointRadius:0, pointHoverRadius:4 }] },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false} },
      scales:{ x:{display:false}, y:{display:false} },
      animation:{ duration:600 }
    }
  });
}

function updateMiniSparks() {
  updateSpark('spark-tp', sparkData.TP, tempSpark);
  updateSpark('spark-hm', sparkData.HM, humSpark);
  updateSpark('spark-uv', sparkData.UV, uvSpark);
  updateSpark('spark-mo', sparkData.MO, moistSpark);
  updateSpark('spark-rn', sparkData.RN, rainSpark);
  updateDedicatedSpark('tempSparkline', sparkData.TP);
  updateDedicatedSpark('rainSparkline', sparkData.RN);
}
function updateSpark(canvasId, data, chart) {
  if (!chart || !data.length) return;
  chart.data.labels   = data.map((_,i)=>i);
  chart.data.datasets[0].data = data;
  chart.update('none');
}
function updateDedicatedSpark(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ch = Chart.getChart(canvas);
  if (!ch || !data.length) return;
  ch.data.labels = data.map((_,i)=>i);
  ch.data.datasets[0].data = data;
  ch.update('none');
}

// ── Multi-sensor chart ─────────────────────────────────────────
function initMultiChart() {
  const canvas = document.getElementById('multiChart');
  if (!canvas) return;

  const demo = Array.from({length:24},(_,i)=>i);
  multiChart = new Chart(canvas, {
    type:'line',
    data:{
      labels: demo.map(h=>`${String(h).padStart(2,'0')}:00`),
      datasets:[
        { label:'Temp (°C)',   data:[], borderColor:'#ef4444', backgroundColor:'transparent', borderWidth:1.5, tension:.4, pointRadius:0, pointHoverRadius:3, yAxisID:'y' },
        { label:'Humidity (%)',data:[], borderColor:'#3b82f6', backgroundColor:'transparent', borderWidth:1.5, tension:.4, pointRadius:0, pointHoverRadius:3, yAxisID:'y' },
        { label:'Soil (%)',    data:[], borderColor:'#22c55e', backgroundColor:'transparent', borderWidth:1.5, tension:.4, pointRadius:0, pointHoverRadius:3, yAxisID:'y' },
        { label:'UV',          data:[], borderColor:'#eab308', backgroundColor:'transparent', borderWidth:1.5, tension:.4, pointRadius:0, pointHoverRadius:3, borderDash:[4,3], yAxisID:'y2' },
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{ intersect:false, mode:'index' },
      animation:{ duration:800 },
      plugins:{
        legend:{ display:false },
        tooltip:{
          backgroundColor:'rgba(10,13,17,.92)',
          titleColor:'#e8edf2', bodyColor:'#8b97a4',
          padding:10, cornerRadius:8, borderWidth:0,
          callbacks:{ label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(1)}` }
        }
      },
      scales:{
        x:{ display:false, grid:{display:false} },
        y:{ display:false, min:0, max:100 },
        y2:{ display:false, min:0, max:12 }
      }
    }
  });
}

function updateMultiChart() {
  if (!multiChart) return;
  const recent = allReadingsCache.slice(-48);
  multiChart.data.labels = recent.map(r => {
    const d = r.timestamp ? new Date(r.timestamp) : new Date();
    return d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
  });
  multiChart.data.datasets[0].data = recent.map(r => r.TP);
  multiChart.data.datasets[1].data = recent.map(r => r.HM);
  multiChart.data.datasets[2].data = recent.map(r => r.MO);
  multiChart.data.datasets[3].data = recent.map(r => r.UV);
  multiChart.update('none');
}

// ── UV Hour Bars ──────────────────────────────────────────────
function buildUVHourBars() {
  const container = document.getElementById('uvHourBars');
  if (!container) return;
  const hourH = new Date().getHours();
  const profile=[0,0,0,0,0,0,.2,.8,2,3.5,5.2,6.5,6.8,7,6.8,6,4.8,3.2,1.8,.6,.1,0,0,0];
  const slice = profile.slice(6, 21);
  container.innerHTML = '';
  slice.forEach((v,i)=>{
    const bar = document.createElement('div');
    bar.className = 'uv-bar' + (6+i === hourH ? ' current' : '');
    const col = v >= 7 ? '#ef4444' : v >= 5 ? '#eab308' : v >= 2 ? '#f97316' : '#22c55e';
    const pct = (v/7.5*100);
    bar.style.cssText = `height:${Math.max(pct,5)}%;background:${col}${6+i===hourH?'':'88'};animation-delay:${i*.04}s`;
    container.appendChild(bar);
  });
}

// ── Rain Bars ─────────────────────────────────────────────────
function buildRainBars() {
  const container = document.getElementById('rainBars');
  if (!container) return;
  const data = [5, 18, 0, 8, 30, 12, 3];
  const total = data.reduce((a,b)=>a+b,0);
  container.innerHTML = '';
  data.forEach((v,i)=>{
    const bar = document.createElement('div');
    bar.className = 'rain-bar';
    bar.style.cssText = `height:${Math.max(v/32*100,4)}%;animation-delay:${i*.07}s`;
    bar.title = `${v}mm`;
    container.appendChild(bar);
  });
  const rt = document.getElementById('rainTotal');
  const pc = document.getElementById('pumpCycles');
  if (rt) rt.textContent = total + 'mm';
  if (pc) pc.textContent = '8';
}

// ── Heatmap ───────────────────────────────────────────────────
function buildHeatmap() {
  const container = document.getElementById('heatmap');
  if (!container) return;
  container.innerHTML = '';
  // 7 days x 4 rows = 28 cells
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 4; h++) {
      const v = 30 + Math.random() * 50;
      const cell = document.createElement('div');
      cell.className = 'hm-cell';
      const norm = (v - 20) / 70;
      let col;
      if (norm < .3)      col = `rgba(239,68,68,${.2+norm})`;
      else if (norm < .5) col = `rgba(234,179,8,${.25+norm*.8})`;
      else                col = `rgba(34,197,94,${.3+norm*.7})`;
      cell.style.background = col;
      cell.title = `${v.toFixed(0)}%`;
      container.appendChild(cell);
    }
  }
}

// ── History ───────────────────────────────────────────────────
function addToHistory(data) {
  historyData.unshift(data);
  if (historyData.length > MAX_HISTORY) historyData.pop();
  renderHistory();
}
function renderHistory() {
  const tbody = document.getElementById('historyBody');
  const count = document.getElementById('readingCount');
  if (!tbody) return;
  if (!historyData.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">Waiting for data…</td></tr>';
    if (count) count.textContent = '0';
    return;
  }
  tbody.innerHTML = historyData.map((d,i) => `
    <tr style="animation:fadeSlideIn .25s ${i*.04}s both">
      <td>${d.Time || '--'}</td>
      <td>${d.TP != null ? Number(d.TP).toFixed(1) : '--'}°</td>
      <td>${d.HM != null ? Number(d.HM).toFixed(0) : '--'}%</td>
      <td>${d.UV != null ? Number(d.UV).toFixed(1) : '--'}</td>
      <td>${d.RN != null ? Number(d.RN).toFixed(0) : '--'}%</td>
      <td>${d.MO != null ? Number(d.MO).toFixed(0) : '--'}%</td>
      <td class="${d.Pump ? 'pump-on-cell' : 'pump-off-cell'}">${d.Pump ? 'ON' : 'OFF'}</td>
    </tr>
  `).join('');
  if (count) count.textContent = historyData.length;
}

// ── Alerts ────────────────────────────────────────────────────
function showToast(alert) {
  const container = document.getElementById('alertContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `alert-toast ${alert.type}`;
  toast.innerHTML = `
    <div>
      <div class="alert-toast-title">${alert.type==='uv_high' ? '⚠️ UV HIGH' : '✅ UV SAFE'}</div>
      <div class="alert-toast-msg">${alert.message}</div>
      <div class="alert-toast-time">${new Date(alert.timestamp).toLocaleTimeString()}</div>
    </div>
    <button class="alert-toast-close" onclick="this.closest('.alert-toast').remove()">×</button>
  `;
  container.appendChild(toast);
  playAlertSound(alert.type);
  setTimeout(()=>{ if(toast.parentElement) toast.remove(); }, 10000);
}

function addAlertToList(alert) {
  const list = document.getElementById('alertsList');
  if (!list) return;
  const item = document.createElement('div');
  item.className = 'alert-item';
  const dotColor = alert.type==='uv_high' ? '#ef4444' : alert.type==='uv_low' ? '#22c55e' : '#eab308';
  item.innerHTML = `
    <div class="alert-dot" style="background:${dotColor}"></div>
    <div>
      <div class="alert-item-msg">${alert.message}</div>
      <div class="alert-item-time">${new Date(alert.timestamp).toLocaleString()}</div>
    </div>
  `;
  list.prepend(item);
  while (list.children.length > 5) list.lastChild.remove();
}

// ── Graph Modal ───────────────────────────────────────────────
function showGraph(sensor, title, unit, icon) {
  currentSensor = { code:sensor, title, unit, icon };
  document.getElementById('modalTitle').textContent    = title;
  document.getElementById('modalSubtitle').textContent = `Last ${currentTimeRange} hours`;
  document.getElementById('modalIcon').textContent     = icon;
  document.querySelectorAll('.range-btn').forEach(b => b.classList.toggle('active', +b.dataset.hours === currentTimeRange));
  document.getElementById('graphModal').classList.add('active');
  loadGraphData();
}
function closeGraphModal() {
  document.getElementById('graphModal').classList.remove('active');
  if (mainChart) { mainChart.destroy(); mainChart = null; }
}
function changeTimeRange(hours) {
  if (currentTimeRange === hours) return;
  currentTimeRange = hours;
  document.querySelectorAll('.range-btn').forEach(b => b.classList.toggle('active', +b.dataset.hours === hours));
  const sub = document.getElementById('modalSubtitle');
  if (sub) sub.textContent = hours >= 168 ? 'Last 7 days' : `Last ${hours} hour${hours>1?'s':''}`;
  loadGraphData();
}

async function loadGraphData() {
  if (!currentSensor) return;
  const cw = document.querySelector('.chart-wrapper');
  if (cw) { cw.style.opacity='.5'; cw.style.pointerEvents='none'; }
  try {
    let data = [];
    try {
      const res = await fetch(`${apiUrl}/api/readings/${currentSensor.code}?hours=${currentTimeRange}&limit=500`);
      if (res.ok) data = await res.json();
    } catch(e) {}
    if (!data?.length) data = getFromCache(currentSensor.code, currentTimeRange);
    if (!data?.length) { showNoData(); return; }
    renderMainChart(data);
    computeStats(data);
  } catch(e) { showNoData(); }
  finally { if(cw){cw.style.opacity='1';cw.style.pointerEvents='';} }
}

function getFromCache(code, hours) {
  const cutoff = Date.now() - hours * 3600000;
  return allReadingsCache
    .filter(r => new Date(r.timestamp||Date.now()).getTime() >= cutoff)
    .map(r => ({ timestamp:r.timestamp, value:r[code], time:r.Time }))
    .filter(d => d.value != null);
}

function showNoData() {
  const ctx = document.getElementById('sensorChart')?.getContext('2d');
  if (!ctx) return;
  if (mainChart) { mainChart.destroy(); }
  mainChart = new Chart(ctx, {
    type:'line',
    data:{ labels:['No data'], datasets:[{ data:[0], borderColor:'transparent' }] },
    options:{ plugins:{ legend:{display:false}, title:{display:true,text:'No data for this range',color:'#8b97a4',font:{size:14}} }, scales:{ x:{display:false}, y:{display:false} } }
  });
  ['statCurrent','statAvg','statMin','statMax'].forEach(id=>{ const e=document.getElementById(id); if(e) e.textContent='--'; });
}

function renderMainChart(data) {
  const c = getChartColors();
  const ctx = document.getElementById('sensorChart')?.getContext('2d');
  if (!ctx) return;
  if (mainChart) mainChart.destroy();

  const labels = data.map(d => {
    if (d.timestamp) return new Date(d.timestamp).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
    return d.time || '--';
  });
  const values = data.map(d => d.value);

  const sensorColors = { TP:'#ef4444', HM:'#3b82f6', MO:'#22c55e', UV:'#eab308', RN:'#9333ea' };
  const col = sensorColors[currentSensor.code] || c.primary;

  mainChart = new Chart(ctx, {
    type:'line',
    data:{ labels, datasets:[{
      label: currentSensor.title, data: values,
      borderColor: col,
      backgroundColor: hexToRgba(col, .1),
      borderWidth: 2.5, fill:true, tension:.4,
      pointRadius: data.length > 60 ? 0 : 3,
      pointHoverRadius: 5,
      pointBackgroundColor: col,
    }]},
    options:{
      responsive:true, maintainAspectRatio:true,
      interaction:{ intersect:false, mode:'index' },
      animation:{ duration:600 },
      plugins:{
        legend:{display:false},
        tooltip:{
          backgroundColor: 'rgba(10,13,17,.92)',
          titleColor:'#e8edf2', bodyColor:'#8b97a4',
          padding:12, cornerRadius:8,
          displayColors:false,
          callbacks:{ label: ctx => `${ctx.parsed.y?.toFixed(1)||'--'}${currentSensor.unit}` }
        }
      },
      scales:{
        x:{ grid:{color:c.grid,drawBorder:false}, ticks:{color:c.muted,maxRotation:45,autoSkip:true,maxTicksLimit:10} },
        y:{ grid:{color:c.grid,drawBorder:false}, ticks:{color:c.muted,callback:v=>v+currentSensor.unit} }
      }
    }
  });
}

function computeStats(data) {
  const vals = data.map(d=>d.value).filter(v=>v!=null&&!isNaN(v));
  if (!vals.length) return;
  const cur = vals[vals.length-1];
  const avg = vals.reduce((a,b)=>a+b,0)/vals.length;
  const min = Math.min(...vals), max = Math.max(...vals);
  const u = currentSensor.unit;
  const set = (id,v)=>{ const e=document.getElementById(id); if(e) e.textContent=Number(v).toFixed(1)+u; };
  set('statCurrent',cur); set('statAvg',avg); set('statMin',min); set('statMax',max);
}

// ── Utilities ─────────────────────────────────────────────────
function hexToRgba(hex, alpha) {
  if (!hex || hex.startsWith('--') || hex.startsWith('rgba') || hex.startsWith('rgb')) {
    return `rgba(34,197,94,${alpha})`;
  }
  const clean = hex.replace('#','');
  if (clean.length < 6) return `rgba(34,197,94,${alpha})`;
  const r = parseInt(clean.slice(0,2),16);
  const g = parseInt(clean.slice(2,4),16);
  const b = parseInt(clean.slice(4,6),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Global exports ────────────────────────────────────────────
window.setTheme       = setTheme;
window.toggleThemeMenu= toggleThemeMenu;
window.toggleSound    = toggleSound;
window.showGraph      = showGraph;
window.closeGraphModal= closeGraphModal;
window.changeTimeRange= changeTimeRange;