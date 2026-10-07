export const PIECE_IDS = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'] as const;
export type PieceId = (typeof PIECE_IDS)[number];

/** 0 is empty. `G` is a garbage cell. Everything else is a locked or active piece. */
export type Cell = 0 | PieceId | 'G';

/**
 * Snapie palette (Sweetie-16, same family as Rush and Blast) — not the
 * guideline cyan/yellow/purple set.
 */
export const PIECE_COLORS: Record<PieceId | 'G', string> = {
  I: '#73eff7',
  O: '#ffcd75',
  T: '#b13e53',
  S: '#38b764',
  Z: '#ef7d57',
  J: '#3b5dc9',
  L: '#41a6f6',
  G: '#566c86',
};

export const SHELL = '#1a1c2c';
export const PANEL = '#12131f';
export const LIGHT = '#f4f4f4';
export const ORANGE = '#ef7d57';
export const CYAN = '#41ead4';
export const GREEN = '#38b764';

type Shape = readonly (readonly [number, number])[];

/** Four rotations, each a list of [dx, dy] cells inside a 4×4 box. */
export const SHAPES: Record<PieceId, readonly [Shape, Shape, Shape, Shape]> = {
  I: [
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[1, 0], [1, 1], [1, 2], [1, 3]],
  ],
  O: [
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
  ],
  T: [
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [1, 2]],
  ],
  S: [
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
  ],
  Z: [
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 0], [0, 1], [1, 1], [0, 2]],
  ],
  J: [
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [0, 2], [1, 2]],
  ],
  L: [
    [[2, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1], [1, 2]],
  ],
};

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle of one 7-bag. Every piece appears once. */
export function shuffleBag(rng: () => number, source: readonly PieceId[] = PIECE_IDS): PieceId[] {
  const bag = [...source];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = bag[i];
    bag[i] = bag[j]!;
    bag[j] = tmp!;
  }
  return bag;
}
