import os from 'node:os';
import path from 'node:path';

export const SERVER_HOST = '127.0.0.1';
export const SERVER_PORT = 4301;
export const WEB_PORT = 4300;

/** Where modelwright keeps its own state (recents). Never inside this repo or a project. */
export function defaultHomeDir(): string {
  return process.env['MODELWRIGHT_HOME'] ?? path.join(os.homedir(), '.modelwright');
}

/** Host headers the server answers to: itself directly, or via the Vite proxy (which keeps the browser's Host). */
export const DEFAULT_ALLOWED_HOSTS: readonly string[] = ['127.0.0.1', 'localhost'].flatMap(
  (host) => [`${host}:${SERVER_PORT}`, `${host}:${WEB_PORT}`],
);

/** Origins allowed to call the API: the web app only. */
export const DEFAULT_ALLOWED_ORIGINS: readonly string[] = [
  `http://127.0.0.1:${WEB_PORT}`,
  `http://localhost:${WEB_PORT}`,
];
