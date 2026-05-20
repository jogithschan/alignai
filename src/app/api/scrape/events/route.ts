import { getScrapeRunner } from '@/lib/scrape-runner';
import type { ScrapeEvent } from '@/lib/scraper-events';

export const dynamic = 'force-dynamic';

export async function GET() {
  const runner = getScrapeRunner();
  const encoder = new TextEncoder();

  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | undefined;
  let closed = false;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    unsubscribe?.();
  };

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: ScrapeEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          cleanup();
        }
      };

      const closeStream = () => {
        if (closed) return;
        cleanup();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      for (const event of runner.getEventLog()) {
        send(event);
      }

      const snapshot = runner.getSnapshot();
      if (snapshot.status !== 'running') {
        closeStream();
        return;
      }

      unsubscribe = runner.subscribe((event) => {
        send(event);
        if (event.type === 'done' || event.type === 'error') {
          closeStream();
        }
      });

      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        } catch {
          cleanup();
        }
      }, 15000);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
