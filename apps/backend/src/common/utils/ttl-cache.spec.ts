import { TtlCache } from './ttl-cache';

describe('TtlCache', () => {
  let now: number;
  let cache: TtlCache<string>;

  beforeEach(() => {
    now = 0;
    cache = new TtlCache<string>(1_000, () => now);
  });

  it('serves cached values until they expire', async () => {
    const load = jest.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');

    expect(await cache.get('k', load)).toBe('first');
    now = 999;
    expect(await cache.get('k', load)).toBe('first');
    now = 1_000;
    expect(await cache.get('k', load)).toBe('second');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('shares one load between concurrent misses', async () => {
    const load = jest.fn().mockResolvedValue('value');

    await Promise.all([cache.get('k', load), cache.get('k', load), cache.get('k', load)]);

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not cache failures', async () => {
    const load = jest.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValue('ok');

    await expect(cache.get('k', load)).rejects.toThrow('db down');
    expect(await cache.get('k', load)).toBe('ok');
  });
});
