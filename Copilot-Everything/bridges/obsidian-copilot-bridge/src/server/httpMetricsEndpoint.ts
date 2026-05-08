import type { RuntimeContext } from "./context";

export function buildMetricsSnapshot(runtime: RuntimeContext): Record<string, unknown> {
  return {
    ...runtime.metrics.snapshot(),
    queue: runtime.scheduler.snapshot(),
  };
}
