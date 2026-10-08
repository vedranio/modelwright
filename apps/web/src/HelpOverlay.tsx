import { useEffect, useRef, useState } from 'react';
import { BUILD_COMMAND } from './buildRecord/BuildIndicator';
import { CommandSnippet } from './CommandSnippet';
import {
  SCOPE_TITLES,
  SHORTCUTS,
  shortcutHint,
  type Scope,
  type ShortcutDef,
} from './shortcutRegistry';
import { Kbd } from './ui';

const ORDER: Scope[] = ['global', 'canvas', 'erd', 'flows', 'field'];

export type HelpTab = 'guide' | 'shortcuts';

const TABS: { id: HelpTab; label: string }[] = [
  { id: 'guide', label: 'How it works' },
  { id: 'shortcuts', label: 'Keyboard shortcuts' },
];

/**
 * Help, in two tabs: how modelwright works with an AI coding tool, and every working shortcut
 * (grouped by where it applies, generated from the registry). While it's open it owns the
 * keyboard: Esc or ? closes it, and nothing else reacts.
 */
export function HelpOverlay({ tab: initialTab, onClose }: { tab: HelpTab; onClose: () => void }) {
  const [tab, setTab] = useState(initialTab);
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
        aria-label="Help"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="shortcuts-head">
          <div className="segmented" role="tablist" aria-label="Help">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={tab === t.id ? 'selected' : undefined}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
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
        {tab === 'guide' ? (
          <HowItWorks />
        ) : (
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
        )}
      </div>
    </div>
  );
}

/** How modelwright and an AI coding tool split the work, and where they meet. */
function HowItWorks() {
  return (
    <div className="help-guide">
      <p className="help-lead">
        You design how the app works here: its data and its screen flows. Your AI tools build it and
        design how it looks. They meet in your project’s <code>.design/</code> folder.
      </p>

      <div className="help-sides">
        <section>
          <h3 className="shortcuts-group-title">In modelwright</h3>
          <ul>
            <li>
              <strong>ERD:</strong> the data your app keeps: entities, their attributes and how they
              relate.
            </li>
            <li>
              <strong>Flows:</strong> the screens, the states each can be in, what each state shows
              and the actions that lead elsewhere.
            </li>
            <li>
              <strong>UI:</strong> a live preview of the running app, for checking what was built.
              It’s not for designing: you can’t change the app from it.
            </li>
            <li>
              Everything saves to <code>.design/</code>. modelwright never touches your code.
            </li>
          </ul>
        </section>
        <section>
          <h3 className="shortcuts-group-title">In your AI coding tool</h3>
          <ul>
            <li>
              With the modelwright plugin installed in Claude Code, run the build command in your
              project.
            </li>
            <li>
              It reads the design, then shows a plan and its assumptions, and waits for your OK.
            </li>
            <li>It writes the code, checks every screen and state, and records the build.</li>
            <li>It never changes your design. If something is missing or unclear, it asks you.</li>
            <li>
              The first build is deliberately plain: it follows your design’s structure, not a look.
            </li>
          </ul>
        </section>
      </div>

      <h3 className="shortcuts-group-title">Designing how it looks</h3>
      <p>
        Visual design happens in your AI tools, not in modelwright. Once the screens are built,
        design the UI in your AI design tool (e.g. Claude Design), then ask your coding tool to
        apply it to the app. Check the result in the UI view. Later changes to the flows still
        update only what changed, so the visual design is kept.
      </p>

      <h3 className="shortcuts-group-title">The loop</h3>
      <ol>
        <li>Design the data and flows here.</li>
        <li>Run the build command in your project, and approve the plan.</li>
        <li>Check the app in the UI view.</li>
        <li>Design the look in your AI design tool, and have your coding tool apply it.</li>
        <li>
          Change the data or flows here. The header shows what changed since the last build; running
          the command again applies only those changes.
        </li>
      </ol>
      <CommandSnippet command={BUILD_COMMAND} />
    </div>
  );
}
