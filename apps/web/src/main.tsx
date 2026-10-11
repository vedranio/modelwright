import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ProjectClientProvider, createDefaultClient, desktopApi } from './platform';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './styles.css';

// The desktop app's styles (the title bar inset and drag region) key off this.
if (desktopApi()) document.documentElement.dataset['host'] = 'desktop';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <ProjectClientProvider client={createDefaultClient()}>
      <App />
    </ProjectClientProvider>
  </StrictMode>,
);
