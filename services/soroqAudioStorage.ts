/**
 * Persists interrogation (soroq) recordings in IndexedDB by case number (ijro ishi raqami).
 * List view: table of recordings with play and "Bayonnoma shakillantirish" per row.
 */

const DB_NAME = "TERGOV_SOROQ_AUDIO_DB";
const DB_VERSION = 2;
const STORE_NAME = "recordings";

export interface SavedSoroqAudioItem {
  id: string;
  caseNumber: string;
  recordedAt: number;
  durationSeconds: number;
  mimeType: string;
}

export interface SavedSoroqAudio extends SavedSoroqAudioItem {
  blob: Blob;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("recordedAt", "recordedAt", { unique: false });
        store.createIndex("caseNumber", "caseNumber", { unique: false });
      }
    };
  });
}

function generateId(): string {
  return `soroq-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Saves a new interrogation recording. Each save creates a new row (by case number).
 */
export async function saveSoroqAudio(
  blob: Blob,
  mimeType: string,
  durationSeconds: number,
  caseNumber: string,
): Promise<SavedSoroqAudioItem> {
  const buffer = await blob.arrayBuffer();
  const id = generateId();
  const item: SavedSoroqAudioItem & { buffer: ArrayBuffer } = {
    id,
    caseNumber: (caseNumber || "").trim() || "—",
    recordedAt: Date.now(),
    durationSeconds,
    mimeType,
    buffer,
  };
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.add(item);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      db.close();
      resolve({
        id: item.id,
        caseNumber: item.caseNumber,
        recordedAt: item.recordedAt,
        durationSeconds: item.durationSeconds,
        mimeType: item.mimeType,
      });
    };
  });
}

/**
 * Returns all saved recordings (for table list), sorted by date descending.
 */
export async function getSoroqAudioList(): Promise<SavedSoroqAudioItem[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      db.close();
      const rows = (req.result as (SavedSoroqAudioItem & { buffer: ArrayBuffer })[]) || [];
      const items: SavedSoroqAudioItem[] = rows.map((r) => ({
        id: r.id,
        caseNumber: r.caseNumber ?? "—",
        recordedAt: r.recordedAt ?? 0,
        durationSeconds: r.durationSeconds ?? 0,
        mimeType: r.mimeType ?? "audio/webm",
      }));
      items.sort((a, b) => b.recordedAt - a.recordedAt);
      resolve(items);
    };
  });
}

/**
 * Returns one recording by id with blob (for play or generate protocol).
 */
export async function getSoroqAudioById(id: string): Promise<SavedSoroqAudio | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const row = req.result;
      db.close();
      if (row?.buffer != null) {
        const blob = new Blob([row.buffer as ArrayBuffer], { type: row.mimeType ?? "audio/webm" });
        resolve({
          id: row.id,
          caseNumber: row.caseNumber ?? "—",
          recordedAt: row.recordedAt ?? 0,
          durationSeconds: row.durationSeconds ?? 0,
          mimeType: row.mimeType ?? "audio/webm",
          blob,
        });
      } else {
        resolve(null);
      }
    };
  });
}

/**
 * Deletes a saved recording by id.
 */
export async function deleteSoroqAudio(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const req = tx.objectStore(STORE_NAME).delete(id);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
    tx.oncomplete = () => db.close();
  });
}
