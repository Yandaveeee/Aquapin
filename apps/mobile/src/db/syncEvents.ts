const saveListeners = new Set<() => void>();
const queueListeners = new Set<() => void>();

export function requestBackgroundSync() {
  saveListeners.forEach((listener) => listener());
}
export function subscribeToSyncRequests(listener: () => void) {
  saveListeners.add(listener);
  return () => { saveListeners.delete(listener); };
}
export function notifySyncStateChanged() {
  queueListeners.forEach((listener) => listener());
}
export function subscribeToSyncState(listener: () => void) {
  queueListeners.add(listener);
  return () => { queueListeners.delete(listener); };
}
