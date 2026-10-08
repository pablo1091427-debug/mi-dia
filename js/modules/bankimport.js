// Importar el extracto del banco (CSV o Excel) y categorizar los movimientos (con Claude si hay clave).
import { db, update } from '../store.js';
import { esc, uid, dkey, fmtMoney, toast, sheet, loadScript } from '../utils.js';
import { askJSON, objSchema, hasKey } from '../ai.js';
import { EXP_CATS, INC_CATS } from './expenses.js';

const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

// ---------- Lectura del archivo ----------
function parseCSV(text) {
  const first = text.split(/\r?\n/).slice(0, 10).join('\n');
  const delim = [';', '\t', ',', '|'].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim()));
}

async function readRows(file) {
  if (/\.(xlsx|xls|ods)$/i.test(file.name)) {
    await loadScript(XLSX_URL);
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }).filter((r) => r.some((x) => String(x).trim()));
  }
  const buf = await file.arrayBuffer();
  let text = new TextDecoder('utf-8').decode(buf);
  if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf); // muchos bancos exportan en Latin-1
  return parseCSV(text);
}

// ---------- Interpretar valores ----------
function toDate(v) {
  if (v instanceof Date && !isNaN(v)) return dkey(v);
  if (typeof v === 'number' && v > 20000 && v < 80000) return dkey(new Date(Math.round((v - 25569) * 86400000) + 12 * 3600000)); // fecha de Excel
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    if (+m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) return `${y}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
function toAmount(v) {
  if (typeof v === 'number') return v;
  let s = String(v).replace(/[€\s]|EUR/gi, '').trim();
  if (!s || !/\d/.test(s)) return null;
  const neg = /^\(.*\)$/.test(s) || /-$/.test(s);
  s = s.replace(/[()]/g, '').replace(/-$/, '');
  // 1.234,56 → 1234.56 · 1,234.56 → 1234.56
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : neg ? -Math.abs(n) : n;
}

// Detecta cabecera y columnas de fecha, concepto e importe (o cargo/abono)
function detect(rows) {
  const hi = rows.slice(0, 20).findIndex((r) => r.some((c) => /fecha|date/.test(norm(c))) && r.some((c) => /importe|cantidad|cargo|abono|amount|debe|haber|debit|credit/.test(norm(c))));
  const header = hi >= 0 ? rows[hi].map(norm) : [];
  const body = rows.slice(hi + 1);
  const find = (re, not) => header.findIndex((h) => re.test(h) && !(not && not.test(h)));
  let date = find(/fecha|date/, /valor/);
  if (date < 0) date = find(/fecha|date/);
  let concept = find(/concepto|descripcion|movimiento|detalle|description|observaciones/);
  let amount = find(/importe|cantidad|amount/, /saldo/);
  const debit = find(/cargo|debe|debito|debit/);
  const credit = find(/abono|haber|credito|credit/);
  // Sin cabecera reconocible: deducir por el tipo de dato
  const cols = Math.max(...body.slice(0, 30).map((r) => r.length));
  const score = (fn) => Array.from({ length: cols }, (_, c) => body.slice(0, 30).filter((r) => fn(r[c])).length);
  if (date < 0) { const s = score((v) => !!toDate(v)); date = s.indexOf(Math.max(...s)); }
  if (amount < 0 && debit < 0) {
    const s = score((v) => toAmount(v) !== null && !toDate(v));
    s[date] = -1;
    amount = s.indexOf(Math.max(...s));
  }
  if (concept < 0) {
    const lens = Array.from({ length: cols }, (_, c) => body.slice(0, 30).reduce((a, r) => a + (toAmount(r[c]) === null ? String(r[c] ?? '').length : 0), 0));
    lens[date] = -1;
    concept = lens.indexOf(Math.max(...lens));
  }
  return body.map((r) => {
    const d = toDate(r[date]);
    let a = amount >= 0 ? toAmount(r[amount]) : null;
    if (a === null && (debit >= 0 || credit >= 0)) {
      const de = toAmount(r[debit]), cr = toAmount(r[credit]);
      a = cr ? Math.abs(cr) : de ? -Math.abs(de) : null;
    }
    return d && a ? { date: d, concept: String(r[concept] ?? '').replace(/\s+/g, ' ').trim(), amount: Math.round(a * 100) / 100 } : null;
  }).filter(Boolean);
}

// ---------- Categorías ----------
const RULES = [
  ['super', 'mercadona carrefour lidl aldi dia eroski alcampo consum hipercor supermerc ahorramas bonpreu caprabo'],
  ['food', 'restaur bar cafe cafeteria burger mcdonald kfc telepizza just eat glovo uber eats deliveroo foster vips'],
  ['transport', 'gasolin repsol cepsa galp bp shell renfe metro emt cabify uber taxi parking peaje bla bla alsa iryo ouigo'],
  ['bills', 'iberdrola endesa naturgy luz agua gas movistar vodafone orange digi jazztel masmovil pepephone fibra telefon'],
  ['home', 'alquiler hipoteca comunidad ikea leroy merlin bricomart'],
  ['leisure', 'netflix spotify hbo disney prime cine steam playstation xbox fnac entradas ticketmaster'],
  ['health', 'farmacia dentista clinica hospital optica fisio sanitas adeslas'],
  ['clothes', 'zara primark mango bershka pull bear decathlon h&m kiabi stradivarius'],
  ['sport', 'gimnasio gym basic fit mcfit decathlon padel'],
  ['travel', 'hotel booking airbnb ryanair vueling iberia easyjet'],
];
function ruleCat(concept) {
  const c = norm(concept);
  const hit = RULES.find(([, words]) => words.split(' ').some((w) => w.length > 2 && c.includes(w)));
  return hit ? hit[0] : 'other';
}

async function claudeCats(moves) {
  const out = new Map();
  const schema = objSchema({ items: { type: 'array', items: objSchema({ i: { type: 'integer' }, cat: { type: 'string', enum: [...new Set([...EXP_CATS, ...INC_CATS].map((c) => c.id))] } }) } });
  for (let start = 0; start < moves.length; start += 80) {
    const chunk = moves.slice(start, start + 80);
    const r = await askJSON({
      system: `Clasificas movimientos de un banco español. Gastos (importe negativo) usan: ${EXP_CATS.map((c) => `${c.id}=${c.name}`).join(', ')}. Ingresos (positivo) usan: ${INC_CATS.map((c) => `${c.id}=${c.name}`).join(', ')}.`,
      content: chunk.map((m, k) => `${start + k}\t${m.amount}\t${m.concept}`).join('\n'),
      schema,
      maxTokens: 8000,
    });
    r.items.forEach((x) => out.set(x.i, x.cat));
  }
  return out;
}

// ---------- Pantalla de importación ----------
export function openBankImport(onDone) {
  const s = sheet({
    title: '🏦 Importar extracto del banco',
    body: `<p class="small muted" style="margin-top:0">Descarga los movimientos desde la web o la app de tu banco en <b>CSV o Excel</b> y elígelo aquí. Se leen en tu móvil; ${hasKey() ? 'Claude solo recibe los conceptos e importes para ponerles categoría.' : 'las categorías se ponen por palabras clave (con la clave de Claude serían más precisas).'}</p>
      <label class="btn primary block">📂 Elegir archivo<input type="file" accept=".csv,.txt,.xlsx,.xls,.ods,text/csv" hidden data-file></label>
      <div id="imp" style="margin-top:12px"></div>`,
  });
  const box = s.el.querySelector('#imp');
  s.el.querySelector('[data-file]').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    box.innerHTML = '<p class="muted">Leyendo el archivo…</p>';
    try {
      const moves = detect(await readRows(file));
      if (!moves.length) throw new Error('No encontré movimientos (fecha + importe) en el archivo.');
      // Quitar los que ya están apuntados (misma fecha, importe y concepto)
      const d = db();
      const seen = new Set([...d.expenses.map((x) => `${x.date}|${-x.amount}`), ...d.incomes.map((x) => `${x.date}|${x.amount}`)]
        .concat([...d.expenses, ...d.incomes].filter((x) => x.bank).map((x) => x.bank)));
      const fresh = moves.filter((m) => !seen.has(`${m.date}|${m.amount}|${norm(m.concept)}`) && !seen.has(`${m.date}|${m.amount}`));
      if (!fresh.length) { box.innerHTML = `<p>Los ${moves.length} movimientos ya estaban apuntados. 👍</p>`; return; }
      box.innerHTML = `<p class="muted">Encontrados ${fresh.length} movimientos nuevos. Poniendo categorías…</p>`;
      let cats = new Map();
      if (hasKey()) cats = await claudeCats(fresh).catch(() => new Map());
      fresh.forEach((m, i) => {
        const valid = m.amount < 0 ? EXP_CATS : INC_CATS;
        const c = cats.get(i);
        m.cat = valid.some((x) => x.id === c) ? c : m.amount < 0 ? ruleCat(m.concept) : /nomina|salario|sueldo/.test(norm(m.concept)) ? 'salary' : 'other';
        m.include = true;
      });
      const draw = () => {
        const n = fresh.filter((m) => m.include).length;
        const out = fresh.filter((m) => m.include && m.amount < 0).reduce((a, m) => a - m.amount, 0);
        const inc = fresh.filter((m) => m.include && m.amount > 0).reduce((a, m) => a + m.amount, 0);
        box.innerHTML = `
          <p><b>${n}</b> movimientos · gastos ${fmtMoney(out)} · ingresos ${fmtMoney(inc)}</p>
          <p class="small muted">Desmarca los que no quieras (por ejemplo, traspasos entre tus cuentas o pagos con tarjeta que ya apuntaste a mano). Toca la categoría para cambiarla.</p>
          <ul class="list">${fresh.map((m, i) => `
            <li><input type="checkbox" data-inc="${i}" ${m.include ? 'checked' : ''} style="width:20px;height:20px;flex:none">
              <div class="grow" style="min-width:0"><div class="ellipsis small" style="font-weight:600">${esc(m.concept || '(sin concepto)')}</div>
                <select class="input" data-cat="${i}" style="min-height:30px;padding:2px 6px;font-size:12px;margin-top:2px">${(m.amount < 0 ? EXP_CATS : INC_CATS).map((c) => `<option value="${c.id}" ${c.id === m.cat ? 'selected' : ''}>${c.e} ${c.name}</option>`).join('')}</select></div>
              <div style="text-align:right;flex:none"><b style="color:${m.amount > 0 ? 'var(--ok)' : 'inherit'}">${m.amount > 0 ? '+' : ''}${fmtMoney(m.amount)}</b><div class="small muted">${m.date.slice(8)}/${m.date.slice(5, 7)}</div></div></li>`).join('')}</ul>
          <button class="btn primary block" data-go style="position:sticky;bottom:0">Importar ${n} movimientos</button>`;
        box.querySelectorAll('[data-inc]').forEach((c) => (c.onchange = () => { fresh[+c.dataset.inc].include = c.checked; draw(); }));
        box.querySelectorAll('[data-cat]').forEach((c) => (c.onchange = () => (fresh[+c.dataset.cat].cat = c.value)));
        box.querySelector('[data-go]').onclick = () => {
          const chosen = fresh.filter((m) => m.include);
          update((x) => chosen.forEach((m) => {
            const item = { id: uid(), amount: Math.abs(m.amount), concept: m.concept.slice(0, 80), cat: m.cat, date: m.date, bank: `${m.date}|${m.amount}|${norm(m.concept)}` };
            (m.amount < 0 ? x.expenses : x.incomes).push(item);
          }));
          s.close();
          toast(`🏦 ${chosen.length} movimientos importados`);
          onDone?.();
        };
      };
      draw();
    } catch (err) {
      box.innerHTML = `<p class="warn-text">${esc(err.message)}</p>`;
    }
  };
}

export { detect as _detectForTests, parseCSV as _parseCSVForTests };
