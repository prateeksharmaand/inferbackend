/**
 * Print + Export buttons for any screen.
 *   targetRef  element to print / read tables from
 *   getSheets  optional () => [{ title, head, body }] for lists that aren't <table>s;
 *              falls back to a page's registerScreenSheets(), then to the tables on screen
 */
import toast from 'react-hot-toast';
import { Printer, Download } from 'lucide-react';
import { printScreen, downloadWorkbook, readScreenTables, registeredScreenSheets } from '../utils/screenExport';

const btn = {
  display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 10px',
  border: '1px solid var(--color-border, #e2e8f0)', borderRadius: 8, background: 'var(--color-surface, #fff)',
  color: 'var(--color-text, #1e293b)', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
};

export default function ScreenTools({ targetRef, title, subtitle = '', getSheets, useRegistered = false, compact = false, style }) {
  const onPrint = () => {
    if (!targetRef?.current) return;
    if (!printScreen(targetRef.current, { title, subtitle })) toast.error('Allow pop-ups for this site to print');
  };
  const onExport = () => {
    let sheets = getSheets?.() || (useRegistered ? registeredScreenSheets() : null);
    if (!sheets?.some(s => s?.body?.length)) sheets = readScreenTables(targetRef?.current);
    const n = downloadWorkbook(sheets, [subtitle, title].filter(Boolean).join(' '));
    if (n) toast.success(`Exported ${n} sheet${n > 1 ? 's' : ''}`);
    else toast('Nothing to export on this screen — use Print instead');
  };
  return (
    <div data-print-hide style={{ display: 'flex', gap: 6, ...style }}>
      <button type="button" style={btn} onClick={onPrint} title="Print this screen">
        <Printer size={14} />{!compact && ' Print'}
      </button>
      <button type="button" style={btn} onClick={onExport} title="Download as an Excel file">
        <Download size={14} />{!compact && ' Export'}
      </button>
    </div>
  );
}
