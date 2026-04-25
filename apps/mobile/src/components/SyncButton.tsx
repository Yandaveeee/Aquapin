import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useSync } from '../hooks/useOfflineData';

export function SyncButton() {
  const { isSyncing, isOnline, performSync } = useSync();

  return (
    <TouchableOpacity
      style={[styles.button, (!isOnline || isSyncing) && styles.buttonDisabled]}
      onPress={() => {
        void performSync(true);
      }}
      disabled={!isOnline || isSyncing}
    >
      {isSyncing ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Text style={styles.text}>
          {isOnline ? '🔄 Sync Now' : '📴 Offline'}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#007bff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#6c757d',
  },
  text: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
