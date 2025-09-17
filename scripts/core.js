// dashboards/core.js
import { Templates, renderSheet } from '../dashboards/templates.js';
import { importFromText, importFromPDF } from '../dashboards/statblock-import.js';

const $ = (s, r=document) => r.querySelector(s);
const sheetCanvas = $('#sheetCanvas');
const dashList = $('#dashList');

const storeKey = 'dnd_dashboards_v1';

let state = {
  dashboards: loadAll(),
  currentId: null
};

function uid(){ return `${Date.now()}-${Math.floor(Math.random()*1e6)}`; }
function loadAll(){ try{ return JSON.parse(localStorage.getItem(storeKey)||'[]'); }catch{ return []; } }
function saveAll(){ localStorage.setItem(storeKey, JSON.stringify(state.dashboards)); }
function find(id){ return state.dashboards.find(d=>d.id===id); }

function addDashboard(type){
  const id = uid();
  const data = type === 'character' ? Templates.character() : Templates.monster();
  const item = { id, type, name: data.name, data };
  state.dashboards.unshift(item);
  state.currentId = id;
  saveAll();
  paintList();
  open(id);
}

function addImported(data){
  const id = uid();
  const type = data.type || 'monster';
  const item = { id, type, name: data.name || 'Imported', data };
  state.dashboards.unshift(item);
  saveAll();
  paintList();
  open(id);
}

function open(id){
  const item = find(id);
  if (!item) return;
  state.currentId = id;
  item.name = item.data.name || item.name || 'Untitled';
  renderSheet(sheetCanvas, item.data);
  paintList(); // keep names in sync
}
function remove(id){
  const i = state.dashboards.findIndex(d => d.id === id);
  if (i >= 0) {
    state.dashboards.splice(i,1);
    saveAll();
    paintList();
    if (state.currentId === id){
      sheetCanvas.innerHTML = '';
      state.currentId = null;
    }
  }
}

function paintList(){
  dashList.innerHTML = '';
  state.dashboards.forEach(d => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div>
        <div><strong>${escapeHTML(d.data?.name || d.name || 'Untitled')}</strong></div>
        <div class="badge">${d.type}</div>
      </div>
      <div class="act">
        <button class="btn" data-open="${d.id}">Open</button>
        <button class="btn" data-del="${d.id}">Delete</button>
      </div>`;
    if (state.currentId === d.id) li.style.outline = '2px solid #c8b7ff';
    dashList.appendChild(li);
  });
}

function escapeHTML(s){ return String(s||'').replace(/[&<>"]/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }

// Topbar buttons
$('#newCharBtn').addEventListener('click', () => addDashboard('character'));
$('#newMonsterBtn').addEventListener('click', () => addDashboard('monster'));

$('#exportJsonBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state.dashboards, null, 2)], {type:'application/json'});
  const a = Object.assign(document.createElement('a'), {download:'dashboards.json', href: URL.createObjectURL(blob)});
  a.click(); URL.revokeObjectURL(a.href);
});

// ---- Import: TEXT ----
const textDialog = $('#importTextDialog');
$('#importTextBtn')?.addEventListener('click', () => textDialog.showModal());
$('#importTextConfirm')?.addEventListener('click', (e) => {
  e.preventDefault();
  const raw = ($('#importTextArea').value || '').trim();
  if (!raw) { textDialog.close(); return; }
  const data = importFromText(raw);
  addImported(data);
  textDialog.close();
});

// ---- Import: PDF ----
$('#importPdfInput')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const data = await importFromPDF(file);
    addImported(data);
  } finally {
    e.target.value = '';
  }
});

// ---- Import: JSON ----
$('#importJsonInput')?.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  for (const file of files) {
    try {
      const text = await file.text();
      const payload = JSON.parse(text);

      // Accept: full export array, single item, or {dashboards:[...]}
      const items = Array.isArray(payload)
        ? payload
        : (payload.dashboards ? payload.dashboards : [payload]);

      for (const it of items) {
        const data = it.data || it;           // support our export or bare sheet
        addImported(data);
      }
    } catch (err) {
      console.error('Bad JSON:', file.name, err);
    }
  }
  e.target.value = '';
});

// List clicks
dashList.addEventListener('click', (e) => {
  const openId = e.target.closest('button')?.dataset?.open;
  const delId  = e.target.closest('button')?.dataset?.del;
  if (openId) open(openId);
  if (delId)  remove(delId);
});

// Initial paint
paintList();
