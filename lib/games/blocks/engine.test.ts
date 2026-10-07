import { describe, expect, it } from 'vitest';
import { garbageForLines } from '@/lib/games/blocks/constants';
import { createBlocksEngine, type BlocksInput } from '@/lib/games/blocks/engine';
import { PIECE_IDS, mulberry32, shuffleBag } from '@/lib/games/blocks/pieces';

const idle = (): BlocksInput => ({
  left: false,
  right: false,
  soft: false,
  hard: false,
  rotateCW: false,
  rotateCCW: false,
});

describe('7-bag and garbage table', () => {
  it('deals each of the seven pieces once per bag', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const bag = shuffleBag(mulberry32(seed));
      expect(bag).toHaveLength(7);
      expect(new Set(bag)).toEqual(new Set(PIECE_IDS));
    }
  });

  it('maps classic line clears to garbage', () => {
    expect(garbageForLines(1)).toBe(0);
    expect(garbageForLines(2)).toBe(1);
    expect(garbageForLines(3)).toBe(2);
    expect(garbageForLines(4)).toBe(4);
    expect(garbageForLines(0)).toBeNull();
    expect(garbageForLines(5)).toBeNull();
  });
});

describe('blocks engine', () => {
  it('clears one line when a horizontal I fills the bottom row', () => {
    const engine = createBlocksEngine({ seed: 1, sequence: ['I', 'O', 'O', 'O', 'O', 'O'] });
    for (let x = 0; x < 10; x++) {
      if (x < 3 || x > 6) engine.board[19]![x] = 'T';
    }
    engine.tick(0, { ...idle(), hard: true });
    const events = engine.drainEvents();
    expect(events).toContainEqual(expect.objectContaining({ type: 'clear', lines: 1 }));
    expect(engine.board[19]!.every((cell) => cell === 0)).toBe(true);
    expect(engine.alive).toBe(true);
  });

  it('clears four lines when a vertical I fills a tetris well', () => {
    const engine = createBlocksEngine({ seed: 2, sequence: ['I', 'O', 'O', 'O', 'O', 'O'] });
    for (let y = 16; y <= 19; y++) {
      for (let x = 0; x < 10; x++) {
        if (x !== 5) engine.board[y]![x] = 'T';
      }
    }
    engine.tick(0, { ...idle(), rotateCW: true, hard: true });
    const cleared = engine.drainEvents().find((event) => event.type === 'clear');
    expect(cleared).toMatchObject({ type: 'clear', lines: 4 });
    expect(engine.linesCleared).toBe(4);
  });

  it('stacks garbage with a single hole after the next lock', () => {
    const engine = createBlocksEngine({ seed: 3, sequence: ['O', 'O', 'O', 'O', 'O', 'O'] });
    engine.addGarbage('garbage01', 2);
    engine.addGarbage('garbage01', 9);
    engine.tick(0, { ...idle(), hard: true });
    const rows = engine.board.filter((row) => row.includes('G'));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.filter((cell) => cell === 0)).toHaveLength(1);
    }
    const applied = engine.drainEvents().find((event) => event.type === 'garbage');
    expect(applied).toMatchObject({ type: 'garbage', ids: ['garbage01'] });
  });

  it('tops out when garbage pushes locked cells off the board', () => {
    const engine = createBlocksEngine({
      seed: 4,
      sequence: Array.from({ length: 30 }, () => 'O' as const),
    });
    for (let i = 0; i < 22; i++) engine.addGarbage(`garbage${String(i).padStart(2, '0')}`, 1);
    engine.tick(0, { ...idle(), hard: true });
    expect(engine.alive).toBe(false);
    expect(engine.drainEvents().some((event) => event.type === 'top-out')).toBe(true);
    engine.tick(50, idle());
    expect(engine.alive).toBe(false);
  });

  it('locks a piece from gravity and answers held movement', () => {
    const engine = createBlocksEngine({ seed: 5, sequence: ['O', 'T', 'T', 'T', 'T', 'T'] });
    engine.tick(0, { ...idle(), rotateCCW: true });
    engine.tick(160, { ...idle(), left: true });
    engine.tick(80, { ...idle(), left: true, soft: true });
    for (let i = 0; i < 200; i++) engine.tick(100, idle());
    expect(engine.board.some((row) => row.includes('O') || row.includes('T'))).toBe(true);
    expect(engine.alive).toBe(true);
  });
});
