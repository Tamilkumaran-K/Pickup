/**
 * Safe Storage Service
 * Provides fault-tolerant LocalStorage access with an in-memory fallback.
 * Prevents application-wide crashes in incognito mode, strict privacy modes,
 * embedded webviews (Slack, Discord, Twitter), or when storage is restricted.
 */

class MemoryStorageFallback {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

class SafeStorage {
  private mem = new MemoryStorageFallback();
  private isLocalStorageAvailable: boolean;

  constructor() {
    this.isLocalStorageAvailable = this.testAvailability();
  }

  private testAvailability(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      const testKey = '__pickup_storage_test__';
      window.localStorage.setItem(testKey, testKey);
      window.localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  getItem(key: string): string | null {
    if (this.isLocalStorageAvailable) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        // Fall back if access was revoked dynamically
      }
    }
    return this.mem.getItem(key);
  }

  setItem(key: string, value: string): void {
    if (this.isLocalStorageAvailable) {
      try {
        window.localStorage.setItem(key, value);
        return;
      } catch {
        // Fall back if quota exceeded or access blocked
      }
    }
    this.mem.setItem(key, value);
  }

  removeItem(key: string): void {
    if (this.isLocalStorageAvailable) {
      try {
        window.localStorage.removeItem(key);
        return;
      } catch {}
    }
    this.mem.removeItem(key);
  }

  clear(): void {
    if (this.isLocalStorageAvailable) {
      try {
        window.localStorage.clear();
        return;
      } catch {}
    }
    this.mem.clear();
  }
}

export const safeStorage = new SafeStorage();
