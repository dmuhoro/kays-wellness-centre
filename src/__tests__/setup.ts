import { vi } from "vitest";

const localStorageStore = new Map<string, string>();

const mockLocalStorage = {
  getItem: (key: string): string | null => localStorageStore.get(key) ?? null,
  setItem: (key: string, value: string): void => {
    localStorageStore.set(key, value);
  },
  removeItem: (key: string): void => {
    localStorageStore.delete(key);
  },
  clear: (): void => {
    localStorageStore.clear();
  },
  get length(): number {
    return localStorageStore.size;
  },
  key: (index: number): string | null => {
    return [...localStorageStore.keys()][index] ?? null;
  },
};

vi.stubGlobal("localStorage", mockLocalStorage);

if (typeof navigator === "undefined") {
  vi.stubGlobal("navigator", { onLine: true });
}
