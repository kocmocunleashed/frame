// Transactions serialize writes, including a pending edit followed by its save acknowledgement.
let database: Promise<IDBDatabase> | undefined;
function open() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("frame-recovery", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("copies");
    request.onerror = () => {
      database = undefined;
      reject(request.error);
    };
    request.onsuccess = () => resolve(request.result);
  }));
}
async function run<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction("copies", mode),
      req = operation(tx.objectStore("copies"));
    tx.oncomplete = () => resolve(req.result);
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}
export async function readRecovery(key: string) {
  if (typeof indexedDB === "undefined") return localStorage.getItem(key);
  return (await run("readonly", (store) => store.get(key))) as
    string | undefined;
}
export async function writeRecovery(key: string, value: string) {
  if (typeof indexedDB === "undefined") {
    localStorage.setItem(key, value);
    return;
  }
  await run("readwrite", (store) => store.put(value, key));
}
export async function removeRecovery(key: string) {
  if (typeof indexedDB === "undefined") {
    localStorage.removeItem(key);
    return;
  }
  await run("readwrite", (store) => store.delete(key));
}
