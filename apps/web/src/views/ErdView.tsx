import type { DocState } from '../useDesign';
import { DocStateView } from './DocStateView';
import { Empty, plural } from './common';

export function ErdView({ state }: { state: DocState<'erd'> }) {
  return (
    <DocStateView kind="erd" state={state}>
      {(erd) => (
        <section>
          <p className="counts">
            {plural(erd.entities.length, 'entity', 'entities')} ·{' '}
            {plural(erd.relationships.length, 'relationship', 'relationships')}
          </p>
          {erd.entities.length === 0 ? (
            <Empty>
              No entities yet. Add them to <code>.design/erd.json</code> and press Reload — the ERD
              canvas arrives in phase 2.
            </Empty>
          ) : (
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
          )}
        </section>
      )}
    </DocStateView>
  );
}
