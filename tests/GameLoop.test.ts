import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { GameLoop } from '../src/game/GameLoop';

describe('GameLoop', () => {
  let nextId: number;
  let frames: Map<number, FrameRequestCallback>;
  let update: Mock<(dt: number) => void>;
  let render: Mock<() => void>;
  let loop: GameLoop;

  function frame(now: number): void {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(now));
  }

  beforeEach(() => {
    nextId = 0;
    frames = new Map();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++nextId, callback);
      return nextId;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    update = vi.fn<(dt: number) => void>();
    render = vi.fn<() => void>();
    loop = new GameLoop(update, render);
  });

  afterEach(() => {
    loop.stop();
    vi.unstubAllGlobals();
  });

  it('startを繰り返しても描画ループは1本だけ', () => {
    loop.start();
    loop.start();
    expect(frames.size).toBe(1);
    frame(1000);
    expect(render).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
    expect(frames.size).toBe(1);
  });

  it('描画間隔が異なっても1/60秒単位で更新し、端数を次へ持ち越す', () => {
    loop.start();
    frame(0);
    frame(10);
    expect(update).not.toHaveBeenCalled();
    frame(20);
    expect(update).toHaveBeenCalledTimes(1);
    frame(51);
    expect(update).toHaveBeenCalledTimes(3);
    expect(update).toHaveBeenLastCalledWith(1 / 60);
    expect(render).toHaveBeenCalledTimes(4);
  });

  it('長時間フレームが途絶えても更新は最大0.1秒分に制限する', () => {
    loop.start();
    frame(0);
    frame(60_000);
    expect(update).toHaveBeenCalledTimes(6);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('停止後は予約を解除し、再開時に前回の時刻や端数を引き継がない', () => {
    loop.start();
    frame(0);
    frame(10);
    loop.stop();
    loop.stop();
    expect(frames.size).toBe(0);
    loop.start();
    frame(60_000);
    frame(60_010);
    expect(update).not.toHaveBeenCalled();
    frame(60_020);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('更新中に停止しても描画や次フレームを予約しない', () => {
    update.mockImplementation(() => loop.stop());
    loop.start();
    frame(0);
    frame(100);
    expect(update).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
  });
});
