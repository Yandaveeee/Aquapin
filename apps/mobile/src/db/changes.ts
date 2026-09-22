// AsyncStorage fallback writes publish the same changes native DB observers receive.
type Listener = (table: string) => void;
const listeners = new Set<Listener>();

export function notifyLocalChange(table: string) {
  listeners.forEach((listener) => listener(table));
}

export function subscribeToLocalChanges(tables: string[], listener: () => void) {
  const onChange: Listener = (table) => {
    if (table === '*' || tables.includes(table)) listener();
  };
  listeners.add(onChange);
  return () => { listeners.delete(onChange); };
}
