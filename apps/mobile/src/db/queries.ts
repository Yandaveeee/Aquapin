import { Q } from '@nozbe/watermelondb';
import { database, mockDatabase } from './index';
import { subscribeToLocalChanges } from './changes';

export async function fetchPondRecords(table: string, pondId: string): Promise<any[]> {
  if (!pondId) return [];
  if (database) {
    return database.collections.get(table).query(Q.where('pond_id', pondId)).fetch();
  }
  const rows = await (mockDatabase.collections as any)[table].query().fetch();
  return rows.filter((row: any) => row.pondId === pondId);
}

// Coalesce multi-record writes and never overlap refreshes. If data changes during
// a read, run once more after it completes rather than publishing a stale result.
export function watchLocalData(tables: string[], refresh: () => Promise<void>) {
  let stopped = false;
  let running = false;
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async () => {
    timer = undefined;
    if (stopped || running) return;
    running = true;
    dirty = false;
    try { await refresh(); }
    catch (error) { console.warn('Local data refresh failed:', error); }
    finally {
      running = false;
      if (dirty && !stopped) schedule();
    }
  };
  const schedule = () => {
    dirty = true;
    if (!stopped && !running && timer === undefined) timer = setTimeout(() => { void run(); }, 0);
  };
  const subscription = database?.withChangesForTables(tables).subscribe(schedule);
  const unsubscribe = database ? undefined : subscribeToLocalChanges(tables, schedule);
  schedule();
  return () => {
    stopped = true;
    clearTimeout(timer);
    subscription?.unsubscribe();
    unsubscribe?.();
  };
}
