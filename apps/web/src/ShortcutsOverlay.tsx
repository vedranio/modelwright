import { useEffect, useRef } from 'react';
import {
  SCOPE_TITLES,
  SHORTCUTS,
  shortcutHint,
  type Scope,
  type ShortcutDef,
} from './shortcutRegistry';
import { Kbd } from './ui';

const ORDER: Scope[] = ['global', 'canvas', 'erd', 'flows', 'field'];

/**
 * Every working shortcut, grouped by where it applies, generated from the registry. While it's
 * open it owns the keyboard: Esc or ? closes it, and nothing else reacts.
 */
export function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  const card = useRef<HTMLDivElement>(null);
  const latestClose = useRef(onClose);
  useEffect(() => {
    latestClose.current = onClose;
  });

  useEffect(() => {
    card.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      // Capture phase, so the canvas and view shortcuts never see the key.
      e.stopPropagation();
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        latestClose.current();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  const groups = ORDER.map((scope) => ({
    scope,
    items: (SHORTCUTS as readonly ShortcutDef[]).filter((s) => s.scope === scope),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="dialog-scrim" onMouseDown={onClose}>
      <div
        ref={card}
        className="shortcuts-card"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="shortcuts-head">
          <h2 className="dialog-title">Keyboard shortcuts</h2>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            ×
          </button>
        </div>
        <div className="shortcuts-groups">
          {groups.map((g) => (
            <section key={g.scope} className="shortcuts-group">
              <h3 className="shortcuts-group-title">{SCOPE_TITLES[g.scope]}</h3>
              <dl className="shortcuts-list">
                {g.items.map((s) => (
                  <div key={s.id} className="shortcuts-row">
                    <dt>{s.label}</dt>
                    <dd>
                      <Kbd>{shortcutHint(s.id as never)}</Kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
