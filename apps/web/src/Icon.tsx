import close from '@material-symbols/svg-400/outlined/close.svg';
import contrast from '@material-symbols/svg-400/outlined/contrast.svg';
import darkMode from '@material-symbols/svg-400/outlined/dark_mode.svg';
import lightMode from '@material-symbols/svg-400/outlined/light_mode.svg';
import openInBrowser from '@material-symbols/svg-400/outlined/open_in_browser.svg';
import questionMark from '@material-symbols/svg-400/outlined/question_mark.svg';
import redo from '@material-symbols/svg-400/outlined/redo.svg';
import refresh from '@material-symbols/svg-400/outlined/refresh.svg';
import shift from '@material-symbols/svg-400/outlined/shift.svg';
import undo from '@material-symbols/svg-400/outlined/undo.svg';

/**
 * Google's Material Symbols (outlined, weight 400), from the self-hosted
 * @material-symbols/svg-400 package. Each icon is a mask over `currentColor`, so it takes the
 * text colour (and therefore the theme) of whatever it sits in. Add icons here as they're used.
 */
const ICONS = {
  close,
  contrast,
  dark_mode: darkMode,
  light_mode: lightMode,
  open_in_browser: openInBrowser,
  question_mark: questionMark,
  redo,
  refresh,
  shift,
  undo,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name }: { name: IconName }) {
  const url = `url("${ICONS[name]}")`;
  return (
    <span className="icon" aria-hidden="true" style={{ maskImage: url, WebkitMaskImage: url }} />
  );
}
