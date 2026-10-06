import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { THEMES, useTheme } from './theme';

/** The header's theme control: an icon showing the current setting, opening a small menu. */
export function ThemeMenu() {
  const [theme, setTheme] = useTheme();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const current = THEMES.find((t) => t.id === theme) ?? THEMES[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  return (
    <div className="theme-menu" ref={root}>
      <button
        type="button"
        className="btn-icon"
        aria-label={`Theme: ${current?.label}`}
        title={`Theme: ${current?.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {current && <Icon name={current.icon} />}
      </button>
      {open && (
        <div className="theme-menu-list" role="menu" aria-label="Theme">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitemradio"
              aria-checked={t.id === theme}
              className={`theme-menu-item${t.id === theme ? ' selected' : ''}`}
              onClick={() => {
                setTheme(t.id);
                setOpen(false);
              }}
            >
              <Icon name={t.icon} />
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
