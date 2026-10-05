/**
 * Puts plain text on the clipboard. Uses the async Clipboard API, and falls back to a hidden
 * textarea and `execCommand('copy')` where clipboard permission is denied (some embedded
 * browsers). Must be called from a user gesture. Resolves to whether the copy succeeded.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return copyViaSelection(text);
  }
}

function copyViaSelection(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  try {
    // Deprecated, but the only fallback when the Clipboard API is refused.
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}
