import type { Screen } from '@modelwright/schema';
import type { Size } from '../canvas/placement';

/**
 * Screen card geometry in canvas units, used to place unpositioned screens without measuring
 * the DOM, so placement stays pure and deterministic. These are generous estimates of the card
 * that ScreenNode renders (whose CSS sizes come from tokens.css); overestimating only adds space.
 */
export const SCREEN_WIDTH = 260; // keep in step with --screen-w in tokens.css
const HEADER_HEIGHT = 40;
const NOTES_HEIGHT = 20;
/** A state's header row, shown only when the screen has more than one state. */
const STATE_HEADER_HEIGHT = 32;
/** The "Information" and "Actions" captions. */
const CAPTION_HEIGHT = 24;
/** Sees items and CTAs are both one line. */
const SEES_ROW_HEIGHT = 22;
const CTA_ROW_HEIGHT = 22;
/**
 * Room for each list's "+ add" row and the space above it, the keyline between the lists,
 * and the state's padding.
 */
const STATE_FOOTER_HEIGHT = 90;

export function estimateScreenSize(screen: Screen): Size {
  const multi = screen.states.length > 1;
  return {
    width: SCREEN_WIDTH,
    height:
      HEADER_HEIGHT +
      (screen.notes ? NOTES_HEIGHT : 0) +
      screen.states.reduce(
        (sum, s) =>
          sum +
          (multi ? STATE_HEADER_HEIGHT : 0) +
          (s.notes ? NOTES_HEIGHT : 0) +
          2 * CAPTION_HEIGHT +
          s.sees.length * SEES_ROW_HEIGHT +
          s.ctas.length * CTA_ROW_HEIGHT +
          STATE_FOOTER_HEIGHT,
        0,
      ),
  };
}
