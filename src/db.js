const DB_NAME = 'chessdesk-local';
const DB_VERSION = 1;
let openPromise;

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('The browser could not read local storage.'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('The local storage operation was interrupted.'));
  });
}

function writeTransaction(db) {
  try { return db.transaction('records', 'readwrite', { durability: 'strict' }); }
  catch { return db.transaction('records', 'readwrite'); }
}

async function atomicWrite(db, write) {
  const transaction = writeTransaction(db);
  const done = transactionDone(transaction);
  try { write(transaction.objectStore('records')); }
  catch (error) {
    // Synchronous DataCloneError/DataError does not abort queued IDB writes.
    try { transaction.abort(); } catch { /* a request may already have aborted */ }
    await done.catch(() => {});
    throw error;
  }
  await done;
}

function friendlyStorageError(error) {
  if (error?.name === 'QuotaExceededError') return new Error('Device storage is full. Export a backup or remove unused records, then try again.');
  if (error?.name === 'SecurityError' || error?.name === 'InvalidStateError') return new Error('This browser blocked local storage. Check the site storage permissions and try again.');
  return error instanceof Error ? error : new Error('The local storage operation failed.');
}

function database() {
  if (!('indexedDB' in globalThis)) return Promise.reject(new Error('IndexedDB is not available in this browser. Local library features require a supported browser.'));
  if (!openPromise) {
    openPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('records')) {
          const store = db.createObjectStore('records', { keyPath: 'id' });
          store.createIndex('kind', 'kind', { unique: false });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); openPromise = null; };
        resolve(db);
      };
      request.onerror = () => reject(friendlyStorageError(request.error));
      request.onblocked = () => reject(new Error('A previous Chessdesk tab is holding a storage upgrade. Close the other tab and retry.'));
    }).catch((error) => {
      openPromise = null;
      throw friendlyStorageError(error);
    });
  }
  return openPromise;
}

export async function listRecords(kind) {
  try {
    const db = await database();
    const transaction = db.transaction('records', 'readonly');
    const store = transaction.objectStore('records');
    const values = kind ? await requestResult(store.index('kind').getAll(kind)) : await requestResult(store.getAll());
    await transactionDone(transaction);
    return values.sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
  } catch (error) { throw friendlyStorageError(error); }
}

export async function getRecord(id) {
  try {
    const db = await database();
    return await requestResult(db.transaction('records', 'readonly').objectStore('records').get(id));
  } catch (error) { throw friendlyStorageError(error); }
}

export async function putRecord(record) {
  try {
    const db = await database();
    await atomicWrite(db, (store) => store.put({ ...record, updatedAt: new Date().toISOString() }));
    return record;
  } catch (error) { throw friendlyStorageError(error); }
}

export async function putRecords(records) {
  if (!records.length) return;
  try {
    const db = await database();
    await atomicWrite(db, (store) => {
      for (const record of records) store.put({ ...record, updatedAt: record.updatedAt || new Date().toISOString() });
    });
  } catch (error) { throw friendlyStorageError(error); }
}

export async function deleteRecord(id) {
  return deleteRecords([id]);
}

export async function deleteRecords(ids) {
  const uniqueIds = [...new Set(ids)].filter((id) => typeof id === 'string' && id);
  if (!uniqueIds.length) return;
  try {
    const db = await database();
    await atomicWrite(db, (store) => { for (const id of uniqueIds) store.delete(id); });
  } catch (error) { throw friendlyStorageError(error); }
}

export async function putRecordReplacingIds(record, ids) {
  const uniqueIds = [...new Set(ids)].filter((id) => typeof id === 'string' && id && id !== record.id);
  try {
    const db = await database();
    await atomicWrite(db, (store) => {
      store.put({ ...record, updatedAt: new Date().toISOString() });
      for (const id of uniqueIds) store.delete(id);
    });
    return record;
  } catch (error) { throw friendlyStorageError(error); }
}

export async function replaceAllRecords(records) {
  try {
    const db = await database();
    await atomicWrite(db, (store) => {
      store.clear();
      for (const record of records) store.put(record);
    });
  } catch (error) { throw friendlyStorageError(error); }
}

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null;
  try { return await navigator.storage.estimate(); } catch { return null; }
}

export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false;
  try { return await navigator.storage.persist(); } catch { return false; }
}
