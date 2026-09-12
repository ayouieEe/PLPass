export function createDebouncedQueryInvalidator(
  invalidate: (queryKey: readonly unknown[]) => void,
  delayMs = 250
) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  return {
    schedule(queryKey: readonly unknown[]) {
      const key = JSON.stringify(queryKey);
      if (timers.has(key)) return;

      timers.set(key, setTimeout(() => {
        timers.delete(key);
        invalidate(queryKey);
      }, delayMs));
    },
    clear() {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    }
  };
}
