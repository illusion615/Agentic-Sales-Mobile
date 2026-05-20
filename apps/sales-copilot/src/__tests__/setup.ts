// Mock localStorage for tests
const store: Record<string, string> = {};

const localStorageMock: Storage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { for (const k in store) delete store[k]; },
  get length() { return Object.keys(store).length; },
  key: (i: number) => Object.keys(store)[i] ?? null,
};

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// Mock window.dispatchEvent
if (typeof window !== 'undefined') {
  const origDispatch = window.dispatchEvent.bind(window);
  window.dispatchEvent = (event: Event) => {
    try { return origDispatch(event); } catch { return true; }
  };
}
