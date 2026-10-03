import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isNotFound } from './paths';

/** Reads a UTF-8 file, or returns null if it doesn't exist. */
export async function readTextOrNull(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/**
 * Replaces `file` with `text` so that readers only ever see the old contents or the new ones:
 * write a temp file beside it, flush it to disk, then rename over the original. On any failure
 * the temp file is removed and the original is untouched.
 */
export async function writeAtomic(file: string, text: string): Promise<void> {
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
  try {
    const handle = await fs.open(temp, 'wx');
    try {
      await handle.writeFile(text, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temp, file);
  } catch (err) {
    await fs.rm(temp, { force: true });
    throw err;
  }
}
