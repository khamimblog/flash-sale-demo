import { describe, expect, it } from 'vitest';
import { splitDuration } from './format';

describe('splitDuration', () => {
  it('splits milliseconds into days, hours, minutes and seconds', () => {
    const ms = ((1 * 24 + 2) * 3600 + 3 * 60 + 4) * 1000 + 999;
    expect(splitDuration(ms)).toEqual({ days: 1, hours: 2, minutes: 3, seconds: 4 });
  });

  it('treats negative durations as zero', () => {
    expect(splitDuration(-5_000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });
});
