import { BLOCKS_BOARD_H, BLOCKS_BOARD_W } from '@/lib/games/blocks/constants';
import {
  SHAPES,
  mulberry32,
  shuffleBag,
  type Cell,
  type PieceId,
} from '@/lib/games/blocks/pieces';

const SPAWN_X = 3;
const SPAWN_Y = 0;
const DAS_MS = 140;
const ARR_MS = 40;
const LOCK_MS = 500;
const SOFT_MS = 45;
const MAX_LOCK_RESETS = 12;
const QUEUE_SIZE = 5;

export interface ActivePiece {
  id: PieceId;
  rot: number;
  x: number;
  y: number;
}

export interface BlocksInput {
  left: boolean;
  right: boolean;
  soft: boolean;
  /** True for a single tick when the player hard-drops. */
  hard: boolean;
  rotateCW: boolean;
  rotateCCW: boolean;
}

export type BlocksEngineEvent =
  | { type: 'clear'; lines: number; eventId: string }
  | { type: 'garbage'; ids: string[] }
  | { type: 'top-out' };

export interface BlocksEngine {
  board: Cell[][];
  active: ActivePiece | null;
  queue: PieceId[];
  alive: boolean;
  linesCleared: number;
  pendingGarbage: number;
  tick(dtMs: number, input: BlocksInput): void;
  addGarbage(id: string, lines: number): void;
  ghostY(): number | null;
  drainEvents(): BlocksEngineEvent[];
}

interface PendingGarbage {
  id: string;
  lines: number;
}

interface EngineOpts {
  seed?: number;
  /** When set, pieces are drawn from this list before the 7-bag. Tests use it. */
  sequence?: PieceId[];
}

export function emptyBoard(): Cell[][] {
  return Array.from({ length: BLOCKS_BOARD_H }, () =>
    Array.from({ length: BLOCKS_BOARD_W }, () => 0 as Cell),
  );
}

export function pieceCells(active: ActivePiece): [number, number][] {
  return SHAPES[active.id][active.rot].map(([dx, dy]) => [active.x + dx, active.y + dy]);
}

export function collides(board: Cell[][], active: ActivePiece): boolean {
  for (const [x, y] of pieceCells(active)) {
    if (x < 0 || x >= BLOCKS_BOARD_W || y >= BLOCKS_BOARD_H) return true;
    if (y >= 0 && board[y]![x] !== 0) return true;
  }
  return false;
}

/** Removes full rows in place. Returns how many rows were cleared. */
export function clearFullLines(board: Cell[][]): number {
  let cleared = 0;
  for (let y = board.length - 1; y >= 0; y--) {
    if (board[y]!.every((cell) => cell !== 0)) {
      board.splice(y, 1);
      board.unshift(Array.from({ length: BLOCKS_BOARD_W }, () => 0 as Cell));
      cleared += 1;
      y += 1;
    }
  }
  return cleared;
}

/**
 * Inserts garbage along the bottom and shifts the stack up. One hole column
 * is shared by the whole batch. Returns whether locked cells were pushed
 * off the top (a top-out).
 */
export function insertGarbageRows(board: Cell[][], lines: number, hole: number): { topped: boolean } {
  let topped = false;
  const holeX = ((hole % BLOCKS_BOARD_W) + BLOCKS_BOARD_W) % BLOCKS_BOARD_W;
  for (let n = 0; n < lines; n++) {
    if (board[0]!.some((cell) => cell !== 0)) topped = true;
    board.shift();
    const row: Cell[] = Array.from({ length: BLOCKS_BOARD_W }, () => 'G' as Cell);
    row[holeX] = 0;
    board.push(row);
  }
  return { topped };
}

function gravityInterval(linesCleared: number): number {
  return Math.max(120, 900 - Math.floor(linesCleared / 8) * 70);
}

export function createBlocksEngine(opts: EngineOpts = {}): BlocksEngine {
  const rng = mulberry32(opts.seed ?? Math.floor(Math.random() * 0x7fffffff));
  const script = opts.sequence ? [...opts.sequence] : null;
  const board = emptyBoard();
  const queue: PieceId[] = [];
  let bag: PieceId[] = [];
  const events: BlocksEngineEvent[] = [];
  const seenGarbage = new Set<string>();
  const pending: PendingGarbage[] = [];
  let active: ActivePiece | null = null;
  let alive = true;
  let linesCleared = 0;
  let clearSeq = 0;
  let gravAcc = 0;
  let lockAcc = 0;
  let lockResets = 0;
  let dasDir = 0;
  let dasMs = 0;
  let arrMs = 0;
  let prevLeft = false;
  let prevRight = false;
  let prevHard = false;
  let prevCW = false;
  let prevCCW = false;
  let toppedOut = false;

  function drawFromBag(): PieceId {
    if (script && script.length > 0) return script.shift()!;
    if (bag.length === 0) bag = shuffleBag(rng);
    return bag.pop()!;
  }

  function fillQueue() {
    while (queue.length < QUEUE_SIZE) queue.push(drawFromBag());
  }

  function die() {
    if (!alive) return;
    alive = false;
    active = null;
    if (!toppedOut) {
      toppedOut = true;
      events.push({ type: 'top-out' });
    }
  }

  function spawnNext() {
    if (!alive) return;
    fillQueue();
    const id = queue.shift()!;
    fillQueue();
    const next: ActivePiece = { id, rot: 0, x: SPAWN_X, y: SPAWN_Y };
    if (collides(board, next)) {
      active = null;
      die();
      return;
    }
    active = next;
    lockAcc = 0;
    lockResets = 0;
    gravAcc = 0;
  }

  function tryMove(dx: number, dy: number): boolean {
    if (!active) return false;
    const next = { ...active, x: active.x + dx, y: active.y + dy };
    if (collides(board, next)) return false;
    active = next;
    return true;
  }

  function tryRotate(dir: 1 | -1): boolean {
    if (!active) return false;
    const rot = (active.rot + (dir === 1 ? 1 : 3)) % 4;
    const kicks: readonly (readonly [number, number])[] = [
      [0, 0],
      [-1, 0],
      [1, 0],
      [0, -1],
      [-2, 0],
      [2, 0],
      [-1, -1],
      [1, -1],
      [0, -2],
    ];
    for (const [kx, ky] of kicks) {
      const next = { ...active, rot, x: active.x + kx, y: active.y + ky };
      if (!collides(board, next)) {
        active = next;
        return true;
      }
    }
    return false;
  }

  function applyPendingGarbage() {
    if (!alive || pending.length === 0) return;
    const batch = pending.splice(0, pending.length);
    const lines = batch.reduce((sum, row) => sum + row.lines, 0);
    const hole = Math.floor(rng() * BLOCKS_BOARD_W);
    const { topped } = insertGarbageRows(board, lines, hole);
    if (active) {
      active = { ...active, y: active.y - lines };
      if (collides(board, active)) {
        let guard = 0;
        while (active && collides(board, active) && guard < lines + 2) {
          active = { ...active, y: active.y + 1 };
          guard += 1;
        }
        if (active && collides(board, active)) {
          events.push({ type: 'garbage', ids: batch.map((row) => row.id) });
          die();
          return;
        }
      }
    }
    events.push({ type: 'garbage', ids: batch.map((row) => row.id) });
    if (topped) die();
  }

  function lockPiece() {
    if (!active || !alive) return;
    for (const [x, y] of pieceCells(active)) {
      if (y < 0) {
        die();
        return;
      }
      board[y]![x] = active.id;
    }
    active = null;
    const lines = clearFullLines(board);
    if (lines > 0) {
      linesCleared += lines;
      clearSeq += 1;
      const salt = Math.floor(rng() * 0xffffffff)
        .toString(36)
        .padStart(6, '0');
      events.push({ type: 'clear', lines, eventId: `clr_${clearSeq.toString(36)}_${salt}` });
    }
    applyPendingGarbage();
    if (alive) spawnNext();
  }

  function hardDrop() {
    if (!active || !alive) return;
    while (tryMove(0, 1)) {
      /* fall */
    }
    lockPiece();
  }

  function resetLock() {
    if (lockResets < MAX_LOCK_RESETS) {
      lockAcc = 0;
      lockResets += 1;
    }
  }

  fillQueue();
  spawnNext();

  return {
    board,
    get active() {
      return active;
    },
    queue,
    get alive() {
      return alive;
    },
    get linesCleared() {
      return linesCleared;
    },
    get pendingGarbage() {
      return pending.reduce((sum, row) => sum + row.lines, 0);
    },
    addGarbage(id, lines) {
      if (!alive || lines <= 0 || seenGarbage.has(id)) return;
      seenGarbage.add(id);
      pending.push({ id, lines });
    },
    ghostY() {
      if (!active || !alive) return null;
      let y = active.y;
      while (!collides(board, { ...active, y: y + 1 })) y += 1;
      return y;
    },
    drainEvents() {
      return events.splice(0, events.length);
    },
    tick(dtMs, input) {
      if (!alive || !active) {
        prevHard = input.hard;
        prevCW = input.rotateCW;
        prevCCW = input.rotateCCW;
        return;
      }
      const dt = Math.max(0, Math.min(dtMs, 100));
      const dir = input.left && !input.right ? -1 : input.right && !input.left ? 1 : 0;
      if (dir === 0) {
        dasDir = 0;
        dasMs = 0;
        arrMs = 0;
      } else if (dir !== dasDir) {
        dasDir = dir;
        dasMs = 0;
        arrMs = 0;
        if (tryMove(dir, 0)) resetLock();
      } else {
        dasMs += dt;
        if (dasMs >= DAS_MS) {
          arrMs += dt;
          while (arrMs >= ARR_MS) {
            arrMs -= ARR_MS;
            if (!tryMove(dir, 0)) break;
            resetLock();
          }
        }
      }

      if (input.rotateCW && !prevCW && tryRotate(1)) resetLock();
      if (input.rotateCCW && !prevCCW && tryRotate(-1)) resetLock();

      const hardEdge = input.hard && !prevHard;
      prevLeft = input.left;
      prevRight = input.right;
      prevHard = input.hard;
      prevCW = input.rotateCW;
      prevCCW = input.rotateCCW;

      if (hardEdge) {
        hardDrop();
        return;
      }

      gravAcc += dt;
      const interval = input.soft ? SOFT_MS : gravityInterval(linesCleared);
      let grounded = active ? collides(board, { ...active, y: active.y + 1 }) : false;
      while (gravAcc >= interval && alive && active) {
        gravAcc -= interval;
        if (!tryMove(0, 1)) {
          grounded = true;
          break;
        }
        grounded = collides(board, { ...active, y: active.y + 1 });
        if (!grounded) lockAcc = 0;
      }
      if (!alive || !active) return;
      if (grounded) {
        lockAcc += dt;
        if (lockAcc >= LOCK_MS) lockPiece();
      } else {
        lockAcc = 0;
      }
    },
  };
}
