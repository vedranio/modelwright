import { describe, expect, it } from 'vitest';
import { UNREACHABLE_MESSAGE, clientError } from '../src/platform/httpClient';

describe('clientError', () => {
  it('reports a 5xx without our JSON body as an unreachable server', () => {
    // What the dev proxy answers when the modelwright server isn't running.
    const err = clientError(500, 'Internal Server Error', undefined);
    expect(err.status).toBe(0);
    expect(err.message).toBe(UNREACHABLE_MESSAGE);
    expect(clientError(502, 'Bad Gateway', 'proxy error').status).toBe(0);
  });

  it('keeps our server’s own errors, 5xx included', () => {
    const err = clientError(500, 'Internal Server Error', { message: 'Disk full' });
    expect(err.status).toBe(500);
    expect(err.message).toBe('Disk full');
    expect(clientError(409, 'Conflict', { message: 'Not initialised' }).status).toBe(409);
  });

  it('keeps validation errors with their issues', () => {
    const issues = [{ path: ['name'], message: 'Required' }];
    const err = clientError(422, 'Unprocessable Entity', { file: 'config', issues });
    expect(err.status).toBe(422);
    expect(err.issues).toEqual(issues);
  });

  it('reports other failures without a body by status', () => {
    expect(clientError(404, 'Not Found', undefined).message).toBe('Request failed (404 Not Found)');
  });
});
