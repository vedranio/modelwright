/*
 * Pure rules shared by the web app and the CLI, so an edit made in either follows the same
 * conventions. Safe to import in the browser: nothing here touches Node.
 */
export { renameProject, setDevCommand, setPreviewUrl } from './config';
export {
  PROBLEMS,
  TOOL_PORTS,
  checkPreviewUrl,
  isLoopback,
  normalizePreviewUrl,
  type UrlCheck,
  type UrlRules,
} from './url';
