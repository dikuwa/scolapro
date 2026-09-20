export type OfflineScope = {
  userId: string;
  tenantId: string;
  schoolId: string;
};

export type OfflineMutationStatus = "pending" | "syncing" | "conflicted" | "rejected";

export type OfflineMutationRecord<TPayload = unknown> = OfflineScope & {
  id: string;
  kind: string;
  scopeKey: string;
  payload: TPayload;
  createdAt: string;
  updatedAt: string;
  status: OfflineMutationStatus;
  lastError: string | null;
};

const DB_NAME = "scolapro-offline";
const DB_VERSION = 1;
const MUTATIONS = "mutations";
const META = "meta";
const ACTIVE_SCOPE_KEY = "active-scope";

function scopeKey(scope: OfflineScope) {
  return `${scope.userId}:${scope.tenantId}:${scope.schoolId}`;
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction was aborted."));
  });
}

function openOfflineDb() {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Offline storage is unavailable in this browser."));

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(MUTATIONS)) {
        const store = database.createObjectStore(MUTATIONS, { keyPath: "id" });
        store.createIndex("scope_status", ["scopeKey", "status"], { unique: false });
        store.createIndex("scope_kind", ["scopeKey", "kind"], { unique: false });
      }
      if (!database.objectStoreNames.contains(META)) database.createObjectStore(META, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline storage could not be opened."));
  });
}

export async function activateOfflineScope(scope: OfflineScope | null) {
  const database = await openOfflineDb();
  const transaction = database.transaction([META, MUTATIONS], "readwrite");
  const meta = transaction.objectStore(META);
  const mutations = transaction.objectStore(MUTATIONS);
  const current = await requestResult<{ key: string; value: string } | undefined>(meta.get(ACTIVE_SCOPE_KEY));

  const next = scope ? scopeKey(scope) : "";
  if ((current?.value ?? "") !== next) {
    mutations.clear();
    if (next) meta.put({ key: ACTIVE_SCOPE_KEY, value: next });
    else meta.delete(ACTIVE_SCOPE_KEY);
  }

  await transactionDone(transaction);
  database.close();
}

export async function clearOfflineData() {
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Offline storage could not be cleared."));
    request.onblocked = () => resolve();
  });
}

export async function enqueueOfflineMutation<TPayload>(
  scope: OfflineScope,
  input: { id: string; kind: string; payload: TPayload },
) {
  const database = await openOfflineDb();
  const transaction = database.transaction(MUTATIONS, "readwrite");
  const store = transaction.objectStore(MUTATIONS);
  const now = new Date().toISOString();
  const record: OfflineMutationRecord<TPayload> = {
    ...scope,
    id: input.id,
    kind: input.kind,
    scopeKey: scopeKey(scope),
    payload: input.payload,
    createdAt: now,
    updatedAt: now,
    status: "pending",
    lastError: null,
  };
  store.put(record);
  await transactionDone(transaction);
  database.close();
  return record;
}

export async function listOfflineMutations<TPayload>(
  scope: OfflineScope,
  kind?: string,
): Promise<Array<OfflineMutationRecord<TPayload>>> {
  const database = await openOfflineDb();
  const transaction = database.transaction(MUTATIONS, "readonly");
  const records = await requestResult<Array<OfflineMutationRecord<TPayload>>>(transaction.objectStore(MUTATIONS).getAll());
  await transactionDone(transaction);
  database.close();
  return records
    .filter((record) => record.scopeKey === scopeKey(scope) && (!kind || record.kind === kind))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function updateOfflineMutation(id: string, changes: Partial<Pick<OfflineMutationRecord, "status" | "lastError">>) {
  const database = await openOfflineDb();
  const transaction = database.transaction(MUTATIONS, "readwrite");
  const store = transaction.objectStore(MUTATIONS);
  const current = await requestResult<OfflineMutationRecord | undefined>(store.get(id));
  if (current) store.put({ ...current, ...changes, updatedAt: new Date().toISOString() });
  await transactionDone(transaction);
  database.close();
}

export async function removeOfflineMutation(id: string) {
  const database = await openOfflineDb();
  const transaction = database.transaction(MUTATIONS, "readwrite");
  transaction.objectStore(MUTATIONS).delete(id);
  await transactionDone(transaction);
  database.close();
}

export async function offlineQueueSummary(scope: OfflineScope) {
  const records = await listOfflineMutations(scope);
  return {
    pending: records.filter((record) => record.status === "pending" || record.status === "syncing").length,
    attention: records.filter((record) => record.status === "conflicted" || record.status === "rejected").length,
  };
}
