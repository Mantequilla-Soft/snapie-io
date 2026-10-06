/**
 * Desktop width of the home right column.
 *
 * The empty slot and the loaded sidebar must use this same width. If the
 * slot is missing, the column paints at 0 and then jumps to 300px when the
 * sidebar chunk arrives, which reflows the feed.
 */
export const HOME_RIGHT_SIDEBAR_WIDTH = '300px';

export const homeRightSidebarFrame = {
  display: { base: 'none' as const, md: 'block' as const },
  w: { base: '100%', md: HOME_RIGHT_SIDEBAR_WIDTH },
  h: '100vh' as const,
};
