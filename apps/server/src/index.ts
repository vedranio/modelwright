import { serve } from '@hono/node-server';
import { createApp } from './app';
import { SERVER_HOST, SERVER_PORT, defaultHomeDir } from './config';

const app = createApp({ homeDir: defaultHomeDir() });

serve({ fetch: app.fetch, hostname: SERVER_HOST, port: SERVER_PORT }, (info) => {
  console.log(`modelwright server listening on http://${info.address}:${info.port}`);
});
