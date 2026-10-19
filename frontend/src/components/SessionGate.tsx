import { useEffect, useState, type ReactNode } from "react";

import { restoreSession } from "../api/client";
import { useAppSelector } from "../store/hooks";

export function SessionGate({ children }: { children: ReactNode }) {
  const accessToken = useAppSelector((state) => state.auth.accessToken);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (accessToken) {
      setReady(true);
      return;
    }
    let cancelled = false;
    restoreSession().finally(() => {
      if (!cancelled) {
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (!ready) {
    return <p className="px-4 py-10 text-sm text-stone-600">Loading…</p>;
  }
  return children;
}
