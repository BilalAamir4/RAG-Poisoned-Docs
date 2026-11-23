import '@testing-library/jest-dom';

if (typeof window !== 'undefined' && !window.IntersectionObserver) {
  class MockIntersectionObserver {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.IntersectionObserver = MockIntersectionObserver;
  if (typeof globalThis !== 'undefined' && !globalThis.IntersectionObserver) {
    globalThis.IntersectionObserver = MockIntersectionObserver;
  }
}


// jsdom has no ResizeObserver (Radix popper / tooltip need one)
if (typeof globalThis !== 'undefined' && !globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
