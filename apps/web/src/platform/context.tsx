import { createContext, useContext, type ReactNode } from 'react';
import type { ProjectClient } from './ProjectClient';

const ProjectClientContext = createContext<ProjectClient | null>(null);

export function ProjectClientProvider({
  client,
  children,
}: {
  client: ProjectClient;
  children: ReactNode;
}) {
  return <ProjectClientContext value={client}>{children}</ProjectClientContext>;
}

export function useProjectClient(): ProjectClient {
  const client = useContext(ProjectClientContext);
  if (!client) throw new Error('useProjectClient must be used inside <ProjectClientProvider>');
  return client;
}
