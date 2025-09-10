// scripts/app.js
document.addEventListener('DOMContentLoaded', () => {
  const app       = document.getElementById('app-container');
  const rightPane = document.getElementById('right-dashboard');
  const resizer   = document.getElementById('dash-resizer');
  const openBtn   = document.getElementById('seeDashboardsBtn');
  const closeBtn  = document.getElementById('closeDashboardBtn');
  const iframe    = document.getElementById('dash-iframe'); // may be null if not present

  const STORE_KEY = 'dash_right_panel_pct';

  // ---- helpers ----
  const clampPct = (pct) => Math.max(15, Math.min(65, pct));

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
    app.classList.add('dashboard-visible');
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
    const fromLeft = clientX - rect.left;     // px from left edge of container
    const pct = (fromLeft / rect.width) * 100;
    // resizer is left edge of right panel -> right width = 100 - pct
    const rightPct = 100 - pct;
    setRightPct(rightPct);
  }

  function startDrag(e) {
    if (!app.classList.contains('dashboard-visible')) return;
    dragging = true;
    document.body.classList.add('resizing-col');
    resizer.classList.add('resizing');
    // Prevent iframe from swallowing pointer events during drag
    if (iframe) iframe.style.pointerEvents = 'none';
    e.preventDefault?.();
  }

  function stopDrag() {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('resizing-col');
    resizer.classList.remove('resizing');
    // Restore iframe interactivity
    if (iframe) iframe.style.pointerEvents = '';
  }

  // Mouse + touch start
  resizer?.addEventListener('mousedown', startDrag);
  resizer?.addEventListener('touchstart', startDrag, { passive: true });

  // Global move listeners (keep as-is so drag works even if cursor leaves resizer)
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    onMove(e.clientX);
  });

  window.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    const t = e.touches?.[0];
    if (t) onMove(t.clientX);
  }, { passive: true });

  document.getElementById('encounterBackBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = 'view-encounters.html';
  });

  // Global stop listeners
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
