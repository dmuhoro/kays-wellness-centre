const DB_NAME = "kwc-offline-store";
const DB_VERSION = 1;

export interface CachedAppointment {
  id: number;
  name: string;
  phone: string;
  service: string;
  appointment_timestamp: string;
  provider_id: number | null;
  room_id: number | null;
  organization_id: string;
}

export interface PendingCheckin {
  id: string;
  leadId: number;
  organizationId: string;
  timestamp: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("appointments")) {
        db.createObjectStore("appointments", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("checkins")) {
        const store = db.createObjectStore("checkins", { keyPath: "id" });
        store.createIndex("organizationId", "organizationId", { unique: false });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function cacheAppointments(
  orgId: string,
  appointments: CachedAppointment[],
): Promise<void> {
  const db = await openDB();
  const tx = db.transaction("appointments", "readwrite");
  const store = tx.objectStore("appointments");

  const existing = await new Promise<CachedAppointment[]>((resolve) => {
    const all: CachedAppointment[] = [];
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve([]);
  });

  for (const appt of appointments) {
    if (appt.organization_id === orgId) {
      store.put(appt);
    }
  }

  const stale = existing.filter(
    (e) =>
      e.organization_id === orgId &&
      !appointments.find((a) => a.id === e.id),
  );
  for (const s of stale) {
    store.delete(s.id);
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedAppointments(
  orgId: string,
): Promise<CachedAppointment[]> {
  const db = await openDB();
  const tx = db.transaction("appointments", "readonly");
  const store = tx.objectStore("appointments");
  return new Promise((resolve) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const all = req.result as CachedAppointment[];
      resolve(all.filter((a) => a.organization_id === orgId));
    };
    req.onerror = () => resolve([]);
  });
}

export async function queueCheckin(
  leadId: number,
  organizationId: string,
): Promise<string> {
  const db = await openDB();
  const id = `${organizationId}:${leadId}:${Date.now()}`;
  const tx = db.transaction("checkins", "readwrite");
  const store = tx.objectStore("checkins");
  store.add({ id, leadId, organizationId, timestamp: new Date().toISOString() });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingCheckins(): Promise<PendingCheckin[]> {
  const db = await openDB();
  const tx = db.transaction("checkins", "readonly");
  const store = tx.objectStore("checkins");
  return new Promise((resolve) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as PendingCheckin[]);
    req.onerror = () => resolve([]);
  });
}

export async function removePendingCheckin(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction("checkins", "readwrite");
  const store = tx.objectStore("checkins");
  store.delete(id);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function syncPendingCheckins(
  updateFn: (leadId: number, orgId: string) => Promise<boolean>,
): Promise<{ synced: number; failed: number }> {
  const pending = await getPendingCheckins();
  let synced = 0;
  let failed = 0;

  for (const item of pending) {
    try {
      const ok = await updateFn(item.leadId, item.organizationId);
      if (ok) {
        await removePendingCheckin(item.id);
        synced++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { synced, failed };
}
