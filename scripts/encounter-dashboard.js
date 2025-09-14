// scripts/encounter-dashboard.js
(() => {
  const panel  = document.getElementById('right-dashboard');
  const iframe = document.getElementById('dash-iframe');
  const openBtn  = document.getElementById('seeDashboardsBtn');
  const closeBtn = document.getElementById('closeDashboardBtn');

  // Only set src once (lazy-load when opened)
  function ensureDashSrc() {
    if (!iframe.dataset.loaded) {
      iframe.src = 'dashboards/index.html';   // <-- your dashboards UI
      iframe.dataset.loaded = '1';
    }
  }

  function openDashboards() {
    ensureDashSrc();
    panel?.classList.add('open');
    panel?.setAttribute('aria-hidden', 'false');
  }

  function closeDashboards() {
    panel?.classList.remove('open');
    panel?.setAttribute('aria-hidden', 'true');
  }

  openBtn?.addEventListener('click', openDashboards);
  closeBtn?.addEventListener('click', closeDashboards);

  // Optional: auto-load on first page load (uncomment if you want it preloaded)
  // ensureDashSrc();
})();
