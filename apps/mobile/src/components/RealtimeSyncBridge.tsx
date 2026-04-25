import React, { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../contexts/AuthContext';
import { syncData } from '../db/sync';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const REALTIME_TABLES = ['ponds', 'stocking_logs', 'mortality_logs', 'harvests', 'pond_history'] as const;
const REALTIME_SYNC_DELAY_MS = 900;
const FOREGROUND_SYNC_DELAY_MS = 500;

export function RealtimeSyncBridge() {
  const { user } = useAuth();
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
      if (cancelled) return;

      const netInfo = await NetInfo.fetch().catch(() => null);
      const connected = !!netInfo?.isConnected;
      const reachable =
        netInfo?.isInternetReachable === null || netInfo?.isInternetReachable === undefined
          ? connected
          : !!netInfo.isInternetReachable;

      if (!connected || !reachable) {
        return;
      }

      if (syncInFlightRef.current) {
        pendingSyncRef.current = true;
        return;
      }

      syncInFlightRef.current = true;

      try {
        await syncData();
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
