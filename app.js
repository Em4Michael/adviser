// ============================================
// AGRISENSE DASHBOARD - JAVASCRIPT
// Real-time WebSocket + Live Graph Updates
// ============================================

// === CONFIGURATION ===
const SERVER_URL = 'adviser-server.onrender.com';
const USE_SSL = true;

const wsProtocol = USE_SSL ? 'wss:' : 'ws:';
const httpProtocol = USE_SSL ? 'https:' : 'http:';
const wsUrl = `${wsProtocol}//${SERVER_URL}`;
const apiUrl = `${httpProtocol}//${SERVER_URL}`;

// === STATE ===
let ws = null;
let reconnectAttempts = 0;
let soundEnabled = false;
let historyData = [];
const MAX_HISTORY = 15;
let audioContext = null;

// Chart instances
let mainChart = null;
let tempSparkline = null;
let humSparkline = null;
let moistSparkline = null;

// Sparkline data buffers
let sparklineData = {
  TP: [],
  HM: [],
  MO: []
};
const MAX_SPARKLINE_POINTS = 20;

// Modal state
let currentSensor = null;
let currentTimeRange = 24;

// All readings cache for graph
let allReadingsCache = [];

// === INITIALIZATION ===
document.addEventListener('DOMContentLoaded', () => {
  console.log('🌱 AgriSense Dashboard Initializing...');
  
  loadTheme();
  loadSoundState();
  initClock();
  initSparklines();
  connect();
  fetchInitialData();
  
  // Event listeners
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeGraphModal();
  });
  
  document.getElementById('graphModal').addEventListener('click', (e) => {
    if (e.target.id === 'graphModal') closeGraphModal();
  });
  
  // Close theme menu on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.theme-dropdown')) {
      document.getElementById('themeMenu').classList.remove('active');
    }
  });
  
  console.log('✅ Dashboard Ready!');
});

// === CLOCK ===
function initClock() {
  updateClock();
  setInterval(updateClock, 1000);
}

function updateClock() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true 
  });
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  
  document.getElementById('clock').textContent = timeStr;
  document.getElementById('dateDisplay').textContent = dateStr;
}

// === THEME MANAGEMENT ===
function loadTheme() {
  const saved = localStorage.getItem('agrisense-theme') || 'dark';
  setTheme(saved, false);
}

function setTheme(themeName, save = true) {
  document.documentElement.setAttribute('data-theme', themeName);
  
  if (save) {
    localStorage.setItem('agrisense-theme', themeName);
  }
  
  // Update dropdown
  const icons = { dark: '🌙', light: '☀️', midnight: '🌌', forest: '🌲', ocean: '🌊' };
  const names = { dark: 'Dark', light: 'Light', midnight: 'Midnight', forest: 'Forest', ocean: 'Ocean' };
  
  document.getElementById('themeIcon').textContent = icons[themeName] || '🌙';
  document.getElementById('themeName').textContent = names[themeName] || 'Dark';
  
  // Update active state
  document.querySelectorAll('.theme-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.theme === themeName);
  });
  
  // Close menu
  document.getElementById('themeMenu').classList.remove('active');
  
  // Update charts
  updateChartsTheme();
}

function toggleThemeMenu() {
  document.getElementById('themeMenu').classList.toggle('active');
}

function getChartColors() {
  const style = getComputedStyle(document.documentElement);
  return {
    primary: style.getPropertyValue('--accent-green').trim() || '#3fb950',
    secondary: style.getPropertyValue('--accent-blue').trim() || '#58a6ff',
    text: style.getPropertyValue('--text-primary').trim() || '#e6edf3',
    textMuted: style.getPropertyValue('--text-muted').trim() || '#484f58',
    grid: style.getPropertyValue('--border-color').trim() || 'rgba(240, 246, 252, 0.1)',
    bg: style.getPropertyValue('--bg-secondary').trim() || '#161b22'
  };
}

function updateChartsTheme() {
  const colors = getChartColors();
  
  // Update sparklines
  [tempSparkline, humSparkline, moistSparkline].forEach(chart => {
    if (chart) {
      chart.data.datasets[0].borderColor = colors.primary;
      chart.data.datasets[0].backgroundColor = hexToRgba(colors.primary, 0.1);
      chart.update('none');
    }
  });
  
  // Update main chart
  if (mainChart) {
    mainChart.data.datasets[0].borderColor = colors.primary;
    mainChart.data.datasets[0].backgroundColor = hexToRgba(colors.primary, 0.1);
    mainChart.options.scales.x.grid.color = colors.grid;
    mainChart.options.scales.y.grid.color = colors.grid;
    mainChart.options.scales.x.ticks.color = colors.textMuted;
    mainChart.options.scales.y.ticks.color = colors.textMuted;
    mainChart.update();
  }
}

// === SOUND MANAGEMENT ===
function loadSoundState() {
  const saved = localStorage.getItem('agrisense-sound');
  soundEnabled = saved === 'true';
  updateSoundUI();
}

function saveSoundState() {
  localStorage.setItem('agrisense-sound', soundEnabled.toString());
}

function updateSoundUI() {
  const btn = document.getElementById('soundBtn');
  const icon = document.getElementById('soundIcon');
  
  btn.classList.toggle('enabled', soundEnabled);
  icon.textContent = soundEnabled ? '🔊' : '🔇';
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  saveSoundState();
  updateSoundUI();
  
  // Play a test sound when enabling
  if (soundEnabled) {
    playNotificationSound();
  }
}

// Initialize audio context on first user interaction
function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
}

function playNotificationSound() {
  if (!soundEnabled) return;
  
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    
    // Create a pleasant two-tone notification
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    
    // Setup filter for warmer sound
    filter.type = 'lowpass';
    filter.frequency.value = 2000;
    
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    // Pleasant chord (C and E)
    osc1.frequency.value = 523.25; // C5
    osc2.frequency.value = 659.25; // E5
    osc1.type = 'sine';
    osc2.type = 'sine';
    
    // Smooth envelope
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.15, now + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.4);
    osc2.stop(now + 0.4);
  } catch (e) {
    console.log('Audio not supported:', e);
  }
}

function playAlertSound(type) {
  if (!soundEnabled) return;
  
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    
    if (type === 'uv_high') {
      // Warning sound - descending urgent tones
      playWarningSound(ctx, now);
    } else {
      // Success sound - ascending pleasant tones
      playSuccessSound(ctx, now);
    }
  } catch (e) {
    console.log('Audio not supported:', e);
  }
}

function playWarningSound(ctx, now) {
  const frequencies = [880, 698.46, 587.33]; // A5, F5, D5 - descending
  const duration = 0.15;
  
  frequencies.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    
    filter.type = 'lowpass';
    filter.frequency.value = 3000;
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    
    osc.frequency.value = freq;
    osc.type = 'triangle';
    
    const startTime = now + (i * duration);
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.2, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
    
    osc.start(startTime);
    osc.stop(startTime + duration);
  });
}

function playSuccessSound(ctx, now) {
  const frequencies = [523.25, 659.25, 783.99]; // C5, E5, G5 - ascending major chord
  const duration = 0.12;
  
  frequencies.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    
    filter.type = 'lowpass';
    filter.frequency.value = 2500;
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    
    osc.frequency.value = freq;
    osc.type = 'sine';
    
    const startTime = now + (i * duration);
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.15, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration + 0.1);
    
    osc.start(startTime);
    osc.stop(startTime + duration + 0.15);
  });
}

// === WEBSOCKET ===
function connect() {
  console.log('Connecting to:', wsUrl);
  ws = new WebSocket(wsUrl);
  
  const statusIndicator = document.querySelector('.status-indicator');
  const statusLabel = document.querySelector('.status-label');
  
  ws.onopen = () => {
    console.log('✅ WebSocket connected');
    statusIndicator.classList.add('connected');
    statusLabel.textContent = 'Connected';
    reconnectAttempts = 0;
    ws.send(JSON.stringify({ type: 'dashboard' }));
  };
  
  ws.onclose = () => {
    console.log('🔌 WebSocket disconnected');
    statusIndicator.classList.remove('connected');
    statusLabel.textContent = 'Disconnected';
    
    reconnectAttempts++;
    const delay = Math.min(1000 * reconnectAttempts, 10000);
    setTimeout(connect, delay);
  };
  
  ws.onerror = (err) => {
    console.error('❌ WebSocket error:', err);
    statusLabel.textContent = 'Error';
  };
  
  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      
      if (msg.type === 'sensor') {
        updateDashboard(msg.data);
        addToHistory(msg.data);
        updateSparklineData(msg.data);
        // Add to readings cache
        addToReadingsCache(msg.data);
      } else if (msg.type === 'alert') {
        showAlertToast(msg.data);
        addAlertToList(msg.data);
      } else if (msg.type === 'recent_alerts') {
        msg.data.reverse().forEach(alert => addAlertToList(alert));
      }
    } catch (err) {
      console.error('Parse error:', err);
    }
  };
}

// === READINGS CACHE FOR GRAPHS ===
function addToReadingsCache(data) {
  const reading = {
    ...data,
    timestamp: data.timestamp || new Date().toISOString()
  };
  allReadingsCache.push(reading);
  
  // Keep last 500 readings in cache
  if (allReadingsCache.length > 500) {
    allReadingsCache.shift();
  }
}

// === FETCH INITIAL DATA ===
async function fetchInitialData() {
  try {
    // Fetch more readings for graph data
    const readingsRes = await fetch(`${apiUrl}/api/readings?limit=200`);
    const readings = await readingsRes.json();
    
    if (Array.isArray(readings) && readings.length > 0) {
      // Store all readings in cache (reversed to chronological order)
      allReadingsCache = readings.reverse();
      
      // Use last 15 for history display
      historyData = readings.slice(-MAX_HISTORY).reverse();
      renderHistory();
      
      // Update dashboard with latest
      updateDashboard(readings[readings.length - 1]);
      
      // Initialize sparkline data
      readings.slice(-MAX_SPARKLINE_POINTS).forEach(r => {
        if (r.TP !== undefined) addToSparklineBuffer('TP', r.TP);
        if (r.HM !== undefined) addToSparklineBuffer('HM', r.HM);
        if (r.MO !== undefined) addToSparklineBuffer('MO', r.MO);
      });
      updateAllSparklines();
      
      console.log(`📊 Loaded ${readings.length} readings into cache`);
    }
    
    // Fetch alerts
    const alertsRes = await fetch(`${apiUrl}/api/alerts?limit=10`);
    const alerts = await alertsRes.json();
    
    if (Array.isArray(alerts) && alerts.length > 0) {
      alerts.reverse().forEach(alert => addAlertToList(alert));
    }
  } catch (err) {
    console.log('Could not fetch initial data:', err);
  }
}

// === DASHBOARD UPDATES ===
function updateDashboard(data) {
  // UV Index Gauge
  updateUVGauge(data.UV);
  
  // Environment metrics
  updateMetric('temp', data.TP, 60, getStatusForTemp);
  updateMetric('hum', data.HM, 100, getStatusForHum);
  updateMetric('rain', data.RN, 100, getStatusForRain);
  updateMetric('moist', data.MO, 100, getStatusForMoist);
  
  // Heat Index Gauge
  updateHeatIndexGauge(data.HI);
  
  // Trend values
  updateTrendValue('tempTrendValue', data.TP);
  updateTrendValue('humTrendValue', data.HM);
  updateTrendValue('moistTrendValue', data.MO);
  
  // Pump status
  updatePumpStatus(data.Pump);
}

function updateUVGauge(uv) {
  if (uv === undefined || uv === null) return;
  
  const maxUV = 11;
  const percentage = Math.min(uv / maxUV, 1);
  const circumference = 2 * Math.PI * 85;
  const offset = circumference - (percentage * circumference);
  
  const progress = document.getElementById('uvProgress');
  const valueEl = document.getElementById('uvValue');
  const labelEl = document.getElementById('uvLabel');
  const badgeEl = document.getElementById('uvBadge');
  const cardEl = document.getElementById('uvCard');
  
  progress.style.strokeDasharray = circumference;
  progress.style.strokeDashoffset = offset;
  
  valueEl.textContent = uv.toFixed(1);
  valueEl.classList.add('updating');
  setTimeout(() => valueEl.classList.remove('updating'), 500);
  
  let status, color, badgeClass;
  if (uv <= 2) {
    status = 'LOW'; color = '#3fb950'; badgeClass = '';
  } else if (uv <= 5) {
    status = 'MODERATE'; color = '#d29922'; badgeClass = 'warning';
  } else if (uv <= 7) {
    status = 'HIGH'; color = '#db6d28'; badgeClass = 'warning';
  } else {
    status = 'VERY HIGH'; color = '#f85149'; badgeClass = 'danger';
  }
  
  labelEl.textContent = status;
  progress.style.stroke = color;
  valueEl.style.color = color;
  
  badgeEl.textContent = status;
  badgeEl.className = 'card-badge' + (badgeClass ? ' ' + badgeClass : '');
  
  cardEl.classList.toggle('uv-alert', uv > 5);
}

function updateHeatIndexGauge(hi) {
  if (hi === undefined || hi === null) return;
  
  const valueEl = document.getElementById('hiValue');
  const needle = document.getElementById('hiNeedle');
  
  valueEl.textContent = hi.toFixed(1);
  valueEl.classList.add('updating');
  setTimeout(() => valueEl.classList.remove('updating'), 500);
  
  // Calculate needle rotation (0 = -90deg, 50 = 0deg, 100 = 90deg)
  // Assuming range 20-50°C maps to the gauge
  const minHI = 20, maxHI = 50;
  const normalizedHI = Math.max(minHI, Math.min(maxHI, hi));
  const percentage = (normalizedHI - minHI) / (maxHI - minHI);
  const angle = -90 + (percentage * 180);
  
  needle.style.transform = `rotate(${angle}deg)`;
}

function updateMetric(prefix, value, max, statusFn) {
  if (value === undefined || value === null) return;
  
  const valueEl = document.getElementById(`${prefix}Value`);
  const barEl = document.getElementById(`${prefix}Bar`);
  
  valueEl.textContent = typeof value === 'number' ? value.toFixed(1) : value;
  valueEl.classList.add('updating');
  setTimeout(() => valueEl.classList.remove('updating'), 500);
  
  const percentage = Math.min((value / max) * 100, 100);
  const { color } = statusFn(value);
  
  barEl.style.setProperty('--bar-width', `${percentage}%`);
  barEl.style.setProperty('--bar-color', color);
}

function updateTrendValue(id, value) {
  if (value === undefined || value === null) return;
  const el = document.getElementById(id);
  el.textContent = typeof value === 'number' ? value.toFixed(1) : value;
  el.classList.add('updating');
  setTimeout(() => el.classList.remove('updating'), 500);
}

function getStatusForTemp(v) {
  if (v <= 20) return { status: 'Cool', color: '#58a6ff' };
  if (v <= 30) return { status: 'Optimal', color: '#3fb950' };
  if (v <= 35) return { status: 'Warm', color: '#d29922' };
  return { status: 'Hot', color: '#f85149' };
}

function getStatusForHum(v) {
  if (v <= 30) return { status: 'Dry', color: '#d29922' };
  if (v <= 60) return { status: 'Optimal', color: '#3fb950' };
  if (v <= 80) return { status: 'Humid', color: '#d29922' };
  return { status: 'Very Humid', color: '#f85149' };
}

function getStatusForRain(v) {
  if (v <= 20) return { status: 'Dry', color: '#3fb950' };
  if (v <= 50) return { status: 'Light', color: '#58a6ff' };
  if (v <= 80) return { status: 'Raining', color: '#d29922' };
  return { status: 'Heavy', color: '#f85149' };
}

function getStatusForMoist(v) {
  if (v <= 30) return { status: 'Dry', color: '#f85149' };
  if (v <= 50) return { status: 'Low', color: '#d29922' };
  if (v <= 70) return { status: 'Optimal', color: '#3fb950' };
  return { status: 'Wet', color: '#58a6ff' };
}

function updatePumpStatus(pumpOn) {
  const card = document.getElementById('pumpCard');
  const visual = document.getElementById('pumpVisual');
  const status = document.getElementById('pumpStatus');
  const label = document.getElementById('pumpLabel');
  
  const isOn = pumpOn === 1;
  
  visual.classList.toggle('active', isOn);
  status.textContent = isOn ? 'ON' : 'OFF';
  status.classList.toggle('on', isOn);
  label.textContent = isOn ? 'Irrigating...' : 'System Idle';
}

// === SPARKLINES ===
function initSparklines() {
  const config = (canvasId) => {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    
    const colors = getChartColors();
    
    return new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          data: [],
          borderColor: colors.primary,
          backgroundColor: hexToRgba(colors.primary, 0.1),
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { display: false },
          y: { display: false }
        },
        interaction: {
          intersect: false,
          mode: 'index'
        }
      }
    });
  };
  
  tempSparkline = config('tempSparkline');
  humSparkline = config('humSparkline');
  moistSparkline = config('moistSparkline');
}

function addToSparklineBuffer(sensor, value) {
  if (value === undefined || value === null) return;
  sparklineData[sensor].push(value);
  if (sparklineData[sensor].length > MAX_SPARKLINE_POINTS) {
    sparklineData[sensor].shift();
  }
}

function updateSparklineData(data) {
  if (data.TP !== undefined) addToSparklineBuffer('TP', data.TP);
  if (data.HM !== undefined) addToSparklineBuffer('HM', data.HM);
  if (data.MO !== undefined) addToSparklineBuffer('MO', data.MO);
  
  updateAllSparklines();
}

function updateAllSparklines() {
  updateSparklineChart(tempSparkline, sparklineData.TP);
  updateSparklineChart(humSparkline, sparklineData.HM);
  updateSparklineChart(moistSparkline, sparklineData.MO);
}

function updateSparklineChart(chart, data) {
  if (!chart || data.length === 0) return;
  
  chart.data.labels = data.map((_, i) => i);
  chart.data.datasets[0].data = data;
  chart.update('none');
}

// === HISTORY TABLE ===
function addToHistory(data) {
  historyData.unshift(data);
  if (historyData.length > MAX_HISTORY) {
    historyData.pop();
  }
  renderHistory();
}

function renderHistory() {
  const tbody = document.getElementById('historyBody');
  
  if (historyData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">Waiting for data...</td></tr>';
    document.getElementById('readingCount').textContent = '0';
    return;
  }
  
  tbody.innerHTML = historyData.map(d => `
    <tr>
      <td>${d.Time || '--'}</td>
      <td>${d.TP?.toFixed(1) ?? '--'}</td>
      <td>${d.HM?.toFixed(0) ?? '--'}</td>
      <td>${d.UV?.toFixed(1) ?? '--'}</td>
      <td>${d.RN?.toFixed(0) ?? '--'}</td>
      <td>${d.MO?.toFixed(0) ?? '--'}</td>
      <td class="${d.Pump ? 'pump-on' : 'pump-off'}">${d.Pump ? 'ON' : 'OFF'}</td>
    </tr>
  `).join('');
  
  document.getElementById('readingCount').textContent = historyData.length;
}

// === ALERTS ===
function showAlertToast(alert) {
  const container = document.getElementById('alertContainer');
  
  const toast = document.createElement('div');
  toast.className = `alert-toast ${alert.type}`;
  toast.innerHTML = `
    <span class="alert-toast-icon">${alert.type === 'uv_high' ? '⚠️' : '✅'}</span>
    <div class="alert-toast-content">
      <div class="alert-toast-title">${alert.type === 'uv_high' ? 'UV HIGH ALERT' : 'UV SAFE'}</div>
      <div class="alert-toast-msg">${alert.message}</div>
      <div class="alert-toast-time">${new Date(alert.timestamp).toLocaleTimeString()}</div>
    </div>
    <button class="alert-toast-close" onclick="this.parentElement.remove()">×</button>
  `;
  
  container.appendChild(toast);
  playAlertSound(alert.type);
  
  setTimeout(() => {
    if (toast.parentElement) toast.remove();
  }, 10000);
}

function addAlertToList(alert) {
  const list = document.getElementById('alertsList');
  
  const empty = list.querySelector('.empty-state');
  if (empty) empty.remove();
  
  const item = document.createElement('div');
  item.className = `alert-item ${alert.type}`;
  item.innerHTML = `
    <div class="alert-item-msg">${alert.message}</div>
    <div class="alert-item-time">${new Date(alert.timestamp).toLocaleString()}</div>
  `;
  
  list.prepend(item);
  
  while (list.children.length > 10) {
    list.lastChild.remove();
  }
  
  document.getElementById('alertCount').textContent = list.querySelectorAll('.alert-item').length;
}

// === MODAL / GRAPH ===
function showGraph(sensor, title, unit, icon) {
  currentSensor = { code: sensor, title, unit, icon };
  
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalSubtitle').textContent = currentTimeRange >= 168 ? 'Last 7 days' : `Last ${currentTimeRange} hour${currentTimeRange > 1 ? 's' : ''}`;
  document.getElementById('modalIcon').textContent = icon;
  
  // Reset button states to match currentTimeRange
  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.hours) === currentTimeRange);
  });
  
  document.getElementById('graphModal').classList.add('active');
  
  loadGraphData();
}

function closeGraphModal() {
  document.getElementById('graphModal').classList.remove('active');
  
  if (mainChart) {
    mainChart.destroy();
    mainChart = null;
  }
}

function changeTimeRange(hours) {
  // Prevent re-loading if same range selected
  if (currentTimeRange === hours) return;
  
  currentTimeRange = hours;
  
  // Update button states with animation
  document.querySelectorAll('.range-btn').forEach(btn => {
    const isActive = parseInt(btn.dataset.hours) === hours;
    btn.classList.toggle('active', isActive);
    
    // Add a brief scale animation on the newly active button
    if (isActive) {
      btn.style.transform = 'scale(1.05)';
      setTimeout(() => {
        btn.style.transform = '';
      }, 150);
    }
  });
  
  // Update subtitle with animation
  const subtitle = document.getElementById('modalSubtitle');
  subtitle.style.opacity = '0.5';
  setTimeout(() => {
    subtitle.textContent = hours >= 168 ? 'Last 7 days' : `Last ${hours} hour${hours > 1 ? 's' : ''}`;
    subtitle.style.opacity = '1';
  }, 150);
  
  loadGraphData();
}

async function loadGraphData() {
  if (!currentSensor) return;
  
  console.log(`Loading graph data for ${currentSensor.code}, last ${currentTimeRange} hours`);
  
  // Show loading state
  const chartWrapper = document.querySelector('.chart-wrapper');
  chartWrapper.style.opacity = '0.5';
  chartWrapper.style.pointerEvents = 'none';
  
  try {
    // First try the sensor-specific endpoint
    let data = [];
    
    try {
      const res = await fetch(`${apiUrl}/api/readings/${currentSensor.code}?hours=${currentTimeRange}&limit=500`);
      if (res.ok) {
        data = await res.json();
        console.log(`API returned ${data.length} points for ${currentSensor.code}`);
      }
    } catch (apiErr) {
      console.log('Sensor API failed, using cache:', apiErr);
    }
    
    // If API returned empty or failed, use cache
    if (!data || data.length === 0) {
      console.log('Using local cache for graph data');
      data = getGraphDataFromCache(currentSensor.code, currentTimeRange);
    }
    
    if (!data || data.length === 0) {
      console.log('No data available for graph');
      showNoDataMessage();
      return;
    }
    
    renderMainChart(data);
    updateChartStats(data);
  } catch (err) {
    console.error('Error loading graph data:', err);
    showNoDataMessage();
  } finally {
    // Remove loading state
    chartWrapper.style.opacity = '1';
    chartWrapper.style.pointerEvents = '';
  }
}

function getGraphDataFromCache(sensorCode, hours) {
  const now = Date.now();
  const cutoff = now - (hours * 60 * 60 * 1000);
  
  // Filter readings within time range
  const filtered = allReadingsCache.filter(r => {
    const ts = r.timestamp ? new Date(r.timestamp).getTime() : now;
    return ts >= cutoff;
  });
  
  // Map to expected format
  return filtered.map(r => ({
    timestamp: r.timestamp || new Date().toISOString(),
    value: r[sensorCode],
    time: r.Time
  })).filter(d => d.value !== undefined && d.value !== null);
}

function showNoDataMessage() {
  const ctx = document.getElementById('sensorChart').getContext('2d');
  
  if (mainChart) {
    mainChart.destroy();
  }
  
  mainChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['No Data'],
      datasets: [{
        data: [0],
        borderColor: 'transparent',
        backgroundColor: 'transparent'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: 'No data available for this time range',
          color: getChartColors().textMuted,
          font: { size: 16 }
        }
      },
      scales: {
        x: { display: false },
        y: { display: false }
      }
    }
  });
  
  // Clear stats
  document.getElementById('statCurrent').textContent = '--';
  document.getElementById('statAvg').textContent = '--';
  document.getElementById('statMin').textContent = '--';
  document.getElementById('statMax').textContent = '--';
}

function renderMainChart(data) {
  const colors = getChartColors();
  const ctx = document.getElementById('sensorChart').getContext('2d');
  
  if (mainChart) {
    mainChart.destroy();
  }
  
  const labels = data.map(d => {
    if (d.timestamp) {
      const date = new Date(d.timestamp);
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
    return d.time || '--';
  });
  
  const values = data.map(d => d.value);
  
  mainChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: currentSensor.title,
        data: values,
        borderColor: colors.primary,
        backgroundColor: hexToRgba(colors.primary, 0.1),
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointRadius: data.length > 50 ? 0 : 3,
        pointHoverRadius: 6,
        pointBackgroundColor: colors.primary,
        pointBorderColor: colors.bg,
        pointBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: colors.bg,
          titleColor: colors.text,
          bodyColor: colors.text,
          borderColor: colors.grid,
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          callbacks: {
            label: (ctx) => `${ctx.parsed.y?.toFixed(1) || '--'}${currentSensor.unit}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: colors.grid, drawBorder: false },
          ticks: {
            color: colors.textMuted,
            maxRotation: 45,
            autoSkip: true,
            maxTicksLimit: 12
          }
        },
        y: {
          grid: { color: colors.grid, drawBorder: false },
          ticks: {
            color: colors.textMuted,
            callback: (v) => v + currentSensor.unit
          }
        }
      }
    }
  });
}

function updateChartStats(data) {
  const values = data.map(d => d.value).filter(v => v !== null && v !== undefined && !isNaN(v));
  
  if (values.length === 0) {
    document.getElementById('statCurrent').textContent = '--';
    document.getElementById('statAvg').textContent = '--';
    document.getElementById('statMin').textContent = '--';
    document.getElementById('statMax').textContent = '--';
    return;
  }
  
  const current = values[values.length - 1];
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  
  const unit = currentSensor.unit;
  
  document.getElementById('statCurrent').textContent = current.toFixed(1) + unit;
  document.getElementById('statAvg').textContent = avg.toFixed(1) + unit;
  document.getElementById('statMin').textContent = min.toFixed(1) + unit;
  document.getElementById('statMax').textContent = max.toFixed(1) + unit;
}

// === UTILITIES ===
function hexToRgba(hex, alpha) {
  if (!hex || hex.length < 7) return `rgba(63, 185, 80, ${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// === GLOBAL EXPORTS ===
window.setTheme = setTheme;
window.toggleThemeMenu = toggleThemeMenu;
window.toggleSound = toggleSound;
window.showGraph = showGraph;
window.closeGraphModal = closeGraphModal;
window.changeTimeRange = changeTimeRange;