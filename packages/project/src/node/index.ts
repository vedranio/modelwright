/*
 * File I/O on a project's `.design/` folder, shared by the server and the CLI so both read and
 * write it the same way. Node only.
 */
export { readTextOrNull, writeAtomic } from './fsio';
export {
  BUILD_FILE,
  DESIGN_DIR,
  SPEC_FILE,
  buildFile,
  designDir,
  designDirState,
  designFile,
  isNotFound,
  specFile,
} from './paths';
export {
  loadDesign,
  regenerateSpec,
  validDesign,
  type LoadedDesign,
  type LoadedFile,
} from './spec';
export { readBuildRecord } from './build';
