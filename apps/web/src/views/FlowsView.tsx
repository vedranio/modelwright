import type { DocState } from '../useDesign';
import { DocStateView } from './DocStateView';
import { EmptyCard, plural } from './common';

export function FlowsView({ state, onReload }: { state: DocState<'flows'>; onReload: () => void }) {
  return (
    <div className={`view-fill${state.status === 'ok' ? ' dot-grid' : ''}`}>
      <DocStateView kind="flows" state={state} onReload={onReload}>
        {(flows) =>
          flows.screens.length === 0 ? (
            // No "Add screen" button until phase 3 builds adding screens.
            <EmptyCard title="No screens yet">
              Screens are the places a user can be. Add one, then connect it to others.
            </EmptyCard>
          ) : (
            <section className="doc-list">
              <p className="counts">
                {plural(flows.screens.length, 'screen', 'screens')} ·{' '}
                {plural(flows.transitions.length, 'transition', 'transitions')}
              </p>
              <ul className="items">
                {flows.screens.map((screen) => (
                  <li key={screen.id}>
                    <strong>{screen.name}</strong>
                    <ul>
                      {screen.states.map((s, i) => (
                        <li key={s.id}>
                          {s.name}
                          {i === 0 && <span className="tag">default</span>}
                          {s.ctas.length > 0 && (
                            <span className="ctas">
                              {s.ctas.map((c) => (
                                <span key={c.id} className="cta">
                                  {c.label}
                                </span>
                              ))}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          )
        }
      </DocStateView>
    </div>
  );
}
