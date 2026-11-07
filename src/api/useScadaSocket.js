import { useEffect, useRef, useState } from 'react';
import { toWebSocketUrl } from './config';

const MAX_FRAMES = 10;

function rememberSignal(batch, path, value) {
  if (!path) return;
  const previous = batch[path] || {};
  const next = typeof value === 'object' && value !== null ? { ...previous, ...value, path } : { ...previous, path, value };
  batch[path] = next;
}

export function useScadaSocket({ baseUrl, token, patterns, enabled }) {
  const [status, setStatus] = useState(enabled ? 'connecting' : 'idle');
  const [signals, setSignals] = useState({});
  const [frames, setFrames] = useState([]);
  const [frameCount, setFrameCount] = useState(0);
  const [lastFrameAt, setLastFrameAt] = useState(null);
  const [changed, setChanged] = useState(() => new Set());
  const patternKey = patterns.filter(Boolean).join('\n');
  const url = toWebSocketUrl(baseUrl, token);

  const pendingRef = useRef({});
  const framesRef = useRef([]);
  const countRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      return undefined;
    }

    let stopped = false;
    let socket;
    let retry;

    const flush = () => {
      rafRef.current = 0;
      const batch = pendingRef.current;
      pendingRef.current = {};
      const paths = Object.keys(batch);
      if (paths.length > 0) {
        setSignals((current) => ({ ...current, ...batch }));
        setChanged(new Set(paths));
        setLastFrameAt(new Date());
      }
      setFrameCount(countRef.current);
      setFrames(framesRef.current);
    };

    const schedule = () => {
      if (!rafRef.current) rafRef.current = requestAnimationFrame(flush);
    };

    const queue = (path, value) => {
      rememberSignal(pendingRef.current, path, value);
      schedule();
    };

    const pushFrame = (message) => {
      countRef.current += 1;
      framesRef.current = [{
        id: `${Date.now()}-${countRef.current}`,
        time: new Date().toLocaleTimeString(),
        type: message?.type || 'message',
      }, ...framesRef.current].slice(0, MAX_FRAMES);
      schedule();
    };

    const connect = () => {
      if (stopped) return;
      setStatus('connecting');
      socket = new WebSocket(url);

      socket.onopen = () => {
        if (stopped) return;
        setStatus('open');
        const signalsToWatch = patternKey.split('\n').filter(Boolean);
        socket.send(JSON.stringify({
          type: 'subscribe',
          subscriptionId: 'plant-live',
          signals: signalsToWatch,
          immediate: true,
        }));
      };

      socket.onmessage = (event) => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          pushFrame({ type: 'text' });
          return;
        }
        pushFrame(message);

        if (message.type === 'subscription.snapshot' && message.data && typeof message.data === 'object') {
          for (const [path, value] of Object.entries(message.data)) queue(path, value);
          return;
        }

        if (message.path) queue(message.path, message);
      };

      socket.onerror = () => {
        if (!stopped) setStatus('error');
      };

      socket.onclose = () => {
        if (stopped) return;
        setStatus('closed');
        retry = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      stopped = true;
      clearTimeout(retry);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
    };
  }, [enabled, url, patternKey]);

  useEffect(() => {
    if (changed.size === 0) return undefined;
    const timer = setTimeout(() => setChanged(new Set()), 700);
    return () => clearTimeout(timer);
  }, [changed]);

  return { status, signals, frames, frameCount, lastFrameAt, changed, url };
}
