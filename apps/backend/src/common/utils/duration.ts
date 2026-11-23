const UNIT_MS = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

/** Parses human durations like "30s", "5m", "2h", "-10m" into milliseconds. */
export function parseDuration(input: string): number {
  const match = /^(-?\d+)(ms|s|m|h|d)$/.exec(input.trim());
  if (!match) {
    throw new Error(`Invalid duration "${input}". Use e.g. 500ms, 30s, 5m, 2h, 1d.`);
  }
  const [, amount, unit] = match;
  return Number(amount) * UNIT_MS[unit as keyof typeof UNIT_MS];
}
