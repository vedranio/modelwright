import close from '@material-symbols/svg-400/outlined/close.svg';
import contrast from '@material-symbols/svg-400/outlined/contrast.svg';
import darkMode from '@material-symbols/svg-400/outlined/dark_mode.svg';
import dragIndicator from '@material-symbols/svg-400/outlined/drag_indicator.svg';
import keyboardArrowDown from '@material-symbols/svg-400/outlined/keyboard_arrow_down.svg';
import keyboardArrowUp from '@material-symbols/svg-400/outlined/keyboard_arrow_up.svg';
import keyboardReturn from '@material-symbols/svg-400/outlined/keyboard_return.svg';
import lightMode from '@material-symbols/svg-400/outlined/light_mode.svg';
import openInBrowser from '@material-symbols/svg-400/outlined/open_in_browser.svg';
import playArrow from '@material-symbols/svg-400/outlined/play_arrow.svg';
import questionMark from '@material-symbols/svg-400/outlined/question_mark.svg';
import redo from '@material-symbols/svg-400/outlined/redo.svg';
import refresh from '@material-symbols/svg-400/outlined/refresh.svg';
import shift from '@material-symbols/svg-400/outlined/shift.svg';
import stop from '@material-symbols/svg-400/outlined/stop.svg';
import syncAlt from '@material-symbols/svg-400/outlined/sync_alt.svg';
import terminal from '@material-symbols/svg-400/outlined/terminal.svg';
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
  drag_indicator: dragIndicator,
  keyboard_arrow_down: keyboardArrowDown,
  keyboard_arrow_up: keyboardArrowUp,
  keyboard_return: keyboardReturn,
  light_mode: lightMode,
  open_in_browser: openInBrowser,
  play_arrow: playArrow,
  question_mark: questionMark,
  redo,
  refresh,
  shift,
  stop,
  sync_alt: syncAlt,
  terminal,
  undo,
} as const;

export type IconName = keyof typeof ICONS;

/** `upright` turns a horizontal icon a quarter turn, e.g. sync_alt's ⇄ into up/down arrows. */
export function Icon({ name, upright = false }: { name: IconName; upright?: boolean }) {
  const url = `url("${ICONS[name]}")`;
  return (
    <span
      className={`icon${upright ? ' icon-upright' : ''}`}
      data-icon={name}
      aria-hidden="true"
      style={{ maskImage: url, WebkitMaskImage: url }}
    />
  );
}
