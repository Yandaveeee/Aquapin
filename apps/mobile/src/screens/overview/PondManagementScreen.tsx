import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useFarmOverview } from '../../hooks';
import { aquapinColors, formatCompactNumber, formatRelativeTime, formatWholeNumber } from '../../theme/aquapin';

export default function PondManagementScreen() {
  const navigation = useNavigation<any>();
  const overview = useFarmOverview();

  const openMap = (initialMode: 'view' | 'point' | 'polygon') => {
    navigation.getParent()?.navigate('PondMap', { initialMode, requestKey: Date.now() });
  };

  const modules = [
    {
      key: 'gps',
      title: 'GPS Pond Mapping',
      subtitle: 'Track ponds with precise geolocation.',
      icon: 'navigate-outline' as const,
      onPress: () => openMap('view'),
    },
    {
      key: 'polygon',
      title: 'Polygon Creation',
      subtitle: 'Draw exact pond boundaries on the map.',
      icon: 'shapes-outline' as const,
      onPress: () => openMap('polygon'),
    },
    {
      key: 'details',
      title: 'Pond Details',
      subtitle: 'View stock, species, and status summaries.',
      icon: 'albums-outline' as const,
      onPress: () => navigation.getParent()?.navigate('PondWorkspace'),
    },
    {
      key: 'history',
      title: 'History Tracking',
      subtitle: 'Review pond activity and recent records.',
      icon: 'time-outline' as const,
      onPress: () => navigation.getParent()?.navigate('PondWorkspace'),
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.eyebrow}>Aquapin 2.0</Text>
            <Text style={styles.title}>Pond Management</Text>
            <Text style={styles.subtitle}>GPS mapping, polygon creation, and complete pond monitoring.</Text>
          </View>
          <TouchableOpacity style={styles.iconButton} onPress={() => navigation.getParent()?.navigate('PondWorkspace')}>
            <Ionicons name="ellipsis-horizontal" size={20} color={aquapinColors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Mapped pond network</Text>
          <Text style={styles.heroSubtitle}>Direct upgraded view of the Aquapin pond workspace with map-first actions.</Text>

          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{formatWholeNumber(overview.totalPonds)}</Text>
              <Text style={styles.heroStatLabel}>Total ponds</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{formatWholeNumber(overview.mappedPonds)}</Text>
              <Text style={styles.heroStatLabel}>GPS mapped</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{formatWholeNumber(overview.activePonds)}</Text>
              <Text style={styles.heroStatLabel}>Active cycles</Text>
            </View>
          </View>

          <View style={styles.heroButtons}>
            <TouchableOpacity style={styles.primaryButton} onPress={() => openMap('view')}>
              <Ionicons name="map-outline" size={16} color="#fff" />
              <Text style={styles.primaryButtonText}>Open GPS Map</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => openMap('polygon')}>
              <Ionicons name="shapes-outline" size={16} color={aquapinColors.blue} />
              <Text style={styles.secondaryButtonText}>Create Polygon</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.sectionHeadRow}>
          <Text style={styles.sectionTitle}>Pond Snapshot</Text>
          <TouchableOpacity onPress={() => navigation.getParent()?.navigate('PondWorkspace')}>
            <Text style={styles.linkText}>Open Full Workspace</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Live Stock</Text>
            <Text style={styles.kpiValue}>{formatCompactNumber(overview.totalStock)}</Text>
            <Text style={styles.kpiHint}>Active fish currently tracked</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Species</Text>
            <Text style={styles.kpiValue}>{formatWholeNumber(overview.speciesCount)}</Text>
            <Text style={styles.kpiHint}>Unique live species registered</Text>
          </View>
        </View>

        <View style={styles.pondList}>
          {overview.pondPreview.map((pond) => (
            <TouchableOpacity
              key={pond.id}
              activeOpacity={0.92}
              onPress={() => navigation.getParent()?.navigate('PondWorkspace')}
              style={styles.pondCard}
            >
              <View style={styles.pondCardTop}>
                <View>
                  <Text style={styles.pondName}>{pond.name}</Text>
                  <Text style={styles.pondSpecies}>{pond.currentSpecies || 'No active species yet'}</Text>
                </View>
                <View style={[styles.statusPill, pond.isActive ? styles.statusPillActive : styles.statusPillIdle]}>
                  <Text style={[styles.statusPillText, pond.isActive ? styles.statusPillTextActive : styles.statusPillTextIdle]}>
                    {pond.isActive ? 'Active' : 'Idle'}
                  </Text>
                </View>
              </View>

              <View style={styles.pondMetaRow}>
                <View style={styles.pondMetaItem}>
                  <Ionicons name="fish-outline" size={16} color={aquapinColors.green} />
                  <Text style={styles.pondMetaText}>{formatWholeNumber(pond.currentStockCount)} stock</Text>
                </View>
                <View style={styles.pondMetaItem}>
                  <Ionicons name="time-outline" size={16} color={aquapinColors.blue} />
                  <Text style={styles.pondMetaText}>{formatRelativeTime(overview.latestActivityAt)}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.sectionHeadRow}>
          <Text style={styles.sectionTitle}>Management Modules</Text>
          <Text style={styles.sectionMeta}>Ready for Aquapin v2.0</Text>
        </View>

        <View style={styles.moduleGrid}>
          {modules.map((module) => (
            <TouchableOpacity key={module.key} style={styles.moduleCard} activeOpacity={0.92} onPress={module.onPress}>
              <View style={styles.moduleIcon}>
                <Ionicons name={module.icon} size={20} color={aquapinColors.blue} />
              </View>
              <Text style={styles.moduleTitle}>{module.title}</Text>
              <Text style={styles.moduleSubtitle}>{module.subtitle}</Text>
            </TouchableOpacity>
          ))}
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
    letterSpacing: 0.4,
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
  heroCard: {
    backgroundColor: aquapinColors.surface,
    borderRadius: 28,
    padding: 20,
    marginBottom: 20,
  },
  heroTitle: {
    color: aquapinColors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  heroSubtitle: {
    color: aquapinColors.textMuted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
  },
  heroStats: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  heroStat: {
    flex: 1,
    backgroundColor: aquapinColors.surfaceMuted,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  heroStatValue: {
    color: aquapinColors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  heroStatLabel: {
    color: aquapinColors.textMuted,
    fontSize: 12,
    marginTop: 6,
  },
  heroButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: aquapinColors.green,
    borderRadius: 999,
    paddingVertical: 13,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: aquapinColors.blueSoft,
    borderRadius: 999,
    paddingVertical: 13,
  },
  secondaryButtonText: {
    color: aquapinColors.blue,
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
  kpiRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: aquapinColors.surface,
    borderRadius: 22,
    padding: 16,
  },
  kpiLabel: {
    color: aquapinColors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  kpiValue: {
    color: aquapinColors.text,
    fontSize: 24,
    fontWeight: '900',
    marginTop: 8,
  },
  kpiHint: {
    color: aquapinColors.textMuted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 8,
  },
  pondList: {
    gap: 12,
    marginBottom: 20,
  },
  pondCard: {
    backgroundColor: aquapinColors.surface,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  pondCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  pondName: {
    color: aquapinColors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  pondSpecies: {
    color: aquapinColors.textMuted,
    fontSize: 12,
    marginTop: 5,
    maxWidth: 220,
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  statusPillActive: {
    backgroundColor: aquapinColors.greenSoft,
  },
  statusPillIdle: {
    backgroundColor: aquapinColors.blueSoft,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  statusPillTextActive: {
    color: aquapinColors.green,
  },
  statusPillTextIdle: {
    color: aquapinColors.blue,
  },
  pondMetaRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 14,
  },
  pondMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pondMetaText: {
    color: aquapinColors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  moduleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
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
});
