import brightnessAuto from '@material-symbols/svg-400/outlined/brightness_auto.svg';
import darkMode from '@material-symbols/svg-400/outlined/dark_mode.svg';
import lightMode from '@material-symbols/svg-400/outlined/light_mode.svg';

/**
 * Google's Material Symbols (outlined, weight 400), from the self-hosted
 * @material-symbols/svg-400 package. Each icon is a mask over `currentColor`, so it takes the
 * text colour (and therefore the theme) of whatever it sits in. Add icons here as they're used.
 */
const ICONS = {
  brightness_auto: brightnessAuto,
  dark_mode: darkMode,
  light_mode: lightMode,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name }: { name: IconName }) {
  const url = `url("${ICONS[name]}")`;
  return (
    <span className="icon" aria-hidden="true" style={{ maskImage: url, WebkitMaskImage: url }} />
  );
}
