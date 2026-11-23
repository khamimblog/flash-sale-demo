import { useEffect, useState } from 'react';

/** Current server time (ms), ticking every second, corrected for local clock skew. */
export function useServerNow(clockOffsetMs: number, intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now() + clockOffsetMs);

  useEffect(() => {
    const tick = () => setNow(Date.now() + clockOffsetMs);
    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [clockOffsetMs, intervalMs]);

  return now;
}
