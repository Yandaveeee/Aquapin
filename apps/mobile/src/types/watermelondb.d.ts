declare module '@nozbe/watermelondb' {
  export class Model {
    id: string;
    _raw: any;
    static table: string;
    static associations: any;
    prepareUpdate(recordUpdater: (record: this) => void): this;
    update(recordUpdater: (record: this) => void): Promise<this>;
    markAsDeleted(): Promise<void>;
    destroyPermanently(): Promise<void>;
  }
  export const appSchema: any;
  export const tableSchema: any;
  export class Database {
    constructor(options: any);
    collections: any;
    write<T>(work: () => Promise<T>): Promise<T>;
    unsafeResetDatabase(): Promise<void>;
  }
}

declare module '@nozbe/watermelondb/adapters/sqlite' {
  export default class SQLiteAdapter {
    constructor(options: any);
  }
}

declare module '@nozbe/watermelondb/decorators' {
  export const field: any;
  export const date: any;
  export const text: any;
  export const children: any;
  export const readonly: any;
  export const relation: any;
  export const immutableRelation: any;
}

declare module '@nozbe/watermelondb/sync' {
  export const synchronize: any;
  export type SyncDatabaseChangeSet = any;
  export type SyncTableChangeSet = any;
}
