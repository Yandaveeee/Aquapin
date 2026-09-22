import React, { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useSync } from '../hooks/useOfflineData';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const REALTIME_TABLES = ['ponds', 'stocking_logs', 'mortality_logs', 'harvests', 'pond_history'] as const;
const REALTIME_SYNC_DELAY_MS = 900;
const FOREGROUND_SYNC_DELAY_MS = 500;

export function RealtimeSyncBridge() {
  const { user } = useAuth();
  const { performSync, syncSettings } = useSync();
  const performSyncRef = useRef(performSync);
  const settingsRef = useRef(syncSettings);
  performSyncRef.current = performSync;
  settingsRef.current = syncSettings;
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncInFlightRef = useRef(false);
  const pendingSyncRef = useRef(false);

  useEffect(() => {
    if (!user?.id || !isSupabaseConfigured()) {
      return;
    }

    let cancelled = false;

    const clearScheduledSync = () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };

    const runSync = async () => {
      if (cancelled || AppState.currentState !== 'active' || !settingsRef.current.autoSync) return;

      if (syncInFlightRef.current) {
        pendingSyncRef.current = true;
        return;
      }

      syncInFlightRef.current = true;

      try {
        if (cancelled) return;
        const result = await performSyncRef.current();
        if (result.message === 'Sync already in progress.') pendingSyncRef.current = true;
      } catch (_error) {
        // Best-effort background refresh only.
      } finally {
        syncInFlightRef.current = false;

        if (pendingSyncRef.current && !cancelled) {
          pendingSyncRef.current = false;
          scheduleSync(REALTIME_SYNC_DELAY_MS);
        }
      }
    };

    const scheduleSync = (delayMs = 0) => {
      clearScheduledSync();
      syncTimerRef.current = setTimeout(() => {
        void runSync();
      }, delayMs);
    };

    const channelName = `mobile-sync-${Math.random().toString(36).slice(2)}`;
    let channel = supabase.channel(channelName);

    for (const table of REALTIME_TABLES) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        scheduleSync(REALTIME_SYNC_DELAY_MS);
      });
    }

    channel.subscribe();
    scheduleSync(FOREGROUND_SYNC_DELAY_MS);

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        scheduleSync(FOREGROUND_SYNC_DELAY_MS);
      }
    });

    return () => {
      cancelled = true;
      clearScheduledSync();
      appStateSubscription.remove();
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return null;
}
