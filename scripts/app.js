document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app-container');
  const rightPanel = document.getElementById('right-dashboard');
  const resizer = document.getElementById('dash-resizer');
  const openBtn = document.getElementById('seeDashboardsBtn');
  const closeBtn = document.getElementById('closeDashboardBtn');

  const STORE_KEY = 'dash_right_panel_pct';

  // ---- helpers ----
  const clampPct = (pct) => Math.max(15, Math.min(85, pct));

  function setRightPct(pct) {
    const clamped = clampPct(pct);
    app.style.setProperty('--right-pct', clamped + '%');
    try { localStorage.setItem(STORE_KEY, String(clamped)); } catch {}
  }

  function getStoredPct() {
    const raw = localStorage.getItem(STORE_KEY);
    const n = Number(raw);
    return Number.isFinite(n) ? clampPct(n) : 45;
  }

  function showDashboards() {
    app.classList.toggle('dashboard-visible');
    setRightPct(getStoredPct());
  }

  function hideDashboards() {
    app.classList.remove('dashboard-visible');
  }

  // ---- open/close buttons ----
  openBtn?.addEventListener('click', showDashboards);
  closeBtn?.addEventListener('click', hideDashboards);

  // ---- drag to resize ----
  let dragging = false;

  function onMove(clientX) {
    const rect = app.getBoundingClientRect();
    const fromLeft = clientX - rect.left;                 // px from left edge of container
    const pct = (fromLeft / rect.width) * 100;            // where the divider sits
    // Because resizer sits on LEFT EDGE of right panel, width of right = container - fromLeft
    const rightPct = 100 - pct;
    setRightPct(rightPct);
  }

  resizer?.addEventListener('mousedown', (e) => {
    if (!app.classList.contains('dashboard-visible')) return;
    dragging = true;
    document.body.classList.add('resizing-col');
    resizer.classList.add('resizing');
    e.preventDefault();
  });

  // Touch support
  resizer?.addEventListener('touchstart', (e) => {
    if (!app.classList.contains('dashboard-visible')) return;
    dragging = true;
    document.body.classList.add('resizing-col');
    resizer.classList.add('resizing');
  }, { passive: true });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    onMove(e.clientX);
  });

  window.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    const t = e.touches?.[0];
    if (t) onMove(t.clientX);
  }, { passive: true });

  function stopDrag() {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('resizing-col');
    resizer.classList.remove('resizing');
  }

  window.addEventListener('mouseup', stopDrag);
  window.addEventListener('touchend', stopDrag);
  window.addEventListener('touchcancel', stopDrag);

  // Double-click resizer to reset to 45%
  resizer?.addEventListener('dblclick', () => setRightPct(45));

  // If panel is visible at load, apply stored size
  if (app.classList.contains('dashboard-visible')) {
    setRightPct(getStoredPct());
  }
});
