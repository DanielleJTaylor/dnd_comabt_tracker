// scripts/encounter-dashboards.js
(() => {
  // ===== Elements from encounter.html =====
  const app          = document.getElementById('app-container');            // holds CSS vars for sizing
  const rightPanel   = document.getElementById('right-dashboard');
  const iframe       = document.getElementById('dashboard-frame');
  const resizer      = document.getElementById('dash-resizer');
  const openBtn      = document.getElementById('seeDashboardsBtn');         // "📋 Dashboards" button (left tracker)
  const closeBtn     = document.getElementById('closeDashboardBtn');        // panel Close (✖)
  const backBtn      = document.getElementById('sdBackBtn');                // Back to list
  const hdrListWrap  = document.getElementById('panel-header-list-view');   // shows "📁 Dashboards"
  const hdrEditWrap  = document.getElementById('panel-header-editor-view'); // shows Back + dashboard title
  const hdrEditTitle = document.getElementById('sdViewerTitle');

  if (!app || !rightPanel || !iframe || !resizer) return;

  // ===== Constants =====
  const DEFAULT_PCT = 45;        // double-click reset target
  const MIN_PCT = 10;            // must match CSS var expectations
  const MAX_PCT = 80;
  const LIST_URL = 'view-dashboards.html?embed=1';   // list mode (same origin) 
  // Editor URL is dynamic (we detect when the iframe navigates to dashboard-sheet.html)

  // ===== Utilities =====
  const setPct = (pct) => app.style.setProperty('--right-pct', `${pct}%`);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const showListHeader = () => {
    hdrListWrap?.classList.remove('hidden');
    hdrEditWrap?.classList.add('hidden');
    hdrEditTitle && (hdrEditTitle.textContent = '');
  };
  const showEditorHeader = (title = 'Dashboard') => {
    hdrListWrap?.classList.add('hidden');
    hdrEditWrap?.classList.remove('hidden');
    hdrEditTitle && (hdrEditTitle.textContent = title);
  };
  const inEditor = () => {
    try {
      const url = new URL(iframe?.contentWindow?.location?.href || '', window.location.href);
      return /dashboard-sheet\.html/i.test(url.pathname);
    } catch {
      return false;
    }
  };

  // Attempt to pull a friendly title from inside editor page
  const refreshEditorTitle = () => {
    try {
      const doc = iframe.contentDocument;
      if (!doc) return;
      // Prefer contenteditable #sheet-title if present; otherwise use document.title
      const el = doc.getElementById('sheet-title');
      const txt = (el?.textContent || doc.title || 'Dashboard').trim();
      showEditorHeader(txt);
    } catch {
      showEditorHeader('Dashboard');
    }
  };

  // ===== Open / Close / View switching =====
  function openPanel() {
    // Attach class to expand panel; CSS handles clamp(var(--right-pct)) width
    app.classList.add('dashboard-visible');
    // Ensure we start at 45% unless a custom value is already there
    const current = parseFloat(getComputedStyle(app).getPropertyValue('--right-pct')) || DEFAULT_PCT;
    setPct(clamp(current, MIN_PCT, MAX_PCT));
    // Always land on dashboards list first
    showList();
  }

  function closePanel() {
    // Remove the visible class to collapse the panel to width: 0 (per CSS)
    app.classList.remove('dashboard-visible');
    // Optional: clear the iframe src when closing to free up work
    // iframe.src = 'about:blank';
  }

  function showList() {
    showListHeader();
    if (iframe.src.endsWith(LIST_URL)) return;
    iframe.src = LIST_URL;
  }

  // Navigate to editor if the iframe is already on dashboard-sheet.html
  function showEditor() {
    refreshEditorTitle();
  }

  // ===== Resizer: drag + double-click reset =====
  let dragging = false;
  let startX = 0;
  let startPct = DEFAULT_PCT;

  function onMove(e) {
    if (!dragging) return;
    const total = app.clientWidth || rightPanel.parentElement.clientWidth;
    const dx = e.clientX - startX;
    const newPct = clamp(startPct + (dx / total) * 100, MIN_PCT, MAX_PCT);
    setPct(newPct);
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('mouseup', endDrag, true);
    resizer.classList.remove('resizing');
  }

  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    // Only allow resizing when panel is visible
    if (!app.classList.contains('dashboard-visible')) return;
    dragging = true;
    startX = e.clientX;
    const current = parseFloat(getComputedStyle(app).getPropertyValue('--right-pct')) || DEFAULT_PCT;
    startPct = clamp(current, MIN_PCT, MAX_PCT);
    resizer.classList.add('resizing');
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('mouseup', endDrag, true);
  });

  resizer.addEventListener('dblclick', (e) => {
    e.preventDefault();
    // Reset to 45%
    setPct(DEFAULT_PCT);
  });

  // Safety: end drag if window loses focus
  window.addEventListener('blur', endDrag);

  // ===== Buttons =====
  openBtn?.addEventListener('click', openPanel);
  closeBtn?.addEventListener('click', closePanel);
  backBtn?.addEventListener('click', showList);

  // ===== Iframe routing awareness =====
  // We examine the iframe location after each load. If it's the editor, flip header & title.
  iframe.addEventListener('load', () => {
    try {
      const url = new URL(iframe.contentWindow.location.href);
      if (/dashboard-sheet\.html/i.test(url.pathname)) {
        // Editor mode (e.g., "dashboard-sheet.html?embed=1&id=...")
        showEditor();
        // Also watch for live title changes inside editor (user renames)
        const doc = iframe.contentDocument;
        const titleEl = doc?.getElementById('sheet-title');
        if (titleEl) {
          const obs = new MutationObserver(() => refreshEditorTitle());
          obs.observe(titleEl, { characterData: true, subtree: true, childList: true });
          // Optional: stop observing when list view returns
          iframe.addEventListener('load', () => obs.disconnect(), { once: true });
        }
      } else {
        // List mode
        showListHeader();
      }
    } catch {
      // If we can’t read iframe location (shouldn’t happen same-origin), default to list
      showListHeader();
    }
  });

  // ===== Optional: open specific dashboard from elsewhere =====
  // If other parts of your app call: window.openDashboardEditor(id)
  window.openDashboardEditor = function openDashboardEditor(id) {
    if (!app.classList.contains('dashboard-visible')) openPanel();
    const url = new URL('dashboard-sheet.html', window.location.origin);
    url.searchParams.set('embed', '1');
    if (id) url.searchParams.set('id', id);
    iframe.src = url.toString();
  };
})();
