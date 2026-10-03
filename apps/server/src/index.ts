import { serve } from '@hono/node-server';
import { createApp } from './app';

export const HOST = '127.0.0.1';
export const PORT = 4301;

serve({ fetch: createApp().fetch, hostname: HOST, port: PORT }, (info) => {
  console.log(`modelwright server listening on http://${info.address}:${info.port}`);
});
