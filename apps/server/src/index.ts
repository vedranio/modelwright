import { serve } from '@hono/node-server';
import { DevServers } from '@modelwright/core';
import { createApp } from './app';
import { DEMO_TEMPLATE } from './demo';
import { SERVER_HOST, SERVER_PORT, defaultHomeDir } from './config';

const homeDir = defaultHomeDir();
const devServers = new DevServers({ homeDir });
const app = createApp({ homeDir, demoTemplate: DEMO_TEMPLATE, devServers });

// Dev servers started from the UI stop with this server, never left running on their ports.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.once(signal, () => {
    devServers.stopAll();
    process.exit(0);
  });
}

serve({ fetch: app.fetch, hostname: SERVER_HOST, port: SERVER_PORT }, (info) => {
  console.log(`modelwright server listening on http://${info.address}:${info.port}`);
});
