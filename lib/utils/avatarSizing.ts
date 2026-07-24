export type AvatarSizeToken = '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
export type ResponsiveAvatarSize = string | { base?: string; sm?: string; md?: string; lg?: string; xl?: string };

// Chakra v2's fixed px value per size token — used to resolve an arbitrary
// px/responsive size down to the nearest token, so Chakra's internal
// initials/icon scale correctly even when a caller then forces an exact
// boxSize. Without this, a bare boxSize override (the workaround several
// call sites used before the shared Avatar component existed) leaves
// initials sized for the unlabeled default ('md'/48px) on a 100px avatar.
export const AVATAR_TOKEN_PX: Record<AvatarSizeToken, number> = {
  '2xs': 16, xs: 24, sm: 32, md: 48, lg: 64, xl: 96, '2xl': 128,
};

export function pxToAvatarToken(px: number): AvatarSizeToken {
  let closest: AvatarSizeToken = 'md';
  let bestDiff = Infinity;
  for (const token of Object.keys(AVATAR_TOKEN_PX) as AvatarSizeToken[]) {
    const diff = Math.abs(AVATAR_TOKEN_PX[token] - px);
    if (diff < bestDiff) { bestDiff = diff; closest = token; }
  }
  return closest;
}

export function resolveAvatarToken(size: AvatarSizeToken | ResponsiveAvatarSize): AvatarSizeToken {
  const raw = typeof size === 'string' ? size : size.md ?? size.base ?? size.lg ?? size.sm ?? size.xl ?? 'md';
  if (raw in AVATAR_TOKEN_PX) return raw as AvatarSizeToken;
  const px = parseFloat(raw);
  return Number.isFinite(px) ? pxToAvatarToken(px) : 'md';
}

// Maps a requested size down to the 3-tier scheme getHiveAvatarUrl expects —
// mirrors how call sites already chose a tier before the shared Avatar
// component existed (small icons used 'small', ~50-64px used 'medium',
// 96px+ used 'large').
export function urlSizeForAvatarToken(token: AvatarSizeToken): 'small' | 'medium' | 'large' {
  if (token === '2xs' || token === 'xs' || token === 'sm') return 'small';
  if (token === 'md' || token === 'lg') return 'medium';
  return 'large';
}
