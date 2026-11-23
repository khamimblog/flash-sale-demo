import { parseDuration } from './duration';

describe('parseDuration', () => {
  it.each([
    ['500ms', 500],
    ['30s', 30_000],
    ['5m', 300_000],
    ['2h', 7_200_000],
    ['1d', 86_400_000],
    ['-10m', -600_000],
    ['0s', 0],
  ])('parses %s', (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it.each(['', '5', 'm5', '1.5m', '5 minutes'])('rejects "%s"', (input) => {
    expect(() => parseDuration(input)).toThrow(/Invalid duration/);
  });
});
