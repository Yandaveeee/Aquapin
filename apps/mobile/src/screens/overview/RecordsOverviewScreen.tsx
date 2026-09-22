import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useFarmOverview, useSync } from '../../hooks';
import { aquapinColors, formatRelativeTime, formatWholeNumber } from '../../theme/aquapin';

type RecordType = 'stocking' | 'mortality' | 'harvest';
type RecordsSegment = 'log' | 'recent' | 'history' | 'queue';

function getActivityTone(type: 'stocking' | 'mortality' | 'harvest') {
  switch (type) {
    case 'stocking':
      return { bg: aquapinColors.greenSoft, fg: aquapinColors.green, icon: 'add-circle-outline' as const };
    case 'mortality':
      return { bg: aquapinColors.redSoft, fg: aquapinColors.red, icon: 'warning-outline' as const };
    case 'harvest':
      return { bg: aquapinColors.blueSoft, fg: aquapinColors.blue, icon: 'basket-outline' as const };
    default:
      return { bg: aquapinColors.surfaceMuted, fg: aquapinColors.textMuted, icon: 'ellipse-outline' as const };
  }
}

export default function RecordsOverviewScreen() {
  const navigation = useNavigation<any>();
  const overview = useFarmOverview();
  const { queueSnapshot, lastSync } = useSync();

  const openRecordsWorkspace = (params?: {
    initialType?: RecordType;
    initialSegment?: RecordsSegment;
    initialFilterType?: RecordType | 'all';
    historyOnly?: boolean;
  }) => {
    navigation.getParent()?.navigate('RecordsWorkspace', {
      initialType: params?.initialType,
      initialSegment: params?.initialSegment || 'recent',
      initialFilterType: params?.initialFilterType || 'all',
      historyOnly: params?.historyOnly,
      requestKey: Date.now(),
    });
  };

  const openRecordLog = (initialType: RecordType) => {
    openRecordsWorkspace({ initialType, initialSegment: 'log', initialFilterType: 'all' });
  };

  const openFilteredRecords = (initialType: RecordType, initialSegment: RecordsSegment = 'recent') => {
    openRecordsWorkspace({ initialType, initialSegment, initialFilterType: initialType, historyOnly: true });
  };

  const recordModules = [
    {
      key: 'stocking',
      title: 'Stocking Records',
      subtitle: 'Capture new pond inputs and species entries.',
      icon: 'add-circle-outline' as const,
      onPress: () => openFilteredRecords('stocking'),
    },
    {
      key: 'mortality',
      title: 'Mortality Records',
      subtitle: 'Log fish losses with notes and dates.',
      icon: 'warning-outline' as const,
      onPress: () => openFilteredRecords('mortality'),
    },
    {
      key: 'harvest',
      title: 'Harvest Records',
      subtitle: 'Save yield, fish count, and harvest status.',
      icon: 'basket-outline' as const,
      onPress: () => openFilteredRecords('harvest'),
    },
    {
      key: 'feed',
      title: 'Feed Tracking',
      subtitle: 'Use the records workspace for next-cycle log expansion.',
      icon: 'list-outline' as const,
      onPress: () => openRecordsWorkspace({ initialSegment: 'recent', initialFilterType: 'all', historyOnly: true }),
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.eyebrow}>Aquapin 2.0</Text>
            <Text style={styles.title}>Records</Text>
            <Text style={styles.subtitle}>Quick logging, queue monitoring, and record history in one place.</Text>
          </View>
          <TouchableOpacity style={styles.iconButton} onPress={() => navigation.getParent()?.navigate('SyncStatus')}>
            <Ionicons name="cloud-upload-outline" size={20} color={aquapinColors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.quickCard}>
          <Text style={styles.quickTitle}>Quick record capture</Text>
          <Text style={styles.quickSubtitle}>The same upgraded workflow foundation, optimized for faster field entry.</Text>

          <View style={styles.quickActionRow}>
            <TouchableOpacity style={[styles.quickAction, { backgroundColor: aquapinColors.greenSoft }]} onPress={() => openRecordLog('stocking')}>
              <Ionicons name="add-circle-outline" size={22} color={aquapinColors.green} />
              <Text style={styles.quickActionText}>Stocking</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.quickAction, { backgroundColor: aquapinColors.redSoft }]} onPress={() => openRecordLog('mortality')}>
              <Ionicons name="warning-outline" size={22} color={aquapinColors.red} />
              <Text style={styles.quickActionText}>Mortality</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.quickAction, { backgroundColor: aquapinColors.blueSoft }]} onPress={() => openRecordLog('harvest')}>
              <Ionicons name="basket-outline" size={22} color={aquapinColors.blue} />
              <Text style={styles.quickActionText}>Harvest</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.sectionHeadRow}>
          <Text style={styles.sectionTitle}>Queue Health</Text>
          <Text style={styles.sectionMeta}>{lastSync ? formatRelativeTime(lastSync.getTime()) : 'Waiting for first sync'}</Text>
        </View>

        <View style={styles.queueRow}>
          <View style={styles.queueCard}>
            <Text style={styles.queueLabel}>Pending</Text>
            <Text style={styles.queueValue}>{formatWholeNumber(queueSnapshot.pending)}</Text>
            <Text style={styles.queueHint}>Queued records waiting for sync</Text>
          </View>
          <View style={styles.queueCard}>
            <Text style={styles.queueLabel}>Synced</Text>
            <Text style={styles.queueValue}>{formatWholeNumber(queueSnapshot.synced)}</Text>
            <Text style={styles.queueHint}>Operations already pushed</Text>
          </View>
          <View style={styles.queueCard}>
            <Text style={styles.queueLabel}>Failed</Text>
            <Text style={styles.queueValue}>{formatWholeNumber(queueSnapshot.failed + queueSnapshot.blocked)}</Text>
            <Text style={styles.queueHint}>Items needing attention</Text>
          </View>
        </View>

        <View style={styles.sectionHeadRow}>
          <Text style={styles.sectionTitle}>Record Modules</Text>
          <TouchableOpacity onPress={() => openRecordsWorkspace({ initialSegment: 'recent', initialFilterType: 'all', historyOnly: true })}>
            <Text style={styles.linkText}>Open Workspace</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.moduleGrid}>
          {recordModules.map((module) => (
            <TouchableOpacity key={module.key} style={styles.moduleCard} activeOpacity={0.92} onPress={module.onPress}>
              <View style={styles.moduleIcon}>
                <Ionicons name={module.icon} size={20} color={aquapinColors.blue} />
              </View>
              <Text style={styles.moduleTitle}>{module.title}</Text>
              <Text style={styles.moduleSubtitle}>{module.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.sectionHeadRow}>
          <Text style={styles.sectionTitle}>Recent Activities</Text>
          <TouchableOpacity onPress={() => openRecordsWorkspace({ initialSegment: 'recent', initialFilterType: 'all', historyOnly: true })}>
            <Text style={styles.linkText}>View All</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.activityList}>
          {overview.recentActivities.slice(0, 5).map((activity) => {
            const tone = getActivityTone(activity.type);

            return (
              <TouchableOpacity
                key={`${activity.type}-${activity.id}`}
                style={styles.activityCard}
                activeOpacity={0.92}
                onPress={() => openFilteredRecords(activity.type)}
              >
                <View style={[styles.activityIcon, { backgroundColor: tone.bg }]}>
                  <Ionicons name={tone.icon} size={18} color={tone.fg} />
                </View>
                <View style={styles.activityCopy}>
                  <Text style={styles.activityTitle}>{activity.title}</Text>
                  <Text style={styles.activitySubtitle}>{activity.subtitle}</Text>
                </View>
                <View style={styles.activityMeta}>
                  <Text style={styles.activityAmount}>{activity.amount}</Text>
                  <Text style={styles.activityTime}>{formatRelativeTime(activity.createdAt)}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: aquapinColors.background,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 140,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  eyebrow: {
    color: aquapinColors.green,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  title: {
    color: aquapinColors.text,
    fontSize: 28,
    fontWeight: '900',
    marginTop: 6,
  },
  subtitle: {
    color: aquapinColors.textMuted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
    maxWidth: 280,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: aquapinColors.surface,
  },
  quickCard: {
    backgroundColor: aquapinColors.surface,
    borderRadius: 28,
    padding: 20,
    marginBottom: 20,
  },
  quickTitle: {
    color: aquapinColors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  quickSubtitle: {
    color: aquapinColors.textMuted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
  },
  quickActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  quickAction: {
    flex: 1,
    borderRadius: 22,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 10,
  },
  quickActionText: {
    color: aquapinColors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  sectionHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    color: aquapinColors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  sectionMeta: {
    color: aquapinColors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  linkText: {
    color: aquapinColors.blue,
    fontSize: 13,
    fontWeight: '700',
  },
  queueRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  queueCard: {
    flex: 1,
    backgroundColor: aquapinColors.surface,
    borderRadius: 22,
    padding: 16,
  },
  queueLabel: {
    color: aquapinColors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  queueValue: {
    color: aquapinColors.text,
    fontSize: 24,
    fontWeight: '900',
    marginTop: 8,
  },
  queueHint: {
    color: aquapinColors.textMuted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 8,
  },
  moduleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
    marginBottom: 20,
  },
  moduleCard: {
    width: '48%',
    backgroundColor: aquapinColors.surface,
    borderRadius: 24,
    padding: 16,
    minHeight: 146,
  },
  moduleIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: aquapinColors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  moduleTitle: {
    color: aquapinColors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  moduleSubtitle: {
    color: aquapinColors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  activityList: {
    gap: 12,
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: aquapinColors.surface,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  activityCopy: {
    flex: 1,
  },
  activityTitle: {
    color: aquapinColors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  activitySubtitle: {
    color: aquapinColors.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  activityMeta: {
    alignItems: 'flex-end',
  },
  activityAmount: {
    color: aquapinColors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  activityTime: {
    color: aquapinColors.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
});
