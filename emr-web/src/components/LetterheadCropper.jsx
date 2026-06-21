/**
 * LetterheadCropper
 *
 * Upload a full letterhead / A4 page scan.
 * Drag two coloured band overlays to select the header and footer regions.
 * Click "Extract & Apply" to crop both bands via Canvas and call onApply({header, footer}).
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Upload, Scissors, RotateCcw, Check, MoveVertical } from 'lucide-react';
import s from './LetterheadCropper.module.css';

const DISPLAY_W = 560; // px — the render width inside the modal

export default function LetterheadCropper({ onApply, onClose }) {
  const [imgSrc,   setImgSrc]   = useState(null);   // data-URL of uploaded letterhead
  const [natural,  setNatural]  = useState({ w: 1, h: 1 }); // original pixel dimensions
  const [dispH,    setDispH]    = useState(0);       // rendered height in px

  // Band positions in display pixels (top, height)
  const [header, setHeader] = useState({ top: 0,   h: 80 });
  const [footer, setFooter] = useState({ top: 680, h: 80 });

  const imgRef     = useRef(null);
  const canvasRef  = useRef(null);
  const dragRef    = useRef(null); // { band:'header'|'footer', edge:'move'|'bottom'|'top', startY, origTop, origH }

  // ── Load image ───────────────────────────────────────────────────────────────
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
        // Default bands: header = top 10%, footer = bottom 10%
        setHeader({ top: 0,               h: Math.round(dh * 0.10) });
        setFooter({ top: dh - Math.round(dh * 0.10), h: Math.round(dh * 0.10) });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  // ── Drag logic ───────────────────────────────────────────────────────────────
  const onMouseDown = (e, band, edge) => {
    e.preventDefault();
    const state = band === 'header' ? header : footer;
    dragRef.current = { band, edge, startY: e.clientY, origTop: state.top, origH: state.h };
  };

  const onMouseMove = useCallback((e) => {
    if (!dragRef.current) return;
    const { band, edge, startY, origTop, origH } = dragRef.current;
    const dy = e.clientY - startY;
    const set = band === 'header' ? setHeader : setFooter;

    if (edge === 'move') {
      const newTop = Math.max(0, Math.min(dispH - origH, origTop + dy));
      set(prev => ({ ...prev, top: newTop }));
    } else if (edge === 'bottom') {
      const newH = Math.max(20, Math.min(dispH - origTop, origH + dy));
      set(prev => ({ ...prev, h: newH }));
    } else if (edge === 'top') {
      const newTop = Math.max(0, origTop + dy);
      const newH   = Math.max(20, origH - dy);
      set(prev => ({ ...prev, top: newTop, h: newH }));
    }
  }, [dispH]);

  const onMouseUp = useCallback(() => { dragRef.current = null; }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',   onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  // ── Extract crops via Canvas ─────────────────────────────────────────────────
  const extract = () => {
    const img    = imgRef.current;
    if (!img) return;
    const scale  = natural.w / DISPLAY_W;

    const crop = ({ top, h }) => {
      const canvas = document.createElement('canvas');
      const srcTop = Math.round(top * scale);
      const srcH   = Math.round(h   * scale);
      canvas.width  = natural.w;
      canvas.height = srcH;
      canvas.getContext('2d').drawImage(img, 0, srcTop, natural.w, srcH, 0, 0, natural.w, srcH);
      return canvas.toDataURL('image/png');
    };

    onApply({
      header: crop(header),
      footer: crop(footer),
    });
  };

  const inputRef = useRef(null);

  return (
    <div className={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={s.modal}>

        {/* Header */}
        <div className={s.head}>
          <div className={s.headLeft}>
            <Scissors size={18} className={s.headIcon} />
            <div>
              <div className={s.headTitle}>Crop from Letterhead</div>
              <div className={s.headSub}>Upload your full letterhead and drag the bands to select header &amp; footer regions.</div>
            </div>
          </div>
          <button className={s.closeBtn} onClick={onClose}><X size={16} /></button>
        </div>

        <div className={s.body}>
          {!imgSrc ? (
            /* ── Drop zone ── */
            <div
              className={s.dropZone}
              onDrop={e => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); }}
              onDragOver={e => e.preventDefault()}
              onClick={() => inputRef.current?.click()}
            >
              <Upload size={32} className={s.dropIcon} />
              <div className={s.dropTitle}>Upload full letterhead / A4 scan</div>
              <div className={s.dropSub}>PNG · JPG · recommended 1240 × 1754 px (A4 @150dpi)</div>
              <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => loadFile(e.target.files[0])} />
            </div>
          ) : (
            /* ── Crop editor ── */
            <>
              <div className={s.legend}>
                <span className={s.legendHeader}><span className={s.dot} style={{ background: '#3b82f6' }} /> Header region</span>
                <span className={s.legendFooter}><span className={s.dot} style={{ background: '#f59e0b' }} /> Footer region</span>
                <span className={s.legendHint}>Drag bands to resize · drag grip to move</span>
                <button className={s.reuploadBtn} onClick={() => { setImgSrc(null); inputRef.current?.click(); }}>
                  <RotateCcw size={12} /> Change image
                </button>
                <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => loadFile(e.target.files[0])} />
              </div>

              {/* Image + overlay bands */}
              <div className={s.editor} style={{ width: DISPLAY_W, height: dispH }}>
                <img ref={imgRef} src={imgSrc} alt="Letterhead" className={s.letterhead} style={{ width: DISPLAY_W, height: dispH }} draggable={false} />

                {/* Header band */}
                <div
                  className={s.band}
                  style={{ top: header.top, height: header.h, borderColor: '#3b82f6', background: 'rgba(59,130,246,.15)' }}
                >
                  <div className={s.bandLabel} style={{ color: '#1d4ed8' }}>Header</div>
                  {/* Move handle */}
                  <div className={s.moveHandle} onMouseDown={e => onMouseDown(e, 'header', 'move')} title="Drag to move">
                    <MoveVertical size={13} />
                  </div>
                  {/* Bottom resize */}
                  <div className={s.resizeBottom} style={{ borderColor: '#3b82f6' }} onMouseDown={e => onMouseDown(e, 'header', 'bottom')} />
                </div>

                {/* Footer band */}
                <div
                  className={s.band}
                  style={{ top: footer.top, height: footer.h, borderColor: '#f59e0b', background: 'rgba(245,158,11,.15)' }}
                >
                  <div className={s.bandLabel} style={{ color: '#b45309' }}>Footer</div>
                  <div className={s.moveHandle} onMouseDown={e => onMouseDown(e, 'footer', 'move')} title="Drag to move">
                    <MoveVertical size={13} />
                  </div>
                  {/* Top resize */}
                  <div className={s.resizeTop} style={{ borderColor: '#f59e0b' }} onMouseDown={e => onMouseDown(e, 'footer', 'top')} />
                  {/* Bottom resize */}
                  <div className={s.resizeBottom} style={{ borderColor: '#f59e0b' }} onMouseDown={e => onMouseDown(e, 'footer', 'bottom')} />
                </div>
              </div>

              {/* Size info */}
              <div className={s.info}>
                <span>Header: {Math.round(header.h / dispH * 100)}% of page height</span>
                <span>Footer: {Math.round(footer.h / dispH * 100)}% of page height</span>
              </div>
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
