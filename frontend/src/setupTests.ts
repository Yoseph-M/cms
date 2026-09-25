import '@testing-library/jest-dom';

const store = new Map<string, string>();

const localStorageMock: Storage = {
  get length() {
    return store.size;
  },
  clear: () => store.clear(),
  getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
  key: (index: number) => Array.from(store.keys())[index] ?? null,
  removeItem: (key: string) => {
    store.delete(key);
  },
  setItem: (key: string, value: string) => {
    store.set(key, String(value));
  },
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Recharts measures its container through ResizeObserver, which jsdom does not
// implement. Page-level suites (the dashboards) render real charts, so provide a
// no-op observer instead of forcing every one of them to stub it.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(globalThis, 'ResizeObserver', {
  value: ResizeObserverStub,
  writable: true,
  configurable: true,
});

// Some suites render translated UI without mocking react-i18next, so make sure
// the real catalogue is initialised (English) for every test run.
import './i18n';
