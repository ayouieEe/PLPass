export function createTwoPartyBarrier(timeoutMs: number) {
  let waiters: Array<(paired: boolean) => void> = [];
  let timeout: ReturnType<typeof setTimeout> | undefined;

  return () => new Promise<boolean>((resolve) => {
    waiters.push(resolve);
    if (waiters.length === 2) {
      if (timeout) clearTimeout(timeout);
      const paired = waiters;
      waiters = [];
      timeout = undefined;
      paired.forEach((waiter) => waiter(true));
      return;
    }
    if (waiters.length === 1) {
      timeout = setTimeout(() => {
        const timedOut = waiters;
        waiters = [];
        timeout = undefined;
        timedOut.forEach((waiter) => waiter(false));
      }, timeoutMs);
    }
  });
}
