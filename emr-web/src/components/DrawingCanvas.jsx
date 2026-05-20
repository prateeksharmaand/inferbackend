import { useRef, useState, useEffect, useCallback } from 'react';
import { Pen2 as Pen, Eraser, Minus, Square, Circle, Undo2, Trash2, Save, Download } from 'lucide-react';
import styles from './DrawingCanvas.module.css';

// lucide doesn't export Pen2 — use PenLine or pencil equivalent
import { PenLine, Eraser as EraserIcon, Minus as LineIcon, Square as RectIcon, Circle as CircleIcon } from 'lucide-react';

const TOOLS = [
  { id: 'pen',    Icon: PenLine,    label: 'Pen'       },
  { id: 'eraser', Icon: EraserIcon, label: 'Eraser'    },
  { id: 'line',   Icon: LineIcon,   label: 'Line'      },
  { id: 'rect',   Icon: RectIcon,   label: 'Rectangle' },
  { id: 'circle', Icon: CircleIcon, label: 'Circle'    },
];

const PRESET_COLORS = [
  '#000000', '#1e3a8a', '#dc2626', '#16a34a',
  '#d97706', '#7c3aed', '#0e7490', '#be185d',
  '#64748b', '#ffffff',
];

const WIDTHS = [1, 2, 4, 6, 10, 16];

export default function DrawingCanvas({ initialImage, onSave }) {
  const canvasRef    = useRef(null);
  const snapshotRef  = useRef(null);   // pre-stroke snapshot for shape preview
  const [tool,       setTool]       = useState('pen');
  const [color,      setColor]      = useState('#000000');
  const [lineWidth,  setLineWidth]  = useState(2);
  const [isDrawing,  setIsDrawing]  = useState(false);
  const [startPos,   setStartPos]   = useState({ x: 0, y: 0 });
  const [history,    setHistory]    = useState([]);
  const [saved,      setSaved]      = useState(false);

  // Init canvas with white background (or restore saved image)
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    if (initialImage) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = initialImage;
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const src    = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top)  * scaleY,
    };
  };

  const onDown = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    snapshotRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pos = getPos(e);
    setStartPos(pos);
    setIsDrawing(true);
    setSaved(false);

    if (tool === 'pen' || tool === 'eraser') {
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
      ctx.lineWidth   = tool === 'eraser' ? lineWidth * 4 : lineWidth;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
    }
  };

  const onMove = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    const pos    = getPos(e);

    if (tool === 'pen' || tool === 'eraser') {
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      return;
    }

    // Shape preview: restore snapshot then redraw
    ctx.putImageData(snapshotRef.current, 0, 0);
    ctx.strokeStyle = color;
    ctx.lineWidth   = lineWidth;
    ctx.lineCap     = 'round';
    ctx.beginPath();

    if (tool === 'line') {
      ctx.moveTo(startPos.x, startPos.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    } else if (tool === 'rect') {
      ctx.strokeRect(startPos.x, startPos.y, pos.x - startPos.x, pos.y - startPos.y);
    } else if (tool === 'circle') {
      const rx = Math.abs(pos.x - startPos.x) / 2;
      const ry = Math.abs(pos.y - startPos.y) / 2;
      const cx = startPos.x + (pos.x - startPos.x) / 2;
      const cy = startPos.y + (pos.y - startPos.y) / 2;
      ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, 2 * Math.PI);
      ctx.stroke();
    }
  };

  const onUp = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    setHistory(h => [...h.slice(-29), ctx.getImageData(0, 0, canvas.width, canvas.height)]);
  }, [isDrawing]);

  const handleUndo = () => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    if (history.length <= 1) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      setHistory([]);
    } else {
      ctx.putImageData(history[history.length - 2], 0, 0);
      setHistory(h => h.slice(0, -1));
    }
    setSaved(false);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHistory([]);
    setSaved(false);
  };

  const handleSave = () => {
    const dataUrl = canvasRef.current.toDataURL('image/png');
    onSave(dataUrl);
    setSaved(true);
  };

  const handleDownload = () => {
    const a    = document.createElement('a');
    a.href     = canvasRef.current.toDataURL('image/png');
    a.download = 'drawing.png';
    a.click();
  };

  return (
    <div className={styles.wrap}>
      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>

        {/* Drawing tools */}
        <div className={styles.toolGroup}>
          {TOOLS.map(({ id, Icon, label }) => (
            <button key={id} title={label}
              className={`${styles.toolBtn} ${tool === id ? styles.toolBtnActive : ''}`}
              onClick={() => setTool(id)}>
              <Icon size={16} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className={styles.sep} />

        {/* Colour presets + custom picker */}
        <div className={styles.colorRow}>
          <span className={styles.groupLabel}>Color</span>
          <div className={styles.colorSwatches}>
            {PRESET_COLORS.map(c => (
              <button key={c} title={c}
                className={`${styles.swatch} ${color === c ? styles.swatchActive : ''}`}
                style={{ background: c, borderColor: c === '#ffffff' ? '#d1d5db' : c }}
                onClick={() => setColor(c)} />
            ))}
            <label className={styles.customColorWrap} title="Custom colour">
              <span className={styles.customColorPrev} style={{ background: color }} />
              <input type="color" value={color} onChange={e => setColor(e.target.value)}
                className={styles.colorInput} />
            </label>
          </div>
        </div>

        <div className={styles.sep} />

        {/* Stroke width */}
        <div className={styles.widthRow}>
          <span className={styles.groupLabel}>Width</span>
          <div className={styles.widthBtns}>
            {WIDTHS.map(w => (
              <button key={w} title={`${w}px`}
                className={`${styles.widthBtn} ${lineWidth === w ? styles.widthBtnActive : ''}`}
                onClick={() => setLineWidth(w)}>
                <span className={styles.widthDot} style={{ width: w + 6, height: w + 6, background: color }} />
              </button>
            ))}
          </div>
        </div>

        <div className={styles.spacer} />

        {/* Actions */}
        <div className={styles.actions}>
          <button className={styles.actionBtn} onClick={handleUndo} title="Undo" disabled={history.length === 0}>
            <Undo2 size={14} strokeWidth={2} />
          </button>
          <button className={styles.actionBtn} onClick={handleClear} title="Clear">
            <Trash2 size={14} strokeWidth={2} />
          </button>
          <button className={styles.actionBtn} onClick={handleDownload} title="Download PNG">
            <Download size={14} strokeWidth={2} />
          </button>
          <button className={`${styles.saveBtn} ${saved ? styles.saveBtnDone : ''}`} onClick={handleSave}>
            <Save size={13} strokeWidth={2} />
            {saved ? 'Saved to Prescription ✓' : 'Save to Prescription'}
          </button>
        </div>
      </div>

      {/* ── Canvas ── */}
      <div className={styles.canvasWrap}>
        <canvas
          ref={canvasRef}
          width={860}
          height={520}
          className={`${styles.canvas} ${styles[`cursor_${tool}`]}`}
          onMouseDown={onDown}
          onMouseMove={onMove}
          onMouseUp={onUp}
          onMouseLeave={onUp}
          onTouchStart={onDown}
          onTouchMove={onMove}
          onTouchEnd={onUp}
        />
      </div>

      <p className={styles.hint}>
        Draw anatomical diagrams, body charts, or findings. Click "Save to Prescription" to embed in the prescription.
      </p>
    </div>
  );
}
