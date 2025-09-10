// scripts/view-encounters.js
document.addEventListener('DOMContentLoaded', () => {
  const listEl = document.getElementById('encounters-list');
  const newBtn = document.getElementById('newEncounterBtn');

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(+d) ? '—' : d.toLocaleString();
  }

  function sanitizeFileName(name) {
    return (name || 'Encounter').trim().replace(/[^\w\-]+/g, '_');
  }

  function renderList() {
    const items = (window.EncounterStore?.list?.() || []).slice();
    if (!items.length) {
      listEl.innerHTML = `<p style="opacity:.7;">No encounters saved yet.</p>`;
      return;
    }

    listEl.innerHTML = items.map(e => {
      const date = fmtDate(e.updated);
      return `
        <article class="enc-card" data-id="${e.id}">
          <div class="enc-title">${e.name}</div>
          <div class="enc-sub">Updated: ${date}</div>
          <div class="enc-actions">
            <button data-act="open">Open</button>
            <button data-act="rename">Rename</button>
            <a data-act="export" href="#" download="${sanitizeFileName(e.name)}.json">Export</a>
            <button data-act="delete" class="danger">Delete</button>
          </div>
        </article>
      `;
    }).join('');
  }

  listEl?.addEventListener('click', (e) => {
    const card = e.target.closest('.enc-card');
    if (!card) return;
    const id = card.dataset.id;
    const act = e.target.dataset.act;

    if (act === 'open') {
      window.EncounterStore?.setLastId(id);
      location.href = 'encounter.html';
      return;
    }

    if (act === 'rename') {
      const cur = card.querySelector('.enc-title')?.textContent?.trim() || 'Encounter';
      const n = prompt('New name:', cur);
      if (!n) return;
      window.EncounterStore?.rename(id, n.trim());
      renderList();
      return;
    }

    if (act === 'export') {
      e.preventDefault();
      const href = window.EncounterStore?.exportHref(id);
      if (href) {
        e.target.href = href;
        // trigger download with the newly set href
        setTimeout(() => e.target.click(), 0);
        // cleanup
        setTimeout(() => URL.revokeObjectURL(href), 2000);
      }
      return;
    }

    if (act === 'delete') {
      if (confirm('Delete this encounter?')) {
        window.EncounterStore?.remove(id);
        renderList();
      }
      return;
    }
  });

  newBtn?.addEventListener('click', () => {
    const name = prompt('Encounter name:', 'Encounter');
    const id = window.EncounterStore?.save({
      id: null,
      name: (name || 'Encounter').trim(),
      state: { version: 1, combatants: [], currentRound: 1, turnPtr: 0 }
    });
    if (id) {
      window.EncounterStore?.setLastId(id);
      location.href = 'encounter.html';
    }
  });

  // Safety: EncounterStore must exist
  if (!window.EncounterStore) {
    listEl.innerHTML = `<p style="color:#b00020;">EncounterStore not found. Ensure <code>scripts/encounters-store.js</code> is loaded before this script.</p>`;
    return;
  }

  renderList();
});
