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
const DB_VERSION = 2;
const MUTATIONS = "mutations";
const META = "meta";
const SNAPSHOTS = "snapshots";
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
      if (!database.objectStoreNames.contains(SNAPSHOTS)) {
        const store = database.createObjectStore(SNAPSHOTS, { keyPath: "id" });
        store.createIndex("scope_kind", ["scopeKey", "kind"], { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline storage could not be opened."));
  });
}

export async function activateOfflineScope(scope: OfflineScope | null) {
  const database = await openOfflineDb();
  const transaction = database.transaction([META, MUTATIONS, SNAPSHOTS], "readwrite");
  const meta = transaction.objectStore(META);
  const mutations = transaction.objectStore(MUTATIONS);
  const snapshots = transaction.objectStore(SNAPSHOTS);
  const current = await requestResult<{ key: string; value: string; scope?: OfflineScope } | undefined>(meta.get(ACTIVE_SCOPE_KEY));

  const next = scope ? scopeKey(scope) : "";
  if ((current?.value ?? "") !== next) {
    mutations.clear();
    snapshots.clear();
    if (next) meta.put({ key: ACTIVE_SCOPE_KEY, value: next, scope });
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

export async function retryOfflineMutation(scope: OfflineScope, id: string) {
  const database = await openOfflineDb();
  const transaction = database.transaction(MUTATIONS, "readwrite");
  const store = transaction.objectStore(MUTATIONS);
  const current = await requestResult<OfflineMutationRecord | undefined>(store.get(id));
  if (
    current
    && current.scopeKey === scopeKey(scope)
    && current.userId === scope.userId
    && current.tenantId === scope.tenantId
    && current.schoolId === scope.schoolId
    && current.status === "pending"
  ) {
    store.put({ ...current, status: "pending", lastError: null, updatedAt: new Date().toISOString() });
  }
  await transactionDone(transaction);
  database.close();
}

export async function discardOfflineMutation(scope: OfflineScope, id: string) {
  const database = await openOfflineDb();
  const transaction = database.transaction(MUTATIONS, "readwrite");
  const store = transaction.objectStore(MUTATIONS);
  const current = await requestResult<OfflineMutationRecord | undefined>(store.get(id));
  if (
    current
    && current.scopeKey === scopeKey(scope)
    && current.userId === scope.userId
    && current.tenantId === scope.tenantId
    && current.schoolId === scope.schoolId
  ) {
    store.delete(id);
  }
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


export type OfflineSnapshot<TPayload = unknown> = OfflineScope & {
  id: string;
  kind: string;
  scopeKey: string;
  payload: TPayload;
  updatedAt: string;
};

export async function getActiveOfflineScope(): Promise<OfflineScope | null> {
  const database = await openOfflineDb();
  const transaction = database.transaction(META, "readonly");
  const current = await requestResult<{ key: string; value: string; scope?: OfflineScope } | undefined>(
    transaction.objectStore(META).get(ACTIVE_SCOPE_KEY),
  );
  await transactionDone(transaction);
  database.close();
  return current?.scope ?? null;
}

export async function saveOfflineSnapshot<TPayload>(
  scope: OfflineScope,
  kind: string,
  snapshotKey: string,
  payload: TPayload,
) {
  const database = await openOfflineDb();
  const transaction = database.transaction(SNAPSHOTS, "readwrite");
  const record: OfflineSnapshot<TPayload> = {
    ...scope,
    id: `${scopeKey(scope)}:${kind}:${snapshotKey}`,
    kind,
    scopeKey: scopeKey(scope),
    payload,
    updatedAt: new Date().toISOString(),
  };
  transaction.objectStore(SNAPSHOTS).put(record);
  await transactionDone(transaction);
  database.close();
  return record;
}

export async function listOfflineSnapshots<TPayload>(
  scope: OfflineScope,
  kind: string,
): Promise<Array<OfflineSnapshot<TPayload>>> {
  const database = await openOfflineDb();
  const transaction = database.transaction(SNAPSHOTS, "readonly");
  const records = await requestResult<Array<OfflineSnapshot<TPayload>>>(transaction.objectStore(SNAPSHOTS).getAll());
  await transactionDone(transaction);
  database.close();
  return records
    .filter((record) => record.scopeKey === scopeKey(scope) && record.kind === kind)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
