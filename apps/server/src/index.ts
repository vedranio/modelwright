import { serve } from '@hono/node-server';
import { createApp } from './app';
import { DEMO_TEMPLATE } from './demo';
import { SERVER_HOST, SERVER_PORT, defaultHomeDir } from './config';

const app = createApp({ homeDir: defaultHomeDir(), demoTemplate: DEMO_TEMPLATE });

serve({ fetch: app.fetch, hostname: SERVER_HOST, port: SERVER_PORT }, (info) => {
  console.log(`modelwright server listening on http://${info.address}:${info.port}`);
});
