import { useEffect, useState } from 'react';

/** Текущее время, обновляемое раз в interval мс: для подписей «идёт 5 мин». */
export function useNow(interval = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}
