import { parseBuildRecordJson, type BuildRead } from '@modelwright/schema';
import { readTextOrNull } from './fsio';
import { buildFile } from './paths';

/** Reads `.design/build.json`: none, a valid record, or the problems that make it invalid. */
export async function readBuildRecord(projectDir: string): Promise<BuildRead> {
  const text = await readTextOrNull(buildFile(projectDir));
  if (text === null) return { status: 'none' };
  const result = parseBuildRecordJson(text);
  return result.ok
    ? { status: 'ok', record: result.record }
    : { status: 'invalid', issues: result.issues };
}
