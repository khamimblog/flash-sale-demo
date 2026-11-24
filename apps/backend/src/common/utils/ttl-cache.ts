export class TtlCache<V> {
  private readonly entries = new Map<string, { value: Promise<V>; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string, load: () => Promise<V>): Promise<V> {
    const entry = this.entries.get(key);
    if (entry && entry.expiresAt > this.now()) return entry.value;

    const value = load();
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    value.catch(() => this.entries.delete(key));
    return value;
  }
}
