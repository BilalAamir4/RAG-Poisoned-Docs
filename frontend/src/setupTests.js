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

