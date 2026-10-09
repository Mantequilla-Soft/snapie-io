/**
 * Where mobile /chat should go when the panel closes.
 * Desktop and in-page drawers stay put; the shell just hides the panel.
 * A phone visit to /chat itself has covered the tab bar, so closing has to
 * leave that route: back to the page they came from, or home if they opened
 * /chat directly.
 */
export type ChatCloseDestination = 'stay' | 'back' | 'home';

export function chatCloseDestination(input: {
  isPhone: boolean;
  pathname: string;
  previousPath: string | null;
}): ChatCloseDestination {
  if (!input.isPhone || input.pathname !== '/chat') return 'stay';
  if (input.previousPath && input.previousPath !== '/chat') return 'back';
  return 'home';
}
