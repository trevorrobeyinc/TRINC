import type { BackendId, Operation } from "../types";

interface LatencyWindow {
  values: number[];
  max: number;
}

interface CounterMap {
  [key: string]: number;
}

export class Metrics {
  private readonly counters: CounterMap = {};
  private readonly latencies: Record<string, LatencyWindow> = {};
  private readonly failures1m: Array<{ ts: number; key: string }> = [];
  private readonly failures5m: Array<{ ts: number; key: string }> = [];

  increment(name: string, labels: Record<string, string> = {}): void {
    const key = this.key(name, labels);
    this.counters[key] = (this.counters[key] ?? 0) + 1;
  }

  observeLatency(name: string, durationMs: number, labels: Record<string, string> = {}): void {
    const key = this.key(name, labels);
    const window = this.latencies[key] ?? { values: [], max: 500 };
    window.values.push(durationMs);
    if (window.values.length > window.max) {
      window.values.shift();
    }
    this.latencies[key] = window;
  }

  recordFailure(backend: BackendId, op: Operation, code: string): void {
    const now = Date.now();
    const key = `${backend}:${op}:${code}`;
    this.failures1m.push({ ts: now, key });
    this.failures5m.push({ ts: now, key });
    this.pruneFailures(now);
    this.increment("failures_total", { backend, op, code });
  }

  latencyPercentilesByOperation(): Record<string, { p50: number; p95: number; p99: number }> {
    const result: Record<string, { p50: number; p95: number; p99: number }> = {};
    for (const [key, window] of Object.entries(this.latencies)) {
      const copy = [...window.values].sort((a, b) => a - b);
      if (copy.length > 0) {
        const p50 = copy[Math.floor(0.5 * (copy.length - 1))];
        const p95 = copy[Math.floor(0.95 * (copy.length - 1))];
        const p99 = copy[Math.floor(0.99 * (copy.length - 1))];
        result[key] = { p50, p95, p99 };
      }
    }
    return result;
  }

  failureRateMinutes(minutes: 1 | 5): number {
    const now = Date.now();
    this.pruneFailures(now);
    const bucket = minutes === 1 ? this.failures1m : this.failures5m;
    const totalRequests = Object.entries(this.counters)
      .filter(([k]) => k.startsWith("requests_total"))
      .reduce((acc, [, v]) => acc + v, 0);
    if (totalRequests === 0) {
      return 0;
    }
    return bucket.length / totalRequests;
  }

  snapshot(): Record<string, unknown> {
    return {
      counters: { ...this.counters },
      latencyByOp: this.latencyPercentilesByOperation(),
      errorRate1m: this.failureRateMinutes(1),
      errorRate5m: this.failureRateMinutes(5),
    };
  }

  private key(name: string, labels: Record<string, string>): string {
    const suffix = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
    return suffix ? `${name}{${suffix}}` : name;
  }

  private pruneFailures(now: number): void {
    while (this.failures1m.length > 0 && now - this.failures1m[0].ts > 60_000) {
      this.failures1m.shift();
    }
    while (this.failures5m.length > 0 && now - this.failures5m[0].ts > 300_000) {
      this.failures5m.shift();
    }
  }
}
