"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ScrapeEvent, ScrapeJobPayload } from "@/lib/scraper-events";

type ScrapeStatus = "idle" | "running" | "completed" | "failed";

type ScrapeContextValue = {
  status: ScrapeStatus;
  message: string | null;
  isRunning: boolean;
  startScrape: () => Promise<void>;
  subscribeToJobs: (listener: (job: ScrapeJobPayload) => void) => () => void;
};

const ScrapeContext = createContext<ScrapeContextValue | null>(null);

export function ScrapeProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ScrapeStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const jobListenersRef = useRef(new Set<(job: ScrapeJobPayload) => void>());
  const jobBufferRef = useRef<ScrapeJobPayload[]>([]);

  const closeEventSource = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

  const handleEvent = useCallback((event: ScrapeEvent) => {
    if (event.type === "progress") {
      setStatus("running");
      setMessage(event.message);
    } else if (event.type === "job") {
      const existingIdx = jobBufferRef.current.findIndex(
        (j) =>
          j.id === event.job.id ||
          (event.job.evalStatus === "complete" && j.url === event.job.url),
      );
      if (existingIdx >= 0) {
        jobBufferRef.current[existingIdx] = event.job;
      } else {
        jobBufferRef.current.push(event.job);
      }
      for (const listener of jobListenersRef.current) {
        listener(event.job);
      }
    } else if (event.type === "done") {
      setStatus("completed");
      setMessage(event.message);
      closeEventSource();
    } else if (event.type === "error") {
      setStatus("failed");
      setMessage(event.message);
      closeEventSource();
    }
  }, [closeEventSource]);

  const connectEvents = useCallback(() => {
    closeEventSource();
    const es = new EventSource("/api/scrape/events");
    eventSourceRef.current = es;

    es.onmessage = (msg) => {
      try {
        handleEvent(JSON.parse(msg.data) as ScrapeEvent);
      } catch {
        // ignore malformed events
      }
    };

    es.onerror = () => {
      closeEventSource();
      void fetch("/api/scrape")
        .then((res) => res.json())
        .then((data: { status: ScrapeStatus }) => {
          if (data.status === "running") {
            connectEvents();
          }
        })
        .catch(() => {});
    };
  }, [closeEventSource, handleEvent]);

  const syncStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/scrape");
      if (!res.ok) return;
      const data = (await res.json()) as {
        status: ScrapeStatus;
        message: string | null;
      };
      setStatus(data.status);
      setMessage(data.message);
      if (data.status === "running") {
        connectEvents();
      }
    } catch {
      // ignore
    }
  }, [connectEvents]);

  useEffect(() => {
    void syncStatus();
    return () => closeEventSource();
  }, [syncStatus, closeEventSource]);

  const startScrape = useCallback(async () => {
    setStatus("running");
    setMessage("Starting scraper...");
    jobBufferRef.current = [];

    const res = await fetch("/api/scrape", { method: "POST" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setStatus("failed");
      setMessage(body.error ?? "Failed to start scraper");
      throw new Error(body.error ?? "Failed to start scraper");
    }

    connectEvents();
  }, [connectEvents]);

  const subscribeToJobs = useCallback((listener: (job: ScrapeJobPayload) => void) => {
    jobListenersRef.current.add(listener);
    for (const job of jobBufferRef.current) {
      listener(job);
    }
    return () => jobListenersRef.current.delete(listener);
  }, []);

  return (
    <ScrapeContext.Provider
      value={{
        status,
        message,
        isRunning: status === "running",
        startScrape,
        subscribeToJobs,
      }}
    >
      {children}
    </ScrapeContext.Provider>
  );
}

export function useScrape() {
  const ctx = useContext(ScrapeContext);
  if (!ctx) throw new Error("useScrape must be used within ScrapeProvider");
  return ctx;
}
