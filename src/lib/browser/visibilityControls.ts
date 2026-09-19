const leaseTtlMs = 15_000;

export function isPageVisible() {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

export function onPageVisibilityChange(listener: (visible: boolean) => void) {
  if (typeof document === "undefined") return () => undefined;
  const handleChange = () => listener(isPageVisible());
  document.addEventListener("visibilitychange", handleChange);
  return () => document.removeEventListener("visibilitychange", handleChange);
}

export function createVisibleInterval(callback: () => void, intervalMs: number) {
  let timer: number | undefined;
  const clear = () => {
    if (timer !== undefined) window.clearInterval(timer);
    timer = undefined;
  };
  const start = () => {
    clear();
    if (!isPageVisible()) return;
    timer = window.setInterval(() => {
      if (isPageVisible()) callback();
    }, intervalMs);
  };
  const removeVisibility = onPageVisibilityChange((visible) => {
    if (visible) {
      callback();
      start();
    } else {
      clear();
    }
  });
  start();
  return () => {
    clear();
    removeVisibility();
  };
}

type LeaseRecord = { owner: string; expiresAt: number };

export function createVisibleTabLease(name: string, onLeadershipChange: (leader: boolean) => void) {
  const key = `plpass:visible-lease:${name}`;
  const owner = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(key) : null;
  let leader = false;
  let confirmTimer: number | undefined;

  const read = (): LeaseRecord | null => {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) as LeaseRecord : null;
    } catch {
      return null;
    }
  };
  const write = (record: LeaseRecord | null) => {
    try {
      if (record) localStorage.setItem(key, JSON.stringify(record));
      else localStorage.removeItem(key);
    } catch {
      // A tab without storage access still runs safely as a non-leader.
    }
    try {
      channel?.postMessage({ type: "lease-change" });
    } catch {
      // A disposed tab may receive a final lease cleanup after the channel closes.
    }
  };
  const setLeader = (value: boolean) => {
    if (leader === value) return;
    leader = value;
    onLeadershipChange(value);
  };
  const claim = () => {
    if (!isPageVisible()) {
      setLeader(false);
      return;
    }
    const current = read();
    if (!current || current.expiresAt <= Date.now() || current.owner === owner) {
      write({ owner, expiresAt: Date.now() + leaseTtlMs });
      if (confirmTimer !== undefined) window.clearTimeout(confirmTimer);
      // localStorage has no compare-and-set. Confirm ownership on the next task
      // before enabling the side-effecting leader callback so simultaneous tabs
      // cannot both auto-cancel an event during the initial claim race.
      confirmTimer = window.setTimeout(() => {
        const confirmed = read();
        setLeader(Boolean(confirmed && confirmed.owner === owner && confirmed.expiresAt > Date.now()));
      }, 25);
    } else {
      setLeader(false);
    }
  };
  const release = () => {
    if (confirmTimer !== undefined) window.clearTimeout(confirmTimer);
    confirmTimer = undefined;
    if (read()?.owner === owner) write(null);
    setLeader(false);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === key) claim();
  };
  const onChannel = () => claim();
  const removeVisibility = onPageVisibilityChange((visible) => visible ? claim() : release());
  window.addEventListener("storage", onStorage);
  channel?.addEventListener("message", onChannel);
  claim();
  const renewTimer = window.setInterval(() => {
    if (leader) write({ owner, expiresAt: Date.now() + leaseTtlMs });
    else claim();
  }, Math.floor(leaseTtlMs / 3));

  return {
    isLeader: () => leader,
    dispose: () => {
      if (renewTimer !== undefined) window.clearInterval(renewTimer);
      if (confirmTimer !== undefined) window.clearTimeout(confirmTimer);
      removeVisibility();
      window.removeEventListener("storage", onStorage);
      channel?.removeEventListener("message", onChannel);
      channel?.close();
      release();
    }
  };
}
