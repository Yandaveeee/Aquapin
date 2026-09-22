// Coordinate transactions with the local apply phase of sync. Network requests
// happen outside this lock, so an unavailable server never holds up local saves.
let currentMutation: Promise<unknown> = Promise.resolve();

export function withLocalMutation<T>(work: () => Promise<T>): Promise<T> {
  const result = currentMutation.then(work);
  currentMutation = result.catch(() => undefined);
  return result;
}
