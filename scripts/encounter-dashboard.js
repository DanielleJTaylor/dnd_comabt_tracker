// scripts/encounter-dashboard.js
(() => {
  const panel  = document.getElementById('right-dashboard');
  const iframe = document.getElementById('dash-iframe');
  const openBtn  = document.getElementById('seeDashboardsBtn');
  const closeBtn = document.getElementById('closeDashboardBtn');

  // Only set src once (lazy-load when opened)
  function ensureDashSrc() {
    if (!iframe.dataset.loaded) {
      iframe.src = 'view-dashboards.html';   // <-- CORRECTED: Point to the main dashboards view
      iframe.dataset.loaded = '1';
    }
  }

  function openDashboards() {
    ensureDashSrc();
    document.getElementById('app-container')?.classList.add('dashboard-visible');
    panel?.setAttribute('aria-hidden', 'false');
  }

  function closeDashboards() {
    document.getElementById('app-container')?.classList.remove('dashboard-visible');
    panel?.setAttribute('aria-hidden', 'true');
  }

  openBtn?.addEventListener('click', openDashboards);
  closeBtn?.addEventListener('click', closeDashboards);

})();