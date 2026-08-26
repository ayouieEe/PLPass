import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";
import { beforeEach, vi } from "vitest";

configure({ asyncUtilTimeout: 5000 });

vi.stubEnv("VITE_DATA_SOURCE", "mock");

beforeEach(() => {
  vi.stubEnv("VITE_DATA_SOURCE", "mock");
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false
  })
});

class ResizeObserverMock {
  constructor(private readonly callback: ResizeObserverCallback) {}

  observe(target: Element) {
    const rect = {
      x: 0,
      y: 0,
      width: 800,
      height: 400,
      top: 0,
      right: 800,
      bottom: 400,
      left: 0,
      toJSON: () => ({})
    } as DOMRectReadOnly;
    this.callback([{ target, contentRect: rect } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }

  unobserve() {
    return undefined;
  }

  disconnect() {
    return undefined;
  }
}

Object.defineProperty(window, "ResizeObserver", {
  writable: true,
  value: ResizeObserverMock
});
