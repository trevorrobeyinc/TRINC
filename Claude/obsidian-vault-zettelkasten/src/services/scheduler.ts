import type { App } from "obsidian";
import type { VaultZKSettings } from "../constants";
import type { ZettelkastenService } from "./zettelkasten-service";
import type { EventBus } from "./event-bus";

/**
 * Replaces 3 PM2 cron jobs with in-process setInterval + time-of-day checks.
 *
 * Schedules:
 *   - Daily 2:00 AM:  orphan scan (orphanRescue batchMode)
 *   - Weekly Sun 9 AM: health digest (vaultHealth → write report)
 *   - Weekly Wed 9 AM: serendipity on random recent note
 */
export class Scheduler {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private lastOrphanRun = "";
  private lastHealthRun = "";
  private lastSerendipityRun = "";

  constructor(
    private readonly app: App,
    private readonly service: ZettelkastenService,
    private readonly eventBus: EventBus,
    private readonly getSettings: () => VaultZKSettings
  ) {}

  start(): void {
    if (this.intervalId) return;
    // Check every 15 minutes
    this.intervalId = setInterval(() => this.tick(), 15 * 60 * 1000);
    // Initial check after 60s (let plugin settle)
    setTimeout(() => this.tick(), 60_000);
    console.log("[VaultZK] Scheduler started");
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log("[VaultZK] Scheduler stopped");
  }

  private async tick(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      await this.tickInner();
    } finally {
      this.isRunning = false;
    }
  }

  private async tickInner(): Promise<void> {
    const now = new Date();
    const dateKey = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const hour = now.getHours();
    const day = now.getDay(); // 0=Sun

    const settings = this.getSettings();

    // Daily 2 AM: orphan scan
    if (settings.enableOrphanScan && hour >= 2 && hour < 3 && this.lastOrphanRun !== dateKey) {
      this.lastOrphanRun = dateKey;
      this.runOrphanScan(settings).catch((e) =>
        console.error("[VaultZK] Scheduled orphan scan failed:", e)
      );
    }

    // Sunday 9 AM: health digest
    if (settings.enableHealthDigest && day === 0 && hour >= 9 && hour < 10 && this.lastHealthRun !== dateKey) {
      this.lastHealthRun = dateKey;
      this.runHealthDigest(settings).catch((e) =>
        console.error("[VaultZK] Scheduled health digest failed:", e)
      );
    }

    // Wednesday 9 AM: serendipity digest
    if (settings.enableSerendipityDigest && day === 3 && hour >= 9 && hour < 10 && this.lastSerendipityRun !== dateKey) {
      this.lastSerendipityRun = dateKey;
      this.runSerendipityDigest().catch((e) =>
        console.error("[VaultZK] Scheduled serendipity digest failed:", e)
      );
    }
  }

  private async runOrphanScan(settings: VaultZKSettings): Promise<void> {
    console.log("[VaultZK] Running scheduled orphan scan...");
    const result = await this.service.orphanRescue({
      options: { batchMode: true, limit: 10, writeReport: false },
    });

    if (settings.reportsFolder) {
      await this.writeReport(
        settings.reportsFolder,
        `Orphan Scan ${new Date().toISOString().slice(0, 10)}`,
        result.content
      );
    }

    this.eventBus.emit("analysis:complete", {
      command: "orphan-rescue",
      notePath: null,
      durationMs: result.metadata.durationMs,
    });
  }

  private async runHealthDigest(settings: VaultZKSettings): Promise<void> {
    console.log("[VaultZK] Running scheduled health digest...");
    const result = await this.service.vaultHealth({
      options: { limit: 10, batchMode: false, writeReport: false },
    });

    if (settings.reportsFolder) {
      await this.writeReport(
        settings.reportsFolder,
        `Health Report ${new Date().toISOString().slice(0, 10)}`,
        result.content
      );
    }

    this.eventBus.emit("health:updated", result.healthScore);
  }

  private async runSerendipityDigest(): Promise<void> {
    console.log("[VaultZK] Running scheduled serendipity digest...");
    // Pick a random recent file
    const files = this.app.vault.getMarkdownFiles();
    if (files.length === 0) return;

    // Sort by mtime descending, pick from top 20
    const recent = files
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
      .slice(0, 20);
    const pick = recent[Math.floor(Math.random() * recent.length)];

    const result = await this.service.serendipity({
      notePath: pick.path,
      options: { limit: 10, batchMode: false, writeReport: false },
    });

    this.eventBus.emit("analysis:complete", {
      command: "serendipity",
      notePath: pick.path,
      durationMs: result.metadata.durationMs,
    });
  }

  private async writeReport(folder: string, title: string, content: string): Promise<void> {
    const path = `${folder}/${title}.md`;

    // Ensure folder exists
    if (!(await this.app.vault.adapter.exists(folder))) {
      await this.app.vault.createFolder(folder);
    }

    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing && "extension" in existing) {
      await this.app.vault.modify(existing as any, content);
    } else {
      await this.app.vault.create(path, content);
    }

    console.log(`[VaultZK] Report written: ${path}`);
  }
}
