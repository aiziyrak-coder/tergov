/**
 * Persists the last interrogation (soroq) recording in IndexedDB so the user can
 * retry protocol generation even after an error or page refresh.
 */

const DB_NAME = "TERGOV_SOROQ_AUDIO_DB";
const DB_VERSION = 1;
const STORE_NAME = "lastRecording";
const KEY = "soroq";

export interface SavedSoroqAudio {
  blob: Blob;
  mimeType: string;
  recordedAt: number;
  durationSeconds?: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

/**
 * Saves the interrogation audio blob. Overwrites any previously saved recording.
 * Stores as ArrayBuffer for IndexedDB compatibility across browsers.
 */
export async function saveSoroqAudio(
  blob: Blob,
  mimeType: string,
  durationSeconds?: number
): Promise<void> {
  const buffer = await blob.arrayBuffer();
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const record = {
      id: KEY,
      buffer,
      mimeType,
      recordedAt: Date.now(),
      durationSeconds,
    };
    const req = store.put(record);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
    tx.oncomplete = () => db.close();
  });
}

/**
 * Returns the last saved interrogation audio, if any.
 */
export async function getSoroqAudio(): Promise<SavedSoroqAudio | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(KEY);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const row = req.result;
      db.close();
      if (row?.buffer != null) {
        const blob = new Blob([row.buffer as ArrayBuffer], { type: row.mimeType ?? "audio/webm" });
        resolve({
          blob,
          mimeType: row.mimeType ?? "audio/webm",
          recordedAt: row.recordedAt ?? 0,
          durationSeconds: row.durationSeconds,
        });
      } else {
        resolve(null);
      }
    };
  });
}

/**
 * Removes the saved interrogation audio.
 */
export async function clearSoroqAudio(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const req = tx.objectStore(STORE_NAME).delete(KEY);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve();
    tx.oncomplete = () => db.close();
  });
}
