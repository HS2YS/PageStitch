import {
  DB_NAME,
  DB_VERSION,
  SEGMENT_STORE,
  SESSION_STORE
} from "./constants.js";

function requestAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionAsPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("Database transaction aborted."));
  });
}

export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SESSION_STORE)) {
        const sessions = database.createObjectStore(SESSION_STORE, { keyPath: "id" });
        sessions.createIndex("createdAt", "createdAt");
      }
      if (!database.objectStoreNames.contains(SEGMENT_STORE)) {
        const segments = database.createObjectStore(SEGMENT_STORE, {
          keyPath: ["sessionId", "index"]
        });
        segments.createIndex("sessionId", "sessionId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putSession(session) {
  const database = await openDatabase();
  const transaction = database.transaction(SESSION_STORE, "readwrite");
  const done = transactionAsPromise(transaction);
  transaction.objectStore(SESSION_STORE).put(session);
  await done;
  database.close();
  return session;
}

export async function getSession(id) {
  const database = await openDatabase();
  const transaction = database.transaction(SESSION_STORE, "readonly");
  const result = await requestAsPromise(transaction.objectStore(SESSION_STORE).get(id));
  database.close();
  return result;
}

export async function listSessions(limit = 20) {
  const database = await openDatabase();
  const transaction = database.transaction(SESSION_STORE, "readonly");
  const index = transaction.objectStore(SESSION_STORE).index("createdAt");
  const sessions = [];

  await new Promise((resolve, reject) => {
    const cursorRequest = index.openCursor(null, "prev");
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor || sessions.length >= limit) {
        resolve();
        return;
      }
      sessions.push(cursor.value);
      cursor.continue();
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });

  database.close();
  return sessions;
}

export async function putSegment(segment) {
  const database = await openDatabase();
  const transaction = database.transaction(SEGMENT_STORE, "readwrite");
  const done = transactionAsPromise(transaction);
  transaction.objectStore(SEGMENT_STORE).put(segment);
  await done;
  database.close();
  return segment;
}

export async function getSegments(sessionId) {
  const database = await openDatabase();
  const transaction = database.transaction(SEGMENT_STORE, "readonly");
  const index = transaction.objectStore(SEGMENT_STORE).index("sessionId");
  const result = await requestAsPromise(index.getAll(IDBKeyRange.only(sessionId)));
  database.close();
  return result.sort((left, right) => left.index - right.index);
}

export async function deleteSession(id) {
  const database = await openDatabase();
  const transaction = database.transaction([SESSION_STORE, SEGMENT_STORE], "readwrite");
  const done = transactionAsPromise(transaction);
  transaction.objectStore(SESSION_STORE).delete(id);

  const segmentStore = transaction.objectStore(SEGMENT_STORE);
  const index = segmentStore.index("sessionId");
  await new Promise((resolve, reject) => {
    const cursorRequest = index.openKeyCursor(IDBKeyRange.only(id));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        resolve();
        return;
      }
      segmentStore.delete(cursor.primaryKey);
      cursor.continue();
    };
    cursorRequest.onerror = () => reject(cursorRequest.error);
  });

  await done;
  database.close();
}

export async function trimHistory(limit) {
  const sessions = await listSessions(Number.MAX_SAFE_INTEGER);
  const stale = sessions.slice(Math.max(0, limit));
  await Promise.all(stale.map((session) => deleteSession(session.id)));
}
