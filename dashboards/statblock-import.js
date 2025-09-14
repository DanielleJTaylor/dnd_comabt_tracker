// Parse 5e statblock text (and PDF via PDF.js) into dashboard data

import { Templates } from './templates.js';

export async function importFromPDF(file){
  if (!window.pdfjsLib) throw new Error('PDF.js not loaded');
  const array = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({data: array}).promise;
  let text = '';
  for (let i=1;i<=pdf.numPages;i++){
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join(' ') + '\n';
  }
  return importFromText(text);
}

export function importFromText(raw){
  const t = normal(raw);

  const data = Templates.monster();              // default to monster sheet
  data.name = pick(/^\s*([^\n]+)\n/, t, 1, data.name);

  // AC
  data.ac = num(pick(/Armor Class\s*(\d+)/i, t, 1, data.ac));

  // HP (prefer total)
  const hpTxt = pick(/Hit Points\s*([^\n]+)/i, t, 1, '');
  const hpNum = num(hpTxt.match(/(\d{1,4})/));
  if (hpNum) data.hp.max = data.hp.current = hpNum;

  // Abilities block
  const abil = t.match(/STR\s*(\d+)[^\S\r\n]+DEX\s*(\d+)[^\S\r\n]+CON\s*(\d+)[^\S\r\n]+INT\s*(\d+)[^\S\r\n]+WIS\s*(\d+)[^\S\r\n]+CHA\s*(\d+)/i);
  if (abil){
    const [ ,STR,DEX,CON,INT,WIS,CHA ] = abil.map(n=>num(n));
    Object.assign(data.abilities, { str:STR, dex:DEX, con:CON, int:INT, wis:WIS, cha:CHA });
  }

  // Passive perception
  data.pp = num(pick(/passive\s*perception\s*(\d+)/i, t, 1, data.pp));

  // Languages
  const langs = pick(/Languages?\s*([^\n;]+)/i, t, 1, '');
  if (langs) data.languages = splitCSV(langs);

  // Proficiency bonus (optional)
  const prof = num(pick(/Proficiency Bonus\s*\+?(\d+)/i, t, 1, ''));
  if (prof) data.prof = prof;

  // Spellcasting (basics)
  parseSpellcasting(t, data);

  return data;
}

// -------- helpers --------
function normal(s){ return String(s||'').replace(/\r/g,'').trim(); }
function pick(re, s, idx=1, def=''){ const m = s.match(re); return m ? m[idx] : def; }
function num(x){ if (!x) return 0; const m = Array.isArray(x) ? x[1] : x; const n = parseInt(String(m).replace(/\D+/g,''),10); return Number.isFinite(n)?n:0; }
function splitCSV(s){ return s.split(/[,;]/).map(v=>v.trim()).filter(Boolean); }

function parseSpellcasting(t, data){
  // Cantrips / at-will
  const mAtWill = t.match(/Cantrips?\s*\(at\s*will\)\s*:\s*([^\n]+)/i) || t.match(/At\s*will\s*:\s*([^\n]+)/i);
  if (mAtWill) data.spells.atWill = splitCSV(mAtWill[1]);

  // “1st level (4 slots): magic missile, shield”
  const reLevel = /(\d+)(?:st|nd|rd|th)\s*level\s*\((\d+)\s*slots?\)\s*:\s*([^\n]+)/ig;
  let m; 
  while ((m = reLevel.exec(t))){
    const L = parseInt(m[1],10);
    const slots = parseInt(m[2],10) || 0;
    const list = splitCSV(m[3]);
    data.spells.byLevel[L] = { slotsMax: slots, used: 0, spells: list };
  }

  // Sometimes “2nd level (3 slots). Spells: blur, mirror image” – fallback
  if (!Object.keys(data.spells.byLevel).length){
    const reFallback = /(\d+)(?:st|nd|rd|th)\s*level[^\n]*?:\s*([^\n]+)/ig;
    while ((m = reFallback.exec(t))){
      const L = parseInt(m[1],10);
      const list = splitCSV(m[2]);
      data.spells.byLevel[L] = { slotsMax: 0, used: 0, spells: list };
    }
  }
}
