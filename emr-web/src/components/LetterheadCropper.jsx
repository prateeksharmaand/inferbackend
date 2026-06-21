/**
 * LetterheadCropper
 *
 * Upload a full letterhead image. Drag two resizable bands (header/footer)
 * in both X and Y directions. Extract & Apply crops both regions via Canvas.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Upload, Scissors, RotateCcw, Check, Move } from 'lucide-react';
import s from './LetterheadCropper.module.css';

const DISPLAY_W = 560;
const MIN_SIZE  = 20; // minimum band dimension in px

// Band default: full width, 10% height from top / bottom
const initBands = (dispH) => ({
  header: { left: 0, top: 0,               width: DISPLAY_W, height: Math.max(MIN_SIZE, Math.round(dispH * 0.12)) },
  footer: { left: 0, top: Math.round(dispH * 0.88), width: DISPLAY_W, height: Math.max(MIN_SIZE, Math.round(dispH * 0.12)) },
});

// Resize cursor per handle
const CURSOR = {
  n: 'ns-resize', s: 'ns-resize',
  e: 'ew-resize', w: 'ew-resize',
  nw: 'nw-resize', ne: 'ne-resize',
  sw: 'sw-resize', se: 'se-resize',
  move: 'move',
};

export default function LetterheadCropper({ onApply, onClose }) {
  const [imgSrc,  setImgSrc]  = useState(null);
  const [natural, setNatural] = useState({ w: 1, h: 1 });
  const [dispH,   setDispH]   = useState(0);
  const [bands,   setBands]   = useState({ header: null, footer: null });

  const imgRef    = useRef(null);
  const inputRef  = useRef(null);
  // drag state: { band, handle, startX, startY, orig: {left,top,width,height} }
  const drag = useRef(null);

  // ── Load image ──────────────────────────────────────────────────────────────
  const loadFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target.result;
      const img = new Image();
      img.onload = () => {
        const nat = { w: img.naturalWidth, h: img.naturalHeight };
        setNatural(nat);
        const dh = Math.round((nat.h / nat.w) * DISPLAY_W);
        setDispH(dh);
        setImgSrc(src);
        setBands(initBands(dh));
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  // ── Mouse drag handlers ─────────────────────────────────────────────────────
  const onHandleMouseDown = (e, band, handle) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = {
      band, handle,
      startX: e.clientX, startY: e.clientY,
      orig: { ...bands[band] },
    };
  };

  const onMouseMove = useCallback((e) => {
    if (!drag.current) return;
    const { band, handle, startX, startY, orig } = drag.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    setBands(prev => {
      const b = { ...prev[band] };

      // Horizontal
      if (handle === 'move' || handle === 'w' || handle === 'nw' || handle === 'sw') {
        const newLeft  = Math.max(0, Math.min(orig.left + dx, orig.left + orig.width - MIN_SIZE));
        const newWidth = orig.width - (newLeft - orig.left);
        b.left  = newLeft;
        b.width = Math.max(MIN_SIZE, newWidth);
      }
      if (handle === 'move' || handle === 'e' || handle === 'ne' || handle === 'se') {
        b.width = Math.max(MIN_SIZE, Math.min(DISPLAY_W - orig.left, orig.width + dx));
        if (handle !== 'move') b.left = orig.left; // don't drift left when resizing right
      }
      if (handle === 'move') {
        b.left  = Math.max(0, Math.min(DISPLAY_W - orig.width, orig.left + dx));
        b.width = orig.width;
      }

      // Vertical
      if (handle === 'move' || handle === 'n' || handle === 'nw' || handle === 'ne') {
        const newTop    = Math.max(0, Math.min(orig.top + dy, orig.top + orig.height - MIN_SIZE));
        const newHeight = orig.height - (newTop - orig.top);
        b.top    = newTop;
        b.height = Math.max(MIN_SIZE, newHeight);
      }
      if (handle === 'move' || handle === 's' || handle === 'sw' || handle === 'se') {
        b.height = Math.max(MIN_SIZE, Math.min(dispH - orig.top, orig.height + dy));
        if (handle !== 'move') b.top = orig.top;
      }
      if (handle === 'move') {
        b.top    = Math.max(0, Math.min(dispH - orig.height, orig.top + dy));
        b.height = orig.height;
      }

      return { ...prev, [band]: b };
    });
  }, [dispH]);

  const onMouseUp = useCallback(() => { drag.current = null; }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',   onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  // ── Extract via Canvas ──────────────────────────────────────────────────────
  const extract = () => {
    const img   = imgRef.current;
    if (!img) return;
    const scaleX = natural.w / DISPLAY_W;
    const scaleY = natural.h / dispH;

    const crop = ({ left, top, width, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(width  * scaleX);
      canvas.height = Math.round(height * scaleY);
      canvas.getContext('2d').drawImage(
        img,
        Math.round(left * scaleX), Math.round(top  * scaleY),
        Math.round(width * scaleX), Math.round(height * scaleY),
        0, 0, canvas.width, canvas.height
      );
      return canvas.toDataURL('image/png');
    };

    onApply({ header: crop(bands.header), footer: crop(bands.footer) });
  };

  // ── Render a band with 8 handles ───────────────────────────────────────────
  const Band = ({ id, color, label }) => {
    const b = bands[id];
    if (!b) return null;
    const H = 8; // handle size px

    const handles = [
      { id:'nw', style:{ top:-H/2, left:-H/2,               cursor: CURSOR.nw } },
      { id:'n',  style:{ top:-H/2, left: b.width/2 - H/2,   cursor: CURSOR.n  } },
      { id:'ne', style:{ top:-H/2, right:-H/2,              cursor: CURSOR.ne } },
      { id:'e',  style:{ top: b.height/2 - H/2, right:-H/2, cursor: CURSOR.e  } },
      { id:'se', style:{ bottom:-H/2, right:-H/2,           cursor: CURSOR.se } },
      { id:'s',  style:{ bottom:-H/2, left: b.width/2 - H/2,cursor: CURSOR.s  } },
      { id:'sw', style:{ bottom:-H/2, left:-H/2,            cursor: CURSOR.sw } },
      { id:'w',  style:{ top: b.height/2 - H/2, left:-H/2,  cursor: CURSOR.w  } },
    ];

    return (
      <div
        className={s.band}
        style={{
          left: b.left, top: b.top, width: b.width, height: b.height,
          borderColor: color, background: color + '26',
        }}
        onMouseDown={e => onHandleMouseDown(e, id, 'move')}
      >
        <span className={s.bandLabel} style={{ color }}>{label}</span>

        {/* 8 resize handles */}
        {handles.map(h => (
          <div
            key={h.id}
            className={s.handle}
            style={{ ...h.style, cursor: h.style.cursor, background: color, width: H, height: H }}
            onMouseDown={e => onHandleMouseDown(e, id, h.id)}
          />
        ))}

        {/* Move icon in center */}
        <Move size={14} className={s.moveIcon} style={{ color }} />
      </div>
    );
  };

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>

        {/* Header */}
        <div className={s.head}>
          <div className={s.headLeft}>
            <Scissors size={18} className={s.headIcon} />
            <div>
              <div className={s.headTitle}>Crop from Letterhead</div>
              <div className={s.headSub}>Upload your letterhead and drag/resize both bands to select header &amp; footer regions.</div>
            </div>
          </div>
          <button className={s.closeBtn} onClick={onClose}><X size={16} /></button>
        </div>

        <div className={s.body}>
          {!imgSrc ? (
            <div
              className={s.dropZone}
              onDrop={e => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}
              onDragOver={e => e.preventDefault()}
              onClick={() => inputRef.current?.click()}
            >
              <Upload size={32} className={s.dropIcon} />
              <div className={s.dropTitle}>Upload full letterhead / A4 scan</div>
              <div className={s.dropSub}>PNG · JPG · recommended 1240 × 1754 px (A4 @150 dpi)</div>
              <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => loadFile(e.target.files[0])} />
            </div>
          ) : (
            <>
              {/* Legend */}
              <div className={s.legend}>
                <span className={s.legendItem}><span className={s.dot} style={{ background: '#3b82f6' }} /> Header</span>
                <span className={s.legendItem}><span className={s.dot} style={{ background: '#f59e0b' }} /> Footer</span>
                <span className={s.legendHint}>Drag band to move · drag handles to resize</span>
                <button className={s.reuploadBtn} onClick={() => { setImgSrc(null); inputRef.current?.click(); }}>
                  <RotateCcw size={11} /> Change image
                </button>
                <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => loadFile(e.target.files[0])} />
              </div>

              {/* Editor */}
              <div className={s.editorWrap}>
                <div
                  className={s.editor}
                  style={{ width: DISPLAY_W, height: dispH }}
                  onMouseDown={e => e.preventDefault()}
                >
                  <img ref={imgRef} src={imgSrc} alt="Letterhead"
                    className={s.letterhead} style={{ width: DISPLAY_W, height: dispH }}
                    draggable={false} />
                  <Band id="header" color="#3b82f6" label="Header" />
                  <Band id="footer" color="#f59e0b" label="Footer" />
                </div>
              </div>

              {/* Info */}
              {bands.header && bands.footer && (
                <div className={s.info}>
                  <span>Header: {Math.round(bands.header.width / DISPLAY_W * 100)}% W · {Math.round(bands.header.height / dispH * 100)}% H</span>
                  <span>Footer: {Math.round(bands.footer.width / DISPLAY_W * 100)}% W · {Math.round(bands.footer.height / dispH * 100)}% H</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className={s.foot}>
          <button className={s.btnCancel} onClick={onClose}>Cancel</button>
          {imgSrc && (
            <button className={s.btnApply} onClick={extract}>
              <Check size={14} /> Extract &amp; Apply
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
