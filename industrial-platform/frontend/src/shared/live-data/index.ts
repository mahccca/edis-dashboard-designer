import { useEffect, useRef, useState } from "react";
import { API_BASE, http } from "../api/http";
import type { BindingValue } from "../api/types";

export type LiveStatus = "connecting" | "live" | "polling" | "error";

export interface LiveState {
  values: Record<string, BindingValue>;
  status: LiveStatus;
  error: string | null;
}

export type ServerMessage =
  | { type: "values"; publishedVersionId: string; items: BindingValue[] }
  | { type: "subscribed"; topics: string[] }
  | { type: "error"; code: string; message: string }
  | { type: "pong" };

export const initialLiveState: LiveState = { values: {}, status: "connecting", error: null };

export function applyMessage(state: LiveState, msg: ServerMessage): LiveState {
  switch (msg.type) {
    case "values": {
      const values = { ...state.values };
      for (const item of msg.items) values[item.bindingId] = item;
      return { values, status: "live", error: null };
    }
    case "error":
      return { ...state, status: "error", error: `${msg.code}: ${msg.message}` };
    default:
      return state;
  }
}

function wsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}${API_BASE}/runtime/ws`;
}

const POLL_MS = 5000;
const BACKOFF_MS = [1000, 2000, 5000, 10000];

/** Live values for a published page: WebSocket first, HTTP polling while the socket is down. */
export function useLiveValues(slug: string, publishedVersionId: string | null, topics: string[]): LiveState {
  const [state, setState] = useState<LiveState>(initialLiveState);
  const topicKey = topics.join(",");
  const attempt = useRef(0);

  useEffect(() => {
    if (!publishedVersionId || topics.length === 0) return;
    let closed = false;
    let socket: WebSocket | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const { data } = await http.get<{ items: BindingValue[] }>(`/runtime/sites/${encodeURIComponent(slug)}/values`,
                                                                  { query: { publishedVersionId } });
        if (!closed) setState((s) => ({ ...applyMessage(s, { type: "values", publishedVersionId, items: data.items }), status: socket?.readyState === WebSocket.OPEN ? "live" : "polling" }));
      } catch {
        /* keep last values; quality/staleness is rendered per value */
      }
    };
    const startPolling = () => {
      if (!pollTimer) pollTimer = setInterval(poll, POLL_MS);
    };
    const stopPolling = () => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    };
    const connect = () => {
      socket = new WebSocket(wsUrl());
      socket.onopen = () => {
        attempt.current = 0;
        stopPolling();
        socket?.send(JSON.stringify({ type: "subscribe", publishedVersionId, topics }));
      };
      socket.onmessage = (event) => {
        const msg = JSON.parse(String(event.data)) as ServerMessage;
        setState((s) => applyMessage(s, msg));
      };
      socket.onclose = () => {
        if (closed) return;
        setState((s) => ({ ...s, status: "polling" }));
        startPolling();
        const delay = BACKOFF_MS[Math.min(attempt.current++, BACKOFF_MS.length - 1)];
        retryTimer = setTimeout(connect, delay);
      };
    };

    void poll();
    connect();
    return () => {
      closed = true;
      stopPolling();
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
    };
  }, [slug, publishedVersionId, topicKey]);

  return state;
}
