import type { DocState } from '../useDesign';
import { DocStateView } from './DocStateView';
import { Empty, plural } from './common';

export function FlowsView({ state }: { state: DocState<'flows'> }) {
  return (
    <DocStateView kind="flows" state={state}>
      {(flows) => (
        <section>
          <p className="counts">
            {plural(flows.screens.length, 'screen', 'screens')} ·{' '}
            {plural(flows.transitions.length, 'transition', 'transitions')}
          </p>
          {flows.screens.length === 0 ? (
            <Empty>
              No screens yet. Add them to <code>.design/flows.json</code> and press Reload — the
              flow canvas arrives in phase 3.
            </Empty>
          ) : (
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
          )}
        </section>
      )}
    </DocStateView>
  );
}
