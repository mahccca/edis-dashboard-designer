import { useEffect, useRef, useState } from 'react';

export function usePolled(loader, deps, intervalMs, enabled = true) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [updatedAt, setUpdatedAt] = useState(null);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return undefined;
    }

    let stopped = false;
    async function run() {
      try {
        const value = await loaderRef.current();
        if (stopped) return;
        setData(value);
        setError(null);
        setUpdatedAt(new Date());
      } catch (err) {
        if (!stopped) setError(err.message || 'Request failed');
      } finally {
        if (!stopped) setLoading(false);
      }
    }

    setLoading(true);
    run();
    const timer = setInterval(run, intervalMs);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
    // loader identity is held in a ref; deps are the caller's inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, intervalMs]);

  return { data, error, loading, updatedAt };
}
