import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  delayForFailedCount,
  INITIAL_THROTTLE_STATE,
  recordFailure,
  remainingDelaySeconds,
} from './throttle';
import { ThrottleStore } from './throttle-store';

describe('throttle policy', () => {
  it('gives four free attempts, then exponential delays capped at 300s', () => {
    expect([1, 2, 3, 4].map(delayForFailedCount)).toEqual([0, 0, 0, 0]);
    expect([5, 6, 7, 8, 9, 10].map(delayForFailedCount)).toEqual([15, 30, 60, 120, 240, 300]);
    expect(delayForFailedCount(50)).toBe(300);
  });

  it('computes remaining delay from the last failure time', () => {
    const failedAt = new Date('2026-07-22T10:00:00.000Z');
    let state = INITIAL_THROTTLE_STATE;
    for (let i = 0; i < 5; i += 1) state = recordFailure(state, failedAt);
    expect(remainingDelaySeconds(state, new Date('2026-07-22T10:00:05.000Z'))).toBe(10);
    expect(remainingDelaySeconds(state, new Date('2026-07-22T10:00:15.000Z'))).toBe(0);
  });

  it('has no delay in the initial state', () => {
    expect(remainingDelaySeconds(INITIAL_THROTTLE_STATE, new Date())).toBe(0);
  });
});

describe('ThrottleStore', () => {
  it('round-trips state and degrades corrupt files to the initial state', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ajn-throttle-'));
    const store = new ThrottleStore(path.join(dir, 'throttle.json'));
    expect(store.load()).toEqual(INITIAL_THROTTLE_STATE);

    const state = { failedCount: 3, lastFailedAtIso: '2026-07-22T10:00:00.000Z' };
    store.save(state);
    expect(store.load()).toEqual(state);
    expect(readFileSync(path.join(dir, 'throttle.json'), 'utf8')).not.toContain('passphrase');

    writeFileSync(path.join(dir, 'throttle.json'), '{corrupt');
    expect(store.load()).toEqual(INITIAL_THROTTLE_STATE);
  });
});
