import { EventEmitter } from 'events';
import { prisma } from './prisma';
import { runScraper } from './scraper';
import type { ScrapeEvent } from './scraper-events';

const MAX_EVENT_LOG = 200;

type ScrapeStatus = 'idle' | 'running' | 'completed' | 'failed';

type RunnerSnapshot = {
  runId: string | null;
  status: ScrapeStatus;
  message: string | null;
};

class ScrapeRunner {
  private runId: string | null = null;
  private status: ScrapeStatus = 'idle';
  private message: string | null = null;
  private eventLog: ScrapeEvent[] = [];
  private emitter = new EventEmitter();

  getSnapshot(): RunnerSnapshot {
    return { runId: this.runId, status: this.status, message: this.message };
  }

  getEventLog(): ScrapeEvent[] {
    return [...this.eventLog];
  }

  subscribe(listener: (event: ScrapeEvent) => void): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }

  private push(event: ScrapeEvent) {
    this.eventLog.push(event);
    if (this.eventLog.length > MAX_EVENT_LOG) {
      this.eventLog = this.eventLog.slice(-MAX_EVENT_LOG);
    }
    if (event.type === 'progress') this.message = event.message;
    if (event.type === 'done') {
      this.message = event.message;
      this.status = 'completed';
    }
    if (event.type === 'error') {
      this.message = event.message;
      this.status = 'failed';
    }
    this.emitter.emit('event', event);
  }

  async start(): Promise<{ runId: string } | { error: string; runId?: string }> {
    if (this.status === 'running') {
      return { error: 'A scrape is already running', runId: this.runId ?? undefined };
    }

    const runId = crypto.randomUUID();
    this.runId = runId;
    this.status = 'running';
    this.message = 'Starting scraper...';
    this.eventLog = [];

    await prisma.scrapeRun.create({
      data: { id: runId, status: 'running', progressMessage: this.message },
    });

    this.push({ type: 'progress', message: this.message });

    void this.execute(runId);

    return { runId };
  }

  private async execute(runId: string) {
    try {
      const result = await runScraper(
        {
          onProgress: async (message) => {
            this.push({ type: 'progress', message });
            await prisma.scrapeRun
              .update({ where: { id: runId }, data: { progressMessage: message } })
              .catch(() => {});
          },
          onJob: (job) => {
            this.push({ type: 'job', job });
          },
        },
        runId,
      );

      this.push({ type: 'done', message: result.message });
      await prisma.scrapeRun
        .update({
          where: { id: runId },
          data: {
            status: 'completed',
            resultMessage: result.message,
            progressMessage: result.message,
            finishedAt: new Date(),
          },
        })
        .catch(() => {});
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unknown error occurred';
      this.push({ type: 'error', message });
      await prisma.scrapeRun
        .update({
          where: { id: runId },
          data: {
            status: 'failed',
            errorMessage: message,
            progressMessage: message,
            finishedAt: new Date(),
          },
        })
        .catch(() => {});
    }
  }

  /** Sync in-memory state from DB on server restart / cold start. */
  async hydrateFromDb() {
    const active = await prisma.scrapeRun.findFirst({
      where: { status: 'running' },
      orderBy: { startedAt: 'desc' },
    });
    if (active) {
      this.runId = active.id;
      this.status = 'running';
      this.message = active.progressMessage ?? 'Scraping in progress...';
    }
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __scrapeRunner: ScrapeRunner | undefined;
}

export function getScrapeRunner(): ScrapeRunner {
  if (!globalThis.__scrapeRunner) {
    globalThis.__scrapeRunner = new ScrapeRunner();
  }
  return globalThis.__scrapeRunner;
}
