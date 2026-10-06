import type { ApiErrorBody, DesignError } from '@modelwright/schema';
import { isDesignKind } from '@modelwright/schema';
import { ProjectClientError, type DesignChange, type ProjectClient } from './ProjectClient';

/** The phase 1 ProjectClient: talks to apps/server through the Vite `/api` proxy. */
export function createHttpClient(baseUrl = '/api'): ProjectClient {
  async function send(method: string, path: string, body?: unknown): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, {
        method,
        ...(body !== undefined && {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
      });
    } catch {
      throw new ProjectClientError(
        'Cannot reach the modelwright server. Is `pnpm dev` running?',
        0,
      );
    }
    if (!res.ok) throw await toError(res);
    return res;
  }

  const query = (project: string) => `?path=${encodeURIComponent(project)}`;

  return {
    async openProject(path) {
      return (await send('POST', '/projects/open', { path })).json();
    },
    async initProject(path, name) {
      return (await send('POST', '/projects/init', { path, name })).json();
    },
    async listRecent() {
      return (await send('GET', '/projects/recent')).json();
    },
    async removeRecent(path) {
      await send('DELETE', '/projects/recent', { path });
    },
    async readDesign(path, file) {
      return (await send('GET', `/design/${file}${query(path)}`)).json();
    },
    async writeDesign(path, file, doc) {
      await send('PUT', `/design/${file}${query(path)}`, doc);
    },
    async checkPreview(url) {
      return (await send('POST', '/preview/check', { url })).json();
    },
    watchDesign(path, onChange) {
      // Server-sent events; EventSource reconnects by itself if the server restarts.
      const events = new EventSource(`${baseUrl}/design/events${query(path)}`);
      events.addEventListener('change', (event) => {
        try {
          const change: unknown = JSON.parse((event as MessageEvent<string>).data);
          if (isDesignChange(change)) onChange(change);
        } catch {
          // A malformed event is ignored; the focus re-read is the fallback.
        }
      });
      return () => events.close();
    },
  };
}

async function toError(res: Response): Promise<ProjectClientError> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    // Not JSON: fall through to the generic message.
  }
  if (isDesignError(body)) {
    return new ProjectClientError(`${body.file}.json is invalid`, res.status, body.issues);
  }
  if (isErrorBody(body)) return new ProjectClientError(body.message, res.status);
  return new ProjectClientError(`Request failed (${res.status} ${res.statusText})`, res.status);
}

function isDesignError(body: unknown): body is DesignError {
  return typeof body === 'object' && body !== null && 'file' in body && 'issues' in body;
}

function isErrorBody(body: unknown): body is ApiErrorBody {
  return typeof body === 'object' && body !== null && 'message' in body;
}

function isDesignChange(value: unknown): value is DesignChange {
  return typeof value === 'object' && value !== null && 'kind' in value && isDesignKind(value.kind);
}
