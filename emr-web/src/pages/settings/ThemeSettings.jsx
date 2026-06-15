import { useState, useEffect } from 'react';
import { applyTheme, PRESET_THEMES, loadSavedTheme } from '../../utils/theme';

export default function ThemeSettings() {
  const [color, setColor] = useState(() => loadSavedTheme().primary);
  const [saved, setSaved] = useState(false);

  function handlePreset(preset) {
    setColor(preset.primary);
    applyTheme(preset);
    setSaved(false);
  }

  function handleSave() {
    applyTheme({ primary: color });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Theme Color</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-2)', marginBottom: 16 }}>
          Choose a preset or pick a custom accent color used across the entire app.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
          {PRESET_THEMES.map((preset) => (
            <button
              key={preset.name}
              title={preset.name}
              onClick={() => handlePreset(preset)}
              style={{
                width: 36, height: 36, borderRadius: '50%',
                background: preset.primary, border: '3px solid',
                borderColor: color === preset.primary ? '#fff' : 'transparent',
                outline: color === preset.primary ? `2px solid ${preset.primary}` : 'none',
                cursor: 'pointer', transition: 'all .15s',
              }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-2)', minWidth: 100 }}>
            Custom color
          </label>
          <input
            type="color"
            value={color}
            onChange={(e) => { setColor(e.target.value); setSaved(false); }}
            style={{
              width: 44, height: 36, border: '1px solid var(--color-border)',
              borderRadius: 8, cursor: 'pointer', padding: 2, background: 'var(--color-surface)',
            }}
          />
          <span style={{ fontSize: 13, color: 'var(--color-text-2)', fontFamily: 'monospace' }}>{color}</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={handleSave}
          style={{
            padding: '9px 24px', borderRadius: 8, border: 'none',
            background: 'var(--color-primary)', color: '#fff',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Apply Theme
        </button>
        {saved && (
          <span style={{ fontSize: 13, color: 'var(--color-success)', fontWeight: 600 }}>
            Theme applied!
          </span>
        )}
      </div>

      <div style={{
        padding: 16, borderRadius: 10, border: '1px solid var(--color-border)',
        background: 'var(--color-bg)',
      }}>
        <p style={{ fontSize: 12, color: 'var(--color-text-2)', marginBottom: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>Preview</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button style={{ padding: '7px 16px', borderRadius: 7, border: 'none', background: color, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'default' }}>
            Primary Button
          </button>
          <span style={{ padding: '3px 10px', borderRadius: 20, background: color + '22', color: color, fontSize: 12, fontWeight: 600 }}>
            Badge
          </span>
          <div style={{ width: 20, height: 20, borderRadius: '50%', background: color }} />
          <span style={{ fontSize: 13, color: color, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer' }}>Link text</span>
        </div>
      </div>
    </div>
  );
}
