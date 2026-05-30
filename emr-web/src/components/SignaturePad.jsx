/**
 * SignaturePad — three ways to create a doctor signature:
 *   Draw   → freehand canvas pad
 *   Upload → image file (PNG/JPG)
 *   Type   → typed name rendered in a signature font
 */
import { useRef, useState, useEffect } from 'react';
import { Upload, PenLine, Type, Trash2, Undo2, Check } from 'lucide-react';
import styles from './SignaturePad.module.css';

const MODES = [
  { id: 'draw',   Icon: PenLine, label: 'Draw'   },
  { id: 'upload', Icon: Upload,  label: 'Upload'  },
  { id: 'type',   Icon: Type,    label: 'Type'    },
];

const TYPE_FONTS = [
  { label: 'Elegant',    css: "italic 38px 'Brush Script MT', 'Dancing Script', cursive" },
  { label: 'Classic',    css: "italic 34px Georgia, 'Times New Roman', serif"            },
  { label: 'Formal',     css: "italic 32px Palatino, 'Palatino Linotype', serif"         },
  { label: 'Bold',       css: "bold italic 30px 'Book Antiqua', Garamond, serif"         },
];

// ── Draw tab ──────────────────────────────────────────────────────────────
function DrawTab({ onConfirm }) {
  const canvasRef   = useRef(null);
  const snapRef     = useRef(null);
  const [drawing,   setDrawing]   = useState(false);
  const [history,   setHistory]   = useState([]);
  const [hasStroke, setHasStroke] = useState(false);

  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 480, 120);
  }, []);

  const getPos = (e) => {
    const rect  = canvasRef.current.getBoundingClientRect();
    const src   = e.touches ? e.touches[0] : e;
    const scaleX = 480 / rect.width;
    const scaleY = 120 / rect.height;
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top)  * scaleY,
    };
  };

  const onDown = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    snapRef.current = ctx.getImageData(0, 0, 480, 120);
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.strokeStyle = '#1a202c';
    ctx.lineWidth   = 2;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    setDrawing(true);
    setHasStroke(true);
  };

  const onMove = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const onUp = () => {
    if (!drawing) return;
    setDrawing(false);
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    setHistory(h => [...h.slice(-19), ctx.getImageData(0, 0, 480, 120)]);
  };

  const handleUndo = () => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    if (history.length > 1) {
      ctx.putImageData(history[history.length - 2], 0, 0);
      setHistory(h => h.slice(0, -1));
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 480, 120);
      setHistory([]);
      setHasStroke(false);
    }
  };

  const handleClear = () => {
    const ctx = canvasRef.current.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 480, 120);
    setHistory([]);
    setHasStroke(false);
  };

  const handleConfirm = () => {
    onConfirm(canvasRef.current.toDataURL('image/png'));
  };

  return (
    <div className={styles.drawWrap}>
      <div className={styles.canvasContainer}>
        <canvas
          ref={canvasRef}
          width={480} height={120}
          className={styles.sigCanvas}
          onMouseDown={onDown} onMouseMove={onMove}
          onMouseUp={onUp}    onMouseLeave={onUp}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
        />
        <span className={styles.canvasHint}>Sign here</span>
      </div>
      <div className={styles.drawActions}>
        <button className={styles.actionBtn} onClick={handleUndo} disabled={!history.length}>
          <Undo2 size={13} /> Undo
        </button>
        <button className={styles.actionBtn} onClick={handleClear} disabled={!hasStroke}>
          <Trash2 size={13} /> Clear
        </button>
        <button className={styles.confirmBtn} onClick={handleConfirm} disabled={!hasStroke}>
          <Check size={13} /> Use this signature
        </button>
      </div>
    </div>
  );
}

// ── Upload tab ────────────────────────────────────────────────────────────
function UploadTab({ onConfirm }) {
  const inputRef = useRef(null);

  const readFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => onConfirm(e.target.result);
    reader.readAsDataURL(file);
  };

  return (
    <div
      className={styles.dropZone}
      onClick={() => inputRef.current?.click()}
      onDrop={e => { e.preventDefault(); readFile(e.dataTransfer.files[0]); }}
      onDragOver={e => e.preventDefault()}
    >
      <Upload size={28} strokeWidth={1.4} className={styles.uploadIcon} />
      <span className={styles.dropLabel}>Click to upload or drag &amp; drop</span>
      <span className={styles.dropSub}>PNG or JPG — transparent background recommended</span>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => readFile(e.target.files[0])} />
    </div>
  );
}

// ── Type tab ──────────────────────────────────────────────────────────────
function TypeTab({ doctorName, onConfirm }) {
  const canvasRef  = useRef(null);
  const [text,     setText]     = useState(doctorName || '');
  const [fontIdx,  setFontIdx]  = useState(0);

  const renderToCanvas = (t, fi) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 480, 120);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 480, 120);
    if (!t.trim()) return;
    ctx.font      = TYPE_FONTS[fi].css;
    ctx.fillStyle = '#1a202c';
    ctx.textBaseline = 'middle';
    ctx.textAlign    = 'center';
    ctx.fillText(t, 240, 60, 460);
  };

  useEffect(() => { renderToCanvas(text, fontIdx); }, [text, fontIdx]); // eslint-disable-line

  const handleConfirm = () => {
    if (!text.trim()) return;
    onConfirm(canvasRef.current.toDataURL('image/png'));
  };

  return (
    <div className={styles.typeWrap}>
      <input
        className={styles.typeInput}
        placeholder="Type your name…"
        value={text}
        onChange={e => setText(e.target.value)}
        autoFocus
      />
      <div className={styles.fontPicker}>
        {TYPE_FONTS.map((f, i) => (
          <button
            key={f.label}
            className={`${styles.fontBtn} ${fontIdx === i ? styles.fontBtnActive : ''}`}
            onClick={() => setFontIdx(i)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <canvas ref={canvasRef} width={480} height={120} className={styles.typeCanvas} />
      <button className={styles.confirmBtn} onClick={handleConfirm} disabled={!text.trim()}>
        <Check size={13} /> Use this signature
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────
export default function SignaturePad({ current, doctorName, onSave, onClear }) {
  const [mode, setMode] = useState('draw');

  if (current) {
    return (
      <div className={styles.currentWrap}>
        <img src={current} alt="Signature" className={styles.currentImg} />
        <div className={styles.currentActions}>
          <span className={styles.currentLabel}>Current signature</span>
          <button className={styles.removeBtn} onClick={onClear}>
            <Trash2 size={12} /> Remove
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.padWrap}>
      <div className={styles.modeTabs}>
        {MODES.map(({ id, Icon, label }) => (
          <button
            key={id}
            className={`${styles.modeTab} ${mode === id ? styles.modeTabActive : ''}`}
            onClick={() => setMode(id)}
          >
            <Icon size={13} strokeWidth={2} /> {label}
          </button>
        ))}
      </div>

      <div className={styles.modeBody}>
        {mode === 'draw'   && <DrawTab  onConfirm={onSave} />}
        {mode === 'upload' && <UploadTab onConfirm={onSave} />}
        {mode === 'type'   && <TypeTab  doctorName={doctorName} onConfirm={onSave} />}
      </div>
    </div>
  );
}
