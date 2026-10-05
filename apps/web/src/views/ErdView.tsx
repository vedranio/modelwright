import type { DocState } from '../useDesign';
import { DocStateView } from './DocStateView';
import { EmptyCard, plural } from './common';

export function ErdView({ state, onReload }: { state: DocState<'erd'>; onReload: () => void }) {
  return (
    <div className={`view-fill${state.status === 'ok' ? ' dot-grid' : ''}`}>
      <DocStateView kind="erd" state={state} onReload={onReload}>
        {(erd) =>
          erd.entities.length === 0 ? (
            <EmptyCard title="No entities yet">
              Entities are the data your app stores. Add one to start the diagram.
            </EmptyCard>
          ) : (
            <section className="doc-list">
              <p className="counts">
                {plural(erd.entities.length, 'entity', 'entities')} ·{' '}
                {plural(erd.relationships.length, 'relationship', 'relationships')}
              </p>
              <ul className="items">
                {erd.entities.map((entity) => (
                  <li key={entity.id}>
                    <strong>{entity.name}</strong>
                    {entity.attributes.length === 0 ? (
                      <span className="muted"> — no attributes</span>
                    ) : (
                      <ul>
                        {entity.attributes.map((a) => (
                          <li key={a.id}>{a.name}</li>
                        ))}
                      </ul>
                    )}
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
