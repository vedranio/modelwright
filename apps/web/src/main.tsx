import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ProjectClientProvider, createDefaultClient } from './platform';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <ProjectClientProvider client={createDefaultClient()}>
      <App />
    </ProjectClientProvider>
  </StrictMode>,
);
