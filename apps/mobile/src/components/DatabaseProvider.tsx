import React, { createContext, useContext, useEffect, useState } from 'react';
import { database, mockDatabase } from '../db';

interface DatabaseContextValue {
  database: any;
  isReady: boolean;
  isMock: boolean;
}

const DatabaseContext = createContext<DatabaseContextValue | null>(null);

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const isMock = !database;

  useEffect(() => {
    // Database is already initialized in db/index.ts
    // This provider ensures it's available throughout the app
    setIsReady(true);
  }, []);

  if (!isReady) {
    return null; // Or a loading spinner
  }

  // Use real database if available, otherwise use mock
  const activeDatabase = database || mockDatabase;

  return (
    <DatabaseContext.Provider value={{ database: activeDatabase, isReady, isMock }}>
      {children}
    </DatabaseContext.Provider>
  );
}

export function useDatabase() {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }
  return context;
}
