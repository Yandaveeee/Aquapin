import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSync } from '../hooks/useOfflineData';

export function NetworkStatus() {
  const { isOnline, isSyncing, lastSync } = useSync();

  return (
    <View style={[styles.container, isOnline ? styles.online : styles.offline]}>
      <Text style={styles.text}>
        {isSyncing 
          ? '⏳ Syncing...' 
          : isOnline 
            ? `🟢 Online${lastSync ? ` (Last sync: ${lastSync.toLocaleTimeString()})` : ''}`
            : '🔴 Offline - Changes saved locally'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  online: {
    backgroundColor: '#d4edda',
  },
  offline: {
    backgroundColor: '#f8d7da',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});
