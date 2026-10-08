import type { Config } from '@modelwright/schema';

/*
 * Pure edits to config.json, following the ERD and Flows conventions: an unchanged edit
 * returns the same object, and a blank optional removes its key. `devCommand` and `devices`
 * aren't editable from the UI and pass through untouched.
 */

/** A blank name is refused (the schema requires one): the config comes back unchanged. */
export function renameProject(config: Config, name: string): Config {
  if (name.trim() === '' || name === config.name) return config;
  return { ...config, name };
}

/** Sets `preview.url`. A blank value removes the key. The URL is expected to be validated already. */
export function setPreviewUrl(config: Config, url: string): Config {
  const next = url.trim();
  const { url: current, ...rest } = config.preview;
  if (next === '') return current === undefined ? config : { ...config, preview: rest };
  if (next === current) return config;
  return { ...config, preview: { ...config.preview, url: next } };
}

/** Sets `preview.devCommand`. A blank value removes the key. */
export function setDevCommand(config: Config, command: string): Config {
  const next = command.trim();
  const { devCommand: current, ...rest } = config.preview;
  if (next === '') return current === undefined ? config : { ...config, preview: rest };
  if (next === current) return config;
  return { ...config, preview: { ...config.preview, devCommand: next } };
}
