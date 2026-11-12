// Print / export whatever screen is showing — used by the lab portal's header buttons,
// so every tab (and any tab added later) gets both without its own code.
import { printElement } from './printElement';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const visible = el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
const cellText = el => (el.innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();

// Columns that only hold buttons ("Actions", or a blank header over buttons) are left out
const ACTION_HEAD = /^(actions?|options?|manage)$/i;
const textNoButtons = cell => {
  if (!cell) return '';
  const c = cell.cloneNode(true);
  c.querySelectorAll('button, input, select').forEach(n => n.remove());
  return cellText(c);
};

function tableTitle(table, i) {
  const cap = table.querySelector('caption');
  if (cap) return cellText(cap);
  // nearest heading above the table, inside its card/section
  let node = table;
  for (let depth = 0; node && depth < 6; depth++, node = node.parentElement) {
    const h = node.querySelector?.('h1, h2, h3, h4, [class*="itle"]');
    if (h && !table.contains(h) && cellText(h)) return cellText(h);
  }
  return `Table ${i + 1}`;
}

function readTable(table) {
  const rows = [...table.rows].filter(visible);
  if (!rows.length) return null;
  const headRow = table.tHead?.rows[0] || rows[0];
  const heads = [...headRow.cells].map(cellText);
  const bodyRows = rows.filter(r => r !== headRow);
  const keep = heads.map((h, i) => !ACTION_HEAD.test(h) && (h !== '' || bodyRows.some(r => textNoButtons(r.cells[i]))));
  const pick = cells => [...cells].map(textNoButtons).filter((_, i) => keep[i] !== false);
  const body = bodyRows.map(r => pick(r.cells)).filter(r => r.some(Boolean));
  return { head: pick(headRow.cells), body };
}

/** Tables currently shown inside `root`, as { title, head, body }. */
export function readScreenTables(root) {
  if (!root) return [];
  return [...root.querySelectorAll('table')].filter(visible)
    .map((t, i) => { const d = readTable(t); return d && d.body.length ? { title: tableTitle(t, i), ...d } : null; })
    .filter(Boolean);
}

/**
 * Download sheets as an Excel workbook (one sheet each).
 * Excel-XML (.xls) needs no library and opens in Excel, Google Sheets and Numbers.
 * @param {{title:string, head:string[], body:any[][]}[]} sheets
 * @returns {number} number of sheets written (0 = nothing to export)
 */
export function downloadWorkbook(sheets, name = 'export') {
  const tables = (sheets || []).filter(t => t && t.body?.length);
  if (!tables.length) return 0;
  const used = new Set();
  const sheetName = t => {
    const n = String(t || 'Sheet').replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 28) || 'Sheet';
    let k = n, i = 2;
    while (used.has(k.toLowerCase())) k = `${n.slice(0, 25)} ${i++}`;
    used.add(k.toLowerCase());
    return k;
  };
  const cell = v => {
    const s = v === null || v === undefined ? '' : String(v);
    const isNum = typeof v === 'number' || (/^-?\d+(\.\d+)?$/.test(s) && !/^-?0\d/.test(s) && s.length < 10);   // keep mobiles/UHIDs as text
    return `<Cell><Data ss:Type="${isNum && s !== '' ? 'Number' : 'String'}">${esc(s)}</Data></Cell>`;
  };
  const xmlSheets = tables.map(t => `
 <Worksheet ss:Name="${esc(sheetName(t.title))}"><Table>
  <Row ss:StyleID="h">${t.head.map(cell).join('')}</Row>
  ${t.body.map(r => `<Row>${r.map(cell).join('')}</Row>`).join('\n  ')}
 </Table></Worksheet>`).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles><Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#EEF2FF" ss:Pattern="Solid"/></Style></Styles>${xmlSheets}
</Workbook>`;
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${String(name).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'export'}-${today()}.xls`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return tables.length;
}

/** Download the tables shown inside `root`. @returns {number} tables exported */
export function exportScreenTables(root, name = 'export') {
  return downloadWorkbook(readScreenTables(root), name);
}

// A page whose lists aren't <table>s (cards, grids) can register its rows for the header Export button.
let registered = null;
export function registerScreenSheets(fn) {
  registered = fn;
  return () => { if (registered === fn) registered = null; };
}
export const registeredScreenSheets = () => { try { return registered ? registered() : null; } catch { return null; } };

/**
 * Print the screen inside `root` with a title header. Typed form values and charts are kept;
 * buttons, search boxes and scroll limits are dropped.
 */
export function printScreen(root, { title = 'Report', subtitle = '' } = {}) {
  if (!root) return false;
  const clone = root.cloneNode(true);
  // Carry typed values into the copy (outerHTML only has the initial attributes)
  const src = root.querySelectorAll('input, select, textarea');
  const dst = clone.querySelectorAll('input, select, textarea');
  src.forEach((el, i) => {
    const c = dst[i]; if (!c) return;
    if (el.tagName === 'SELECT') [...c.options].forEach((o, j) => { if (el.options[j]?.selected) o.setAttribute('selected', ''); else o.removeAttribute('selected'); });
    else if (el.tagName === 'TEXTAREA') c.textContent = el.value;
    else if (el.type === 'checkbox' || el.type === 'radio') { if (el.checked) c.setAttribute('checked', ''); else c.removeAttribute('checked'); }
    else c.setAttribute('value', el.value);
  });
  // Canvas charts don't survive copying — swap them for images
  const sc = root.querySelectorAll('canvas'); const dc = clone.querySelectorAll('canvas');
  sc.forEach((cv, i) => { try { const img = document.createElement('img'); img.src = cv.toDataURL('image/png'); img.style.maxWidth = '100%'; dc[i]?.replaceWith(img); } catch { /* tainted */ } });
  clone.querySelectorAll('[data-print-hide], button, input[type="search"], [role="search"]').forEach(n => n.remove());

  const wide = [...root.querySelectorAll('table')].some(t => (t.rows[0]?.cells.length || 0) > 7);
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1e293b;padding-bottom:8px;margin-bottom:14px">
      <div><div style="font-size:18px;font-weight:700;color:#0f172a">${esc(title)}</div>
      ${subtitle ? `<div style="font-size:12px;color:#475569">${esc(subtitle)}</div>` : ''}</div>
      <div style="font-size:11px;color:#64748b">Printed ${esc(new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }))}</div>
    </div>`;
  wrap.appendChild(clone);
  return printElement(wrap, {
    title: `${title}${subtitle ? ` — ${subtitle}` : ''}`,
    extraCss: `
      ${wide ? '@page { size: A4 landscape; margin: 8mm; }' : ''}
      .print-root * { overflow: visible !important; max-height: none !important; }
      .print-root table { width: 100% !important; font-size: 11px; }
      .print-root th, .print-root td { padding: 4px 6px !important; }
      thead { display: table-header-group; }`,
  });
}
