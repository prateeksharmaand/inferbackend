import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { applyTheme, PRESET_THEMES, loadSavedTheme } from '../../utils/theme';

const API = import.meta.env.VITE_API_URL || '';

export default function ThemeSettings() {
  const { token } = useAuth();
  const [color, setColor] = useState(() => loadSavedTheme().primary);
  const [status, setStatus] = useState(null); // 'saving' | 'saved' | 'error'

  // Load from DB on mount
  useEffect(() => {
    fetch(`${API}/api/emr/settings/theme`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.theme_color) {
          setColor(data.theme_color);
          applyTheme({ primary: data.theme_color });
        }
      })
      .catch(() => {});
  }, [token]);

  function handlePreset(preset) {
    setColor(preset.primary);
    applyTheme(preset);
    setStatus(null);
  }

  async function handleSave() {
    setStatus('saving');
    try {
      const res = await fetch(`${API}/api/emr/settings/theme`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ theme_color: color }),
      });
      if (!res.ok) throw new Error();
      applyTheme({ primary: color });
      setStatus('saved');
      setTimeout(() => setStatus(null), 2500);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus(null), 3000);
    }
  }

  return (
    <div style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Theme Color</h2>
        <p style={{ fontSize: 13, color: 'var(--color-text-2)', marginBottom: 16 }}>
          Choose a preset or pick a custom accent color. Saved to your clinic and applied across all sessions.
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
            onChange={(e) => { setColor(e.target.value); setStatus(null); }}
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
          disabled={status === 'saving'}
          style={{
            padding: '9px 24px', borderRadius: 8, border: 'none',
            background: 'var(--color-primary)', color: '#fff',
            fontSize: 13, fontWeight: 600, cursor: status === 'saving' ? 'wait' : 'pointer',
            opacity: status === 'saving' ? 0.7 : 1,
          }}
        >
          {status === 'saving' ? 'Saving…' : 'Apply & Save'}
        </button>
        {status === 'saved' && (
          <span style={{ fontSize: 13, color: 'var(--color-success)', fontWeight: 600 }}>Saved!</span>
        )}
        {status === 'error' && (
          <span style={{ fontSize: 13, color: 'var(--color-danger)', fontWeight: 600 }}>Save failed, try again.</span>
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
