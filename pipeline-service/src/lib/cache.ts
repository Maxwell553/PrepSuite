/** Byte-bounded TTL cache with in-flight coalescing. No failed results are retained. */
export class AsyncCache<T> {
  private entries = new Map<
    string,
    { value: T; expires: number; bytes: number }
  >();
  private pending = new Map<string, Promise<T>>();
  private bytes = 0;
  constructor(
    private maxBytes = 24 * 1024 * 1024,
    private ttlMs = 300000,
  ) {}
  async get(key: string, load: () => Promise<T>): Promise<T> {
    const old = this.entries.get(key);
    if (old && old.expires > Date.now()) return structuredClone(old.value);
    if (old) {
      this.bytes -= old.bytes;
      this.entries.delete(key);
    }
    const inflight = this.pending.get(key);
    if (inflight) return structuredClone(await inflight);
    const task = load()
      .then((value) => {
        const bytes = Buffer.byteLength(JSON.stringify(value));
        if (bytes <= this.maxBytes) {
          while (this.bytes + bytes > this.maxBytes && this.entries.size) {
            const first = this.entries.entries().next().value!;
            this.bytes -= first[1].bytes;
            this.entries.delete(first[0]);
          }
          this.entries.set(key, {
            value: structuredClone(value),
            expires: Date.now() + this.ttlMs,
            bytes,
          });
          this.bytes += bytes;
        }
        return value;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, task);
    return structuredClone(await task);
  }
}
