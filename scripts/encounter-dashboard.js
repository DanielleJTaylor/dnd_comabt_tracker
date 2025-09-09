// scripts/encounter-dashboard.js
document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app-container');
  const openBtn = document.getElementById('seeDashboardsBtn');
  const closeBtn = document.getElementById('closeDashboardBtn');
  const iframe = document.getElementById('dash-iframe');

  const LIST_URL = 'view-dashboards.html'; // shows folders + dashboards
  const DEFAULT_SRC_KEY = 'dash_iframe_last_url'; // remember where you left off

  function loadInIframe(url) {
    if (!iframe) return;
    iframe.src = url;
    try { localStorage.setItem(DEFAULT_SRC_KEY, url); } catch {}
  }

  // When the user opens the Dashboards sidebar, (re)load list (or last page)
    openBtn?.addEventListener('click', () => {
    if (iframe && !iframe.getAttribute('src')) {
        iframe.src = 'view-dashboards.html';                   // force list view
        try { localStorage.setItem('dash_iframe_last_url', 'view-dashboards.html'); } catch {}
    }
    });

  // Optional: remember wherever the iframe navigates (e.g., clicking a dashboard)
  // Works because links in `view-dashboards.html` are normal anchors to
  // `dashboard-sheet.html?id=...`, which navigate inside the iframe.
  iframe?.addEventListener('load', () => {
    try {
      // Same-origin, so we can read iframe location
      const url = iframe.contentWindow?.location?.href;
      if (url) localStorage.setItem(DEFAULT_SRC_KEY, url);
    } catch {
      // If cross-origin ever happens, ignore.
    }
  });

  // Close button: app.js already hides the panel; no extra work needed.
  closeBtn?.addEventListener('click', () => {
    // (No-op here; app.js' hideDashboards() will run)
  });
});
