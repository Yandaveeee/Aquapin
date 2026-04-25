import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  FlatList,
  Keyboard,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  usePonds,
  useCreateMortalityLog,
  useCreateHarvest,
  useCreateStockingLog,
  usePondHistory,
  useStockingLogs,
  useSync,
} from '../hooks/useOfflineData';
import { useAuth } from '../contexts/AuthContext';
import { parsePondSpeciesLabel } from '../db/pondState';

const ENTRY_TYPES = [
  { id: 'mortality', label: 'Mortality', icon: 'skull', color: '#dc3545', unit: 'fish' },
  { id: 'harvest', label: 'Harvest', icon: 'basket', color: '#28a745', unit: 'kg' },
  { id: 'stocking', label: 'Stocking', icon: 'add-circle', color: '#20c997', unit: 'fingerlings' },
] as const;

type EntryType = (typeof ENTRY_TYPES)[number]['id'];
type DataSegment = 'log' | 'recent' | 'history' | 'queue';
type DateFilter = 'all' | 'today' | '7d' | '30d';
type QueueStatus = 'queued' | 'synced' | 'failed';
type HistoryStatus = 'active' | 'harvested' | 'logged';
type FilterStatus = QueueStatus | HistoryStatus | 'all';
type ToastType = 'success' | 'error' | 'info';

const FISH_SPECIES = [
  'Tilapia',
  'Milkfish (Bangus)',
  'Catfish (Hito)',
  'Carp',
  'Shrimp (Sugpo)',
  'Seabass (Apahap)',
  'Grouper (Lapu-lapu)',
  'Other',
];

const SEGMENTS: Array<{ id: DataSegment; label: string; icon: string }> = [
  { id: 'log', label: 'Report', icon: 'create-outline' },
  { id: 'recent', label: 'Recent', icon: 'time-outline' },
  { id: 'history', label: 'History', icon: 'library-outline' },
  { id: 'queue', label: 'Queue', icon: 'cloud-upload-outline' },
];

interface ToastState {
  type: ToastType;
  message: string;
}

interface RecentEntry {
  id: string;
  type: EntryType;
  pondId: string;
  pondName: string;
  quantityValue: number;
  unit: string;
  createdAt: number;
  notes?: string;
  species?: string;
  status: QueueStatus;
}

interface HistoryRow {
  id: string;
  type: EntryType;
  pondId: string;
  pondName: string;
  title: string;
  subtitle: string;
  createdAt: number;
  status: HistoryStatus;
}

interface CycleOption<T extends string> {
  id: T;
  label: string;
}

const DATE_OPTIONS: CycleOption<DateFilter>[] = [
  { id: 'all', label: 'Any Date' },
  { id: 'today', label: 'Today' },
  { id: '7d', label: 'Last 7d' },
  { id: '30d', label: 'Last 30d' },
];

const QUEUE_STATUS_OPTIONS: CycleOption<FilterStatus>[] = [
  { id: 'all', label: 'Any Status' },
  { id: 'queued', label: 'Queued' },
  { id: 'synced', label: 'Synced' },
  { id: 'failed', label: 'Failed' },
];

const HISTORY_STATUS_OPTIONS: CycleOption<FilterStatus>[] = [
  { id: 'all', label: 'Any Status' },
  { id: 'active', label: 'Active' },
  { id: 'harvested', label: 'Harvested' },
  { id: 'logged', label: 'Logged' },
];

const TYPE_FILTER_OPTIONS: CycleOption<EntryType | 'all'>[] = [
  { id: 'all', label: 'All Types' },
  ...ENTRY_TYPES.map((item) => ({ id: item.id, label: item.label })),
];

const HISTORY_TYPE_SET = new Set<string>(ENTRY_TYPES.map((item) => item.id));

function getEntryTypeMeta(type: EntryType | 'all') {
  if (type === 'all') {
    return { label: 'All Types', icon: 'funnel-outline', color: '#6c757d', unit: '' };
  }

  return ENTRY_TYPES.find((item) => item.id === type) || ENTRY_TYPES[0];
}

function formatBadgeDate(value: Date): string {
  return value.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
  });
}

function formatEventDate(ts: number): string {
  return new Date(ts).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isMatchingDateFilter(ts: number, filter: DateFilter): boolean {
  if (filter === 'all') return true;

  const now = new Date();
  const eventDate = new Date(ts);

  if (filter === 'today') {
    return eventDate.toDateString() === now.toDateString();
  }

  const days = filter === '7d' ? 7 : 30;
  const threshold = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return eventDate >= threshold;
}

function getDateGroupLabel(ts: number): 'Today' | 'Yesterday' | 'Earlier' {
  const now = new Date();
  const eventDate = new Date(ts);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;

  if (eventDate.getTime() >= startOfToday) return 'Today';
  if (eventDate.getTime() >= startOfYesterday) return 'Yesterday';
  return 'Earlier';
}

function parseJsonField(value: unknown): Record<string, any> {
  if (typeof value !== 'string') return {};
  try {
    return JSON.parse(value);
  } catch (_error) {
    return {};
  }
}

function cycleNext<T extends string>(current: T, options: T[]): T {
  const index = options.indexOf(current);
  if (index < 0 || index === options.length - 1) return options[0];
  return options[index + 1];
}

function getUnitLabel(selectedType: EntryType): string {
  switch (selectedType) {
    case 'mortality':
      return 'Number of dead fish';
    case 'harvest':
      return 'Weight harvested (kg)';
    case 'stocking':
      return 'Number of fingerlings';
    default:
      return 'Quantity';
  }
}

function getQuickAddValues(selectedType: EntryType): string[] {
  switch (selectedType) {
    case 'mortality':
      return ['1', '2', '5', '10'];
    case 'harvest':
      return ['10', '25', '50', '100'];
    case 'stocking':
      return ['100', '500', '1000', '5000'];
    default:
      return ['1', '5', '10', '50'];
  }
}

function formatQuantity(value: number, unit: string): string {
  return `${value.toLocaleString()} ${unit}`;
}

export default function DataEntryScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scrollViewRef = useRef<ScrollView>(null);

  const [activeSegment, setActiveSegment] = useState<DataSegment>('log');

  const [selectedType, setSelectedType] = useState<EntryType>('stocking');
  const [selectedPondId, setSelectedPondId] = useState<string>('');

  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [species, setSpecies] = useState('');
  const [averageWeight, setAverageWeight] = useState('');
  const [source, setSource] = useState('');
  const [isPartialHarvest, setIsPartialHarvest] = useState(true);
  const [fishCount, setFishCount] = useState('');

  const [loading, setLoading] = useState(false);
  const [showPondSelector, setShowPondSelector] = useState(false);
  const [showSpeciesSelector, setShowSpeciesSelector] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);

  const [filterPondId, setFilterPondId] = useState<string>('all');
  const [filterType, setFilterType] = useState<EntryType | 'all'>('all');
  const [filterDate, setFilterDate] = useState<DateFilter>('all');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');

  const [collapsedGroups, setCollapsedGroups] = useState<Record<'Today' | 'Yesterday' | 'Earlier', boolean>>({
    Today: true,
    Yesterday: true,
    Earlier: true,
  });

  const [toast, setToast] = useState<ToastState | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fieldLayouts, setFieldLayouts] = useState<Record<string, number>>({});

  const { ponds } = usePonds();
  const { user } = useAuth();
  const createMortalityLog = useCreateMortalityLog();
  const createHarvest = useCreateHarvest();
  const createStockingLog = useCreateStockingLog();
  const { history, loading: historyLoading } = usePondHistory(selectedPondId);
  const { stockings, loading: stockingsLoading } = useStockingLogs(selectedPondId);
  const { isSyncing, pendingChanges, lastSync, performSync } = useSync();

  const selectedPond = useMemo(
    () => ponds.find((item: any) => item.id === selectedPondId),
    [ponds, selectedPondId]
  );

  const currentType = useMemo(() => getEntryTypeMeta(selectedType), [selectedType]);

  const harvestSpeciesOptions = useMemo(() => {
    if (selectedType !== 'harvest') return [] as string[];
    if (!(selectedPond as any)?.isActive) return [] as string[];

    const fromPond = parsePondSpeciesLabel((selectedPond as any)?.currentSpecies);
    if (fromPond.length > 0) {
      return fromPond;
    }

    return Array.from(
      new Set(
        (stockings as any[])
          .filter((item) => String(item?.status || 'active').toLowerCase() !== 'harvested')
          .map((item) => String(item?.species || '').trim())
          .filter(Boolean)
      )
    );
  }, [selectedPond, selectedType, stockings]);

  const visibleSpeciesOptions = useMemo(() => {
    if (selectedType === 'harvest') {
      return harvestSpeciesOptions;
    }

    return FISH_SPECIES;
  }, [harvestSpeciesOptions, selectedType]);

  const isHarvestSpeciesUnavailable = selectedType === 'harvest' && harvestSpeciesOptions.length === 0;
  const isHarvestSpeciesLocked = selectedType === 'harvest' && harvestSpeciesOptions.length === 1;
  const speciesFieldValue = isHarvestSpeciesLocked ? harvestSpeciesOptions[0] : isHarvestSpeciesUnavailable ? '' : species;
  const speciesPlaceholderText =
    selectedType === 'harvest'
      ? isHarvestSpeciesUnavailable
        ? 'No stocked species to harvest'
        : harvestSpeciesOptions.length > 1
          ? 'Select harvested species'
          : 'Harvest species detected automatically'
      : 'Select species';

  const filteredPonds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return (ponds as any[]).filter((pond) => (pond.name || '').toLowerCase().includes(q));
  }, [ponds, searchQuery]);

  const isHistoryBusy = historyLoading || stockingsLoading;

  const queuePendingCount = pendingChanges.entries + pendingChanges.ponds;

  const pondFilterOptions = useMemo(() => ['all', ...(ponds as any[]).map((pond) => pond.id)], [ponds]);

  const statusOptions = useMemo(
    () => (activeSegment === 'history' ? HISTORY_STATUS_OPTIONS : QUEUE_STATUS_OPTIONS),
    [activeSegment]
  );

  const statusCycleValues = useMemo(() => statusOptions.map((item) => item.id), [statusOptions]);

  const showToast = useCallback((type: ToastType, message: string) => {
    setToast({ type, message });

    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }

    toastTimer.current = setTimeout(() => {
      setToast(null);
    }, 2600);
  }, []);

  useEffect(() => {
    setSpecies('');
    setAverageWeight('');
    setSource('');
    setFishCount('');
    setIsPartialHarvest(true);
  }, [selectedType]);

  useEffect(() => {
    if (selectedType !== 'harvest') return;

    if (harvestSpeciesOptions.length === 1) {
      setSpecies((prev) => (prev === harvestSpeciesOptions[0] ? prev : harvestSpeciesOptions[0]));
      return;
    }

    if (harvestSpeciesOptions.length > 1) {
      setSpecies((prev) => (harvestSpeciesOptions.includes(prev) ? prev : ''));
      return;
    }

    setSpecies((prev) => (prev === '' ? prev : ''));
  }, [harvestSpeciesOptions, selectedType]);

  useEffect(() => {
    setRecentLoading(true);
    const timer = setTimeout(() => setRecentLoading(false), 550);
    return () => clearTimeout(timer);
  }, [activeSegment]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!lastSync) return;
    if (pendingChanges.entries > 0) return;

    setRecentEntries((prev) =>
      prev.map((entry) => (entry.status === 'queued' ? { ...entry, status: 'synced' } : entry))
    );
  }, [lastSync, pendingChanges.entries]);

  useEffect(() => {
    if (!pondFilterOptions.includes(filterPondId)) {
      setFilterPondId('all');
    }
  }, [pondFilterOptions, filterPondId]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }
      if (focusTimer.current) {
        clearTimeout(focusTimer.current);
      }
    };
  }, []);

  const registerFieldLayout = useCallback((field: string, y: number) => {
    setFieldLayouts((prev) => {
      if (prev[field] === y) return prev;
      return { ...prev, [field]: y };
    });
  }, []);

  const focusField = useCallback(
    (field: string) => {
      if (activeSegment !== 'log') return;
      const y = fieldLayouts[field];
      if (typeof y !== 'number' && field !== 'notes') return;

      if (focusTimer.current) {
        clearTimeout(focusTimer.current);
      }

      // Wait for keyboard animation, then move focused field into view.
      focusTimer.current = setTimeout(() => {
        const targetY = field === 'notes' ? (fieldLayouts.notes ?? y) : y;
        scrollViewRef.current?.scrollTo({
          y: Math.max(0, (targetY || 0) - 24),
          animated: true,
        });
      }, Platform.OS === 'ios' ? 120 : 180);
    },
    [activeSegment, fieldLayouts]
  );

  const resetFormFields = useCallback(() => {
    setQuantity('');
    setNotes('');
    setSpecies('');
    setAverageWeight('');
    setSource('');
    setFishCount('');
    setIsPartialHarvest(true);
  }, []);

  const submitEntry = useCallback(
    async (mode: 'save' | 'save_add') => {
      if (!user?.id) {
        showToast('error', 'You must be signed in to save entries.');
        return;
      }

      if (!selectedPondId) {
        showToast('error', 'Select a pond before saving.');
        return;
      }

      if (!quantity.trim()) {
        showToast('error', `Enter ${getUnitLabel(selectedType).toLowerCase()}.`);
        return;
      }

      const normalizedSpecies = species.trim();

      if (selectedType === 'stocking' && !normalizedSpecies) {
        showToast('error', 'Select fish species for stocking.');
        return;
      }

      const pond = (ponds as any[]).find((item) => item.id === selectedPondId);
      if (!pond) {
        showToast('error', 'Selected pond was not found.');
        return;
      }

      if (selectedType === 'harvest' && (!Boolean((pond as any).isActive) || harvestSpeciesOptions.length === 0)) {
        showToast('error', 'This pond has no active stocked species to harvest.');
        return;
      }

      const quantityValue = Number(quantity);
      if (!Number.isFinite(quantityValue) || quantityValue <= 0) {
        showToast('error', 'Enter a valid quantity greater than zero.');
        return;
      }

      const resolvedHarvestSpecies =
        selectedType === 'harvest'
          ? harvestSpeciesOptions.length === 1
            ? harvestSpeciesOptions[0]
            : normalizedSpecies || parsePondSpeciesLabel((pond as any).currentSpecies)[0] || ''
          : '';

      if (selectedType === 'harvest' && harvestSpeciesOptions.length > 1 && !resolvedHarvestSpecies) {
        showToast('error', 'Select which pond species was harvested.');
        return;
      }

      setLoading(true);

      try {
        if (selectedType === 'mortality') {
          await createMortalityLog({
            pondId: selectedPondId,
            quantity: Math.round(quantityValue),
            notes: notes.trim(),
            loggedBy: user.id,
          });
        } else if (selectedType === 'harvest') {
          await createHarvest({
            pondId: selectedPondId,
            yieldKg: quantityValue,
            harvestedBy: user.id,
            species: resolvedHarvestSpecies || (pond as any).currentSpecies,
            isPartial: isPartialHarvest,
            fishCount: fishCount ? parseInt(fishCount, 10) : undefined,
          });
        } else if (selectedType === 'stocking') {
          await createStockingLog({
            pondId: selectedPondId,
            species: normalizedSpecies,
            quantity: Math.round(quantityValue),
            averageWeightG: averageWeight ? Number(averageWeight) : undefined,
            source: source.trim() || undefined,
            stockedBy: user.id,
          });
        } else {
          showToast('error', 'Only Mortality, Harvest, and Stocking reports are supported.');
          setLoading(false);
          return;
        }

        const recentEntry: RecentEntry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: selectedType,
          pondId: selectedPondId,
          pondName: pond.name || 'Unnamed Pond',
          quantityValue,
          unit: currentType.unit,
          createdAt: Date.now(),
          notes: notes.trim() || undefined,
          species:
            selectedType === 'harvest'
              ? resolvedHarvestSpecies || undefined
              : normalizedSpecies || undefined,
          status: 'queued',
        };

        setRecentEntries((prev) => [recentEntry, ...prev].slice(0, 250));

        resetFormFields();

        if (mode === 'save') {
          setActiveSegment('recent');
        }

        showToast('success', `${currentType.label} saved.`);
      } catch (error: any) {
        const message =
          typeof error?.message === 'string' && error.message.length > 0
            ? error.message
            : 'Failed to save entry.';

        const failedEntry: RecentEntry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: selectedType,
          pondId: selectedPondId,
          pondName: pond.name || 'Unnamed Pond',
          quantityValue,
          unit: currentType.unit,
          createdAt: Date.now(),
          notes: notes.trim() || undefined,
          species:
            selectedType === 'harvest'
              ? resolvedHarvestSpecies || undefined
              : normalizedSpecies || undefined,
          status: 'failed',
        };

        setRecentEntries((prev) => [failedEntry, ...prev].slice(0, 250));
        showToast('error', message);
      } finally {
        setLoading(false);
      }
    },
    [
      user?.id,
      selectedPondId,
      quantity,
      selectedType,
      species,
      ponds,
      notes,
      createMortalityLog,
      createHarvest,
      createStockingLog,
      harvestSpeciesOptions,
      averageWeight,
      source,
      fishCount,
      isPartialHarvest,
      currentType.unit,
      currentType.label,
      resetFormFields,
      showToast,
    ]
  );

  const handleEditEntry = useCallback((entry: RecentEntry) => {
    setSelectedPondId(entry.pondId);
    setSelectedType(entry.type);
    setQuantity(String(entry.quantityValue));
    setNotes(entry.notes || '');
    setSpecies(entry.species || '');
    setActiveSegment('log');
    showToast('info', 'Entry loaded for edit.');
  }, [showToast]);

  const handleDuplicateEntry = useCallback((entry: RecentEntry) => {
    setSelectedPondId(entry.pondId);
    setSelectedType(entry.type);
    setQuantity(String(entry.quantityValue));
    setNotes(entry.notes || '');
    setSpecies(entry.species || '');
    setActiveSegment('log');
    showToast('info', 'Entry duplicated to form.');
  }, [showToast]);

  const handleDeleteEntry = useCallback((entryId: string) => {
    setRecentEntries((prev) => prev.filter((entry) => entry.id !== entryId));
    showToast('success', 'Entry removed.');
  }, [showToast]);

  const handleRetrySync = useCallback(async () => {
    const result = await performSync(true);
    if (result.success) {
      showToast('success', 'Queue synced successfully.');
    } else {
      showToast('error', result.message || 'Sync failed.');
    }
  }, [performSync, showToast]);

  const historyRows = useMemo(() => {
    if (!selectedPondId) return [] as HistoryRow[];

    const pondName = (selectedPond as any)?.name || 'Selected Pond';

    const stockingRows: HistoryRow[] = (stockings as any[]).map((item) => ({
      id: `stocking-${item.id}`,
      type: 'stocking',
      pondId: selectedPondId,
      pondName,
      title: `Stocking • ${item.species || 'Unknown species'}`,
      subtitle: `${(item.quantity || 0).toLocaleString()} fingerlings${item.averageWeightG ? ` • ${item.averageWeightG}g avg` : ''
        }`,
      createdAt: Number(item.createdAt || Date.now()),
      status: item.status === 'active' ? 'active' : 'harvested',
    }));

    const eventRows: HistoryRow[] = (history as any[])
      .filter((item) => HISTORY_TYPE_SET.has(String(item.eventType || '').toLowerCase()))
      .map((item) => {
        const type = String(item.eventType || '').toLowerCase() as EntryType;
        const meta = getEntryTypeMeta(type);
        const data = parseJsonField(item.eventData);
        const quantityValue = Number(data.quantity || data.yieldKg || 0);

        let subtitle = data.notes || 'Activity logged';
        if (type === 'harvest') {
          subtitle = `${Number(data.yieldKg || quantityValue || 0).toLocaleString()} kg harvested`;
        } else if (type === 'mortality') {
          subtitle = `${Math.round(Number(data.quantity || 0)).toLocaleString()} fish recorded`;
        } else if (quantityValue > 0) {
          subtitle = `${quantityValue.toLocaleString()} ${meta.unit}`;
        }

        return {
          id: `history-${item.id}`,
          type,
          pondId: selectedPondId,
          pondName,
          title: meta.label,
          subtitle,
          createdAt: Number(item.createdAt || Date.now()),
          status: 'logged',
        } as HistoryRow;
      });

    return [...stockingRows, ...eventRows].sort((a, b) => b.createdAt - a.createdAt);
  }, [history, selectedPond, selectedPondId, stockings]);

  const matchesSharedFilters = useCallback(
    (pondId: string, type: EntryType, ts: number, status: string) => {
      if (filterPondId !== 'all' && pondId !== filterPondId) return false;
      if (filterType !== 'all' && type !== filterType) return false;
      if (!isMatchingDateFilter(ts, filterDate)) return false;
      if (filterStatus !== 'all' && status !== filterStatus) return false;
      return true;
    },
    [filterDate, filterPondId, filterStatus, filterType]
  );

  const filteredRecentEntries = useMemo(() => {
    return recentEntries
      .filter((entry) => matchesSharedFilters(entry.pondId, entry.type, entry.createdAt, entry.status))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [recentEntries, matchesSharedFilters]);

  const filteredHistoryRows = useMemo(() => {
    return historyRows
      .filter((entry) => matchesSharedFilters(entry.pondId, entry.type, entry.createdAt, entry.status))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [historyRows, matchesSharedFilters]);

  const queueEntries = useMemo(() => {
    return filteredRecentEntries.filter((entry) => entry.status !== 'synced');
  }, [filteredRecentEntries]);

  const groupedRecentEntries = useMemo(() => {
    const grouped: Record<'Today' | 'Yesterday' | 'Earlier', RecentEntry[]> = {
      Today: [],
      Yesterday: [],
      Earlier: [],
    };

    filteredRecentEntries.forEach((entry) => {
      grouped[getDateGroupLabel(entry.createdAt)].push(entry);
    });

    return grouped;
  }, [filteredRecentEntries]);

  const composerBottom = useMemo(() => {
    if (keyboardHeight > 0) {
      return Math.max(2, keyboardHeight - insets.bottom - 6);
    }
    return 6;
  }, [insets.bottom, keyboardHeight]);

  const contentBottomPadding = useMemo(() => {
    if (activeSegment !== 'log') return 28;
    if (keyboardHeight <= 0) return 188;
    return 188 + Math.max(0, keyboardHeight - 64);
  }, [activeSegment, keyboardHeight]);

  const hasFormData = Boolean(quantity || notes || species || averageWeight || source || fishCount);

  const pondFilterLabel =
    filterPondId === 'all'
      ? 'All ponds'
      : (ponds as any[]).find((pond) => pond.id === filterPondId)?.name || 'Selected pond';

  const typeFilterLabel = TYPE_FILTER_OPTIONS.find((item) => item.id === filterType)?.label || 'All Types';
  const dateFilterLabel = DATE_OPTIONS.find((item) => item.id === filterDate)?.label || 'Any Date';
  const statusFilterLabel = statusOptions.find((item) => item.id === filterStatus)?.label || 'Any Status';

  const renderSkeletonList = (count: number) => (
    <View>
      {Array.from({ length: count }).map((_, index) => (
        <View key={`skeleton-${index}`} style={styles.skeletonCard}>
          <View style={styles.skeletonAvatar} />
          <View style={styles.skeletonTextWrap}>
            <View style={styles.skeletonLineShort} />
            <View style={styles.skeletonLineLong} />
          </View>
        </View>
      ))}
    </View>
  );

  const renderPondStatus = () => {
    if (!selectedPond) return null;

    const isActive = Boolean((selectedPond as any).isActive);
    const pondSpecies = (selectedPond as any).currentSpecies;
    const count = Number((selectedPond as any).currentStockCount || 0);

    return (
      <View style={styles.pondStatusCard}>
        <View style={styles.statusHeader}>
          <View style={[styles.statusBadge, isActive ? styles.statusActive : styles.statusInactive]}>
            <Ionicons
              name={isActive ? 'checkmark-circle' : 'ellipse-outline'}
              size={14}
              color={isActive ? '#17803d' : '#6c757d'}
            />
            <Text style={[styles.statusText, isActive ? styles.statusActiveText : styles.statusInactiveText]}>
              {isActive ? 'Active' : 'Inactive'}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.historyButton}
            onPress={() => {
              setFilterPondId(selectedPondId || 'all');
              setActiveSegment('history');
            }}
          >
            <Ionicons name="time-outline" size={15} color="#0b6cd4" />
            <Text style={styles.historyButtonText}>Open History</Text>
          </TouchableOpacity>
        </View>

        {isActive ? (
          <View style={styles.stockInfo}>
            <View style={styles.stockRow}>
              <Ionicons name="fish-outline" size={16} color="#0b6cd4" />
              <Text style={styles.speciesText}>{pondSpecies || 'Species not set'}</Text>
            </View>
            <View style={styles.stockRow}>
              <Ionicons name="stats-chart-outline" size={16} color="#17803d" />
              <Text style={styles.countText}>{count > 0 ? `~${count.toLocaleString()} fish` : 'Stock count unknown'}</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.inactiveHint}>Inactive pond. Add stocking entry to activate cycle tracking.</Text>
        )}
      </View>
    );
  };

  const renderPondSelector = () => (
    <Modal
      visible={showPondSelector}
      animationType="slide"
      transparent
      onRequestClose={() => setShowPondSelector(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Pond</Text>
            <TouchableOpacity onPress={() => setShowPondSelector(false)}>
              <Ionicons name="close" size={24} color="#667085" />
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color="#98a2b3" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search ponds"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color="#98a2b3" />
              </TouchableOpacity>
            )}
          </View>

          <FlatList
            data={filteredPonds}
            keyExtractor={(item: any) => item.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }: { item: any }) => {
              const isSelected = selectedPondId === item.id;
              return (
                <TouchableOpacity
                  style={[styles.pondListItem, isSelected && styles.pondListItemSelected]}
                  onPress={() => {
                    setSelectedPondId(item.id);
                    setShowPondSelector(false);
                  }}
                >
                  <View style={[styles.pondIconContainer, isSelected && styles.pondIconContainerSelected]}>
                    <Ionicons name="water" size={21} color={isSelected ? '#0b6cd4' : '#667085'} />
                  </View>
                  <View style={styles.pondInfo}>
                    <Text style={[styles.pondListName, isSelected && styles.pondListNameSelected]}>{item.name}</Text>
                    <Text style={styles.pondListLocation} numberOfLines={1}>
                      {item.location}
                    </Text>
                  </View>
                  {isSelected && <Ionicons name="checkmark-circle" size={22} color="#0b6cd4" />}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={42} color="#c4c7cc" />
                <Text style={styles.emptyStateText}>No ponds found</Text>
              </View>
            }
          />
        </View>
      </View>
    </Modal>
  );

  const renderSpeciesSelector = () => (
    <Modal
      visible={showSpeciesSelector}
      animationType="slide"
      transparent
      onRequestClose={() => setShowSpeciesSelector(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {selectedType === 'harvest' ? 'Select Harvest Species' : 'Select Species'}
            </Text>
            <TouchableOpacity onPress={() => setShowSpeciesSelector(false)}>
              <Ionicons name="close" size={24} color="#667085" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={visibleSpeciesOptions}
            keyExtractor={(item) => item}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="fish-outline" size={42} color="#c4c7cc" />
                <Text style={styles.emptyStateText}>No active species available</Text>
              </View>
            }
            renderItem={({ item }) => {
              const isSelected = species === item;
              return (
                <TouchableOpacity
                  style={[styles.speciesItem, isSelected && styles.speciesItemSelected]}
                  onPress={() => {
                    setSpecies(item);
                    setShowSpeciesSelector(false);
                  }}
                >
                  <Ionicons name="fish" size={22} color={isSelected ? '#20c997' : '#667085'} />
                  <Text style={[styles.speciesListText, isSelected && styles.speciesListTextSelected]}>{item}</Text>
                  {isSelected && <Ionicons name="checkmark" size={20} color="#20c997" />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );

  const renderCompactFilters = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterRow}
      keyboardShouldPersistTaps="handled"
    >
      <TouchableOpacity
        style={styles.filterChip}
        onPress={() => setFilterPondId((prev) => cycleNext(prev, pondFilterOptions))}
      >
        <Ionicons name="water-outline" size={14} color="#0b6cd4" />
        <Text style={styles.filterChipLabel}>Pond</Text>
        <Text style={styles.filterChipValue} numberOfLines={1}>{pondFilterLabel}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.filterChip}
        onPress={() => setFilterType((prev) => cycleNext(prev, TYPE_FILTER_OPTIONS.map((item) => item.id)))}
      >
        <Ionicons name="funnel-outline" size={14} color="#7e22ce" />
        <Text style={styles.filterChipLabel}>Type</Text>
        <Text style={styles.filterChipValue} numberOfLines={1}>{typeFilterLabel}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.filterChip}
        onPress={() => setFilterDate((prev) => cycleNext(prev, DATE_OPTIONS.map((item) => item.id)))}
      >
        <Ionicons name="calendar-outline" size={14} color="#0369a1" />
        <Text style={styles.filterChipLabel}>Date</Text>
        <Text style={styles.filterChipValue} numberOfLines={1}>{dateFilterLabel}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.filterChip}
        onPress={() => setFilterStatus((prev) => cycleNext(prev, statusCycleValues))}
      >
        <Ionicons name="checkbox-outline" size={14} color="#0f766e" />
        <Text style={styles.filterChipLabel}>Status</Text>
        <Text style={styles.filterChipValue} numberOfLines={1}>{statusFilterLabel}</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  const rowCardWidth = Math.max(240, width - 32);

  const renderSwipeEntryRow = (entry: RecentEntry) => {
    const typeMeta = getEntryTypeMeta(entry.type);

    return (
      <View key={entry.id} style={styles.swipeRowContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          bounces={false}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          directionalLockEnabled
        >
          <View style={[styles.entryCard, { width: rowCardWidth, borderLeftColor: typeMeta.color }]}>
            <View style={[styles.entryIconWrap, { backgroundColor: `${typeMeta.color}20` }]}>
              <Ionicons name={typeMeta.icon as any} size={16} color={typeMeta.color} />
            </View>

            <View style={styles.entryInfo}>
              <Text style={styles.entryTypeText}>{typeMeta.label}</Text>
              <Text style={styles.entrySubText} numberOfLines={1}>
                {entry.pondName} • {formatQuantity(entry.quantityValue, entry.unit)}
              </Text>
              <Text style={styles.entryTimeText}>{formatEventDate(entry.createdAt)}</Text>
            </View>

            <View style={styles.entryStatusWrap}>
              <View
                style={[
                  styles.statusPill,
                  entry.status === 'queued'
                    ? styles.statusQueued
                    : entry.status === 'failed'
                      ? styles.statusFailed
                      : styles.statusSynced,
                ]}
              >
                <Text
                  style={[
                    styles.statusPillText,
                    entry.status === 'queued'
                      ? styles.statusQueuedText
                      : entry.status === 'failed'
                        ? styles.statusFailedText
                        : styles.statusSyncedText,
                  ]}
                >
                  {entry.status}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.swipeActions}>
            <TouchableOpacity style={[styles.swipeActionButton, styles.editAction]} onPress={() => handleEditEntry(entry)}>
              <Ionicons name="create-outline" size={16} color="#fff" />
              <Text style={styles.swipeActionText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.swipeActionButton, styles.duplicateAction]}
              onPress={() => handleDuplicateEntry(entry)}
            >
              <Ionicons name="copy-outline" size={16} color="#fff" />
              <Text style={styles.swipeActionText}>Duplicate</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.swipeActionButton, styles.deleteAction]} onPress={() => handleDeleteEntry(entry.id)}>
              <Ionicons name="trash-outline" size={16} color="#fff" />
              <Text style={styles.swipeActionText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  };

  const renderLogSegment = () => (
    <View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Report Type</Text>
        <View style={styles.typeGrid}>
          {ENTRY_TYPES.map((type) => {
            const isSelected = selectedType === type.id;
            return (
              <TouchableOpacity
                key={type.id}
                style={[
                  styles.typeButton,
                  isSelected && {
                    backgroundColor: `${type.color}14`,
                    borderColor: type.color,
                  },
                ]}
                onPress={() => setSelectedType(type.id)}
              >
                <View style={[styles.typeIconContainer, isSelected && { backgroundColor: `${type.color}25` }]}>
                  <Ionicons name={type.icon as any} size={20} color={isSelected ? type.color : '#667085'} />
                </View>
                <Text style={[styles.typeLabel, isSelected && { color: type.color, fontWeight: '700' }]}>{type.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Pond</Text>
        {ponds.length === 0 ? (
          <View style={styles.emptyPonds}>
            <Ionicons name="water-outline" size={36} color="#c4c7cc" />
            <Text style={styles.emptyText}>No ponds available</Text>
            <Text style={styles.emptySubtext}>Create ponds in Map tab first.</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.pondSelectorCard} onPress={() => setShowPondSelector(true)}>
            {selectedPond ? (
              <>
                <View style={styles.selectedPondIcon}>
                  <Ionicons name="water" size={24} color="#0b6cd4" />
                </View>
                <View style={styles.selectedPondInfo}>
                  <Text style={styles.selectedPondName}>{(selectedPond as any).name}</Text>
                  <Text style={styles.selectedPondLocation} numberOfLines={1}>
                    {(selectedPond as any).location}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#98a2b3" />
              </>
            ) : (
              <>
                <View style={styles.selectPondIcon}>
                  <Ionicons name="add-circle-outline" size={24} color="#0b6cd4" />
                </View>
                <Text style={styles.selectPondText}>Select a pond</Text>
                <Ionicons name="chevron-forward" size={18} color="#98a2b3" />
              </>
            )}
          </TouchableOpacity>
        )}

        {selectedPond && renderPondStatus()}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Details</Text>
        <View style={styles.readinessRow}>
          <View style={[styles.readinessChip, selectedPondId ? styles.readinessChipDone : styles.readinessChipPending]}>
            <Ionicons
              name={selectedPondId ? 'checkmark-circle' : 'ellipse-outline'}
              size={13}
              color={selectedPondId ? '#17803d' : '#667085'}
            />
            <Text style={[styles.readinessText, selectedPondId ? styles.readinessTextDone : styles.readinessTextPending]}>
              Pond
            </Text>
          </View>

          <View style={[styles.readinessChip, quantity ? styles.readinessChipDone : styles.readinessChipPending]}>
            <Ionicons
              name={quantity ? 'checkmark-circle' : 'ellipse-outline'}
              size={13}
              color={quantity ? '#17803d' : '#667085'}
            />
            <Text style={[styles.readinessText, quantity ? styles.readinessTextDone : styles.readinessTextPending]}>
              Quantity
            </Text>
          </View>
        </View>

        {(selectedType === 'stocking' || selectedType === 'harvest') && (
          <View
            style={styles.inputGroup}
            onLayout={(event) => registerFieldLayout('species', event.nativeEvent.layout.y)}
          >
            <Text style={styles.label}>Fish Species</Text>
            <TouchableOpacity
              style={[
                styles.speciesSelector,
                (isHarvestSpeciesLocked || isHarvestSpeciesUnavailable) && styles.speciesSelectorDisabled,
              ]}
              onPress={() => setShowSpeciesSelector(true)}
              disabled={isHarvestSpeciesLocked || isHarvestSpeciesUnavailable}
            >
              <Ionicons name="fish-outline" size={18} color="#667085" />
              <Text style={[styles.speciesSelectorText, !speciesFieldValue && styles.speciesPlaceholder]}>
                {speciesFieldValue || speciesPlaceholderText}
              </Text>
              <Ionicons
                name={
                  isHarvestSpeciesUnavailable
                    ? 'ban-outline'
                    : isHarvestSpeciesLocked
                      ? 'checkmark-circle'
                      : 'chevron-down'
                }
                size={18}
                color={
                  isHarvestSpeciesUnavailable
                    ? '#98a2b3'
                    : isHarvestSpeciesLocked
                      ? '#17803d'
                      : '#98a2b3'
                }
              />
            </TouchableOpacity>
            {isHarvestSpeciesUnavailable ? (
              <Text style={styles.fieldHint}>This pond has no active stocked species. Stock fish first or select another pond.</Text>
            ) : null}
            {selectedType === 'harvest' && harvestSpeciesOptions.length > 1 ? (
              <Text style={styles.fieldHint}>Choose from the species currently stocked in this pond.</Text>
            ) : null}
            {isHarvestSpeciesLocked ? (
              <Text style={styles.fieldHint}>Detected automatically from this pond's active stock.</Text>
            ) : null}
          </View>
        )}

        <View
          style={styles.inputGroup}
          onLayout={(event) => registerFieldLayout('quantity', event.nativeEvent.layout.y)}
        >
          <Text style={styles.label}>{getUnitLabel(selectedType)}</Text>
          <TextInput
            style={styles.input}
            value={quantity}
            onChangeText={setQuantity}
            placeholder="Enter amount"
            keyboardType="numeric"
            placeholderTextColor="#98a2b3"
            onFocus={() => focusField('quantity')}
          />

          <View style={styles.quickAddContainer}>
            {getQuickAddValues(selectedType).map((value) => (
              <TouchableOpacity key={value} style={styles.quickAddButton} onPress={() => setQuantity(value)}>
                <Text style={styles.quickAddText}>{value}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {selectedType === 'stocking' && (
          <>
            <View
              style={styles.inputGroup}
              onLayout={(event) => registerFieldLayout('averageWeight', event.nativeEvent.layout.y)}
            >
              <View style={styles.labelRow}>
                <Text style={styles.label}>Average Weight</Text>
                <Text style={styles.optionalLabel}>Optional (g)</Text>
              </View>
              <TextInput
                style={styles.input}
                value={averageWeight}
                onChangeText={setAverageWeight}
                placeholder="e.g. 5"
                keyboardType="numeric"
                placeholderTextColor="#98a2b3"
                onFocus={() => focusField('averageWeight')}
              />
            </View>

            <View
              style={styles.inputGroup}
              onLayout={(event) => registerFieldLayout('source', event.nativeEvent.layout.y)}
            >
              <View style={styles.labelRow}>
                <Text style={styles.label}>Source</Text>
                <Text style={styles.optionalLabel}>Optional</Text>
              </View>
              <TextInput
                style={styles.input}
                value={source}
                onChangeText={setSource}
                placeholder="Hatchery or supplier"
                placeholderTextColor="#98a2b3"
                onFocus={() => focusField('source')}
              />
            </View>
          </>
        )}

        {selectedType === 'harvest' && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Harvest Type</Text>
            <View style={styles.harvestTypeContainer}>
              <TouchableOpacity
                style={[styles.harvestTypeButton, isPartialHarvest && styles.harvestTypeButtonActive]}
                onPress={() => setIsPartialHarvest(true)}
              >
                <Text style={[styles.harvestTypeText, isPartialHarvest && styles.harvestTypeTextActive]}>Partial</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.harvestTypeButton, !isPartialHarvest && styles.harvestTypeButtonActive]}
                onPress={() => setIsPartialHarvest(false)}
              >
                <Text style={[styles.harvestTypeText, !isPartialHarvest && styles.harvestTypeTextActive]}>Full</Text>
              </TouchableOpacity>
            </View>

            {isPartialHarvest && (
              <View style={{ marginTop: 10 }}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>Fish Count</Text>
                  <Text style={styles.optionalLabel}>Optional</Text>
                </View>
                <TextInput
                  style={styles.input}
                  value={fishCount}
                  onChangeText={setFishCount}
                  placeholder="Enter fish count"
                  keyboardType="numeric"
                  placeholderTextColor="#98a2b3"
                  onFocus={() => focusField('fishCount')}
                />
              </View>
            )}
          </View>
        )}

        <View
          style={styles.inputGroup}
          onLayout={(event) => registerFieldLayout('notes', event.nativeEvent.layout.y)}
        >
          <View style={styles.labelRow}>
            <Text style={styles.label}>Notes</Text>
            <Text style={styles.optionalLabel}>Optional</Text>
          </View>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Observations, weather, behavior..."
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            placeholderTextColor="#98a2b3"
            onFocus={() => focusField('notes')}
          />
        </View>
      </View>
    </View>
  );

  const renderRecentSegment = () => (
    <View>
      {renderCompactFilters()}

      {recentLoading ? (
        renderSkeletonList(4)
      ) : (
        <View>
          {(['Today', 'Yesterday', 'Earlier'] as const).map((group) => {
            const entries = groupedRecentEntries[group];
            if (entries.length === 0) return null;

            const expanded = collapsedGroups[group];

            return (
              <View key={group} style={styles.groupSection}>
                <TouchableOpacity
                  style={styles.groupHeader}
                  onPress={() => setCollapsedGroups((prev) => ({ ...prev, [group]: !prev[group] }))}
                >
                  <Text style={styles.groupTitle}>{group}</Text>
                  <View style={styles.groupCountWrap}>
                    <Text style={styles.groupCountText}>{entries.length}</Text>
                    <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="#667085" />
                  </View>
                </TouchableOpacity>

                {expanded && entries.map((entry) => renderSwipeEntryRow(entry))}
              </View>
            );
          })}

          {filteredRecentEntries.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="time-outline" size={42} color="#c4c7cc" />
              <Text style={styles.emptyStateText}>No recent entries</Text>
              <Text style={styles.emptyStateSubtext}>Save a log entry to see it here.</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );

  const renderHistorySegment = () => (
    <View>
      {renderCompactFilters()}

      {!selectedPondId ? (
        <View style={styles.emptyState}>
          <Ionicons name="water-outline" size={42} color="#c4c7cc" />
          <Text style={styles.emptyStateText}>Pick a pond to view history</Text>
          <TouchableOpacity style={styles.pickPondButton} onPress={() => setShowPondSelector(true)}>
            <Text style={styles.pickPondButtonText}>Select Pond</Text>
          </TouchableOpacity>
        </View>
      ) : isHistoryBusy ? (
        renderSkeletonList(5)
      ) : (
        <View>
          {filteredHistoryRows.map((item) => {
            const meta = getEntryTypeMeta(item.type);
            return (
              <View key={item.id} style={[styles.historyCard, { borderLeftColor: meta.color }]}>
                <View style={[styles.historyIconContainer, { backgroundColor: `${meta.color}20` }]}>
                  <Ionicons name={meta.icon as any} size={16} color={meta.color} />
                </View>
                <View style={styles.historyInfo}>
                  <Text style={styles.historyTitle}>{item.title}</Text>
                  <Text style={styles.historySubtitle}>{item.subtitle}</Text>
                  <Text style={styles.historyDate}>{formatEventDate(item.createdAt)}</Text>
                </View>
                <View style={[styles.statusPill, item.status === 'active' ? styles.statusActiveLite : item.status === 'harvested' ? styles.statusHarvestedLite : styles.statusLoggedLite]}>
                  <Text style={styles.statusPillMiniText}>{item.status}</Text>
                </View>
              </View>
            );
          })}

          {filteredHistoryRows.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="library-outline" size={42} color="#c4c7cc" />
              <Text style={styles.emptyStateText}>No matching history</Text>
              <Text style={styles.emptyStateSubtext}>Try another filter combination.</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );

  const renderQueueSegment = () => (
    <View>
      {renderCompactFilters()}

      <View style={styles.queueSummaryCard}>
        <View>
          <Text style={styles.queueSummaryTitle}>Sync Queue</Text>
          <Text style={styles.queueSummarySub}>Local unresolved: {queuePendingCount}</Text>
          <Text style={styles.queueSummarySub}>Last sync: {lastSync ? formatEventDate(lastSync.getTime()) : 'Never'}</Text>
        </View>

        <TouchableOpacity style={styles.queueSyncButton} onPress={handleRetrySync} disabled={isSyncing}>
          {isSyncing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.queueSyncButtonText}>Sync Now</Text>}
        </TouchableOpacity>
      </View>

      {recentLoading ? (
        renderSkeletonList(3)
      ) : (
        <View>
          {queueEntries.map((entry) => renderSwipeEntryRow(entry))}

          {queueEntries.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="cloud-done-outline" size={42} color="#c4c7cc" />
              <Text style={styles.emptyStateText}>Queue is clear</Text>
              <Text style={styles.emptyStateSubtext}>No unsynced entries for current filters.</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {toast && (
        <View
          style={[
            styles.toast,
            toast.type === 'success' ? styles.toastSuccess : toast.type === 'error' ? styles.toastError : styles.toastInfo,
          ]}
        >
          <Ionicons
            name={toast.type === 'success' ? 'checkmark-circle' : toast.type === 'error' ? 'alert-circle' : 'information-circle'}
            size={18}
            color="#fff"
          />
          <Text style={styles.toastText}>{toast.message}</Text>
        </View>
      )}

      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Data</Text>
          <Text style={styles.subtitle}>Record and track pond operations</Text>
        </View>
        <View style={styles.dateBadge}>
          <Ionicons name="calendar-outline" size={13} color="#0b6cd4" />
          <Text style={styles.dateBadgeText}>{formatBadgeDate(new Date())}</Text>
        </View>
      </View>

      <View style={styles.segmentBar}>
        {SEGMENTS.map((segment) => {
          const active = activeSegment === segment.id;
          return (
            <TouchableOpacity
              key={segment.id}
              style={[styles.segmentButton, active && styles.segmentButtonActive]}
              onPress={() => {
                setActiveSegment(segment.id);
                setFilterStatus('all');
              }}
            >
              <Ionicons name={segment.icon as any} size={14} color={active ? '#0b6cd4' : '#667085'} />
              <Text style={[styles.segmentButtonText, active && styles.segmentButtonTextActive]}>{segment.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={{ padding: 16, paddingBottom: contentBottomPadding }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {activeSegment === 'log' && renderLogSegment()}
        {activeSegment === 'recent' && renderRecentSegment()}
        {activeSegment === 'history' && renderHistorySegment()}
        {activeSegment === 'queue' && renderQueueSegment()}
      </ScrollView>

      {activeSegment === 'log' && (
        <View style={[styles.stickyComposer, { bottom: composerBottom }]}>
          <TouchableOpacity
            style={[
              styles.saveButton,
              styles.saveButtonSecondary,
              (!selectedPondId || !quantity || loading) && styles.saveButtonDisabled,
            ]}
            onPress={() => submitEntry('save')}
            disabled={!selectedPondId || !quantity || loading}
          >
            {loading ? <ActivityIndicator size="small" color="#0b6cd4" /> : <Text style={styles.saveButtonSecondaryText}>Save</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.saveButton,
              { backgroundColor: currentType.color },
              (!selectedPondId || !quantity || loading) && styles.saveButtonDisabled,
            ]}
            onPress={() => submitEntry('save_add')}
            disabled={!selectedPondId || !quantity || loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Save & Add Another</Text>
            )}
          </TouchableOpacity>

          {hasFormData && !loading && (
            <TouchableOpacity style={styles.resetInlineButton} onPress={resetFormFields}>
              <Ionicons name="refresh-outline" size={15} color="#475467" />
              <Text style={styles.resetInlineText}>Reset</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {renderPondSelector()}
      {renderSpeciesSelector()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f8fb',
  },
  toast: {
    position: 'absolute',
    top: 54,
    left: 16,
    right: 16,
    zIndex: 1000,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
  toastSuccess: {
    backgroundColor: '#17803d',
  },
  toastError: {
    backgroundColor: '#c92a2a',
  },
  toastInfo: {
    backgroundColor: '#0b6cd4',
  },
  toastText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 25,
    fontWeight: '800',
    color: '#111827',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    color: '#667085',
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#e6f2ff',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  dateBadgeText: {
    color: '#0b6cd4',
    fontSize: 12,
    fontWeight: '700',
  },
  segmentBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  segmentButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d5dbe3',
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 6,
  },
  segmentButtonActive: {
    borderColor: '#8cc2ff',
    backgroundColor: '#eaf4ff',
  },
  segmentButtonText: {
    fontSize: 11,
    color: '#667085',
    fontWeight: '600',
  },
  segmentButtonTextActive: {
    color: '#0b6cd4',
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#667085',
    textTransform: 'uppercase',
    marginBottom: 10,
    letterSpacing: 0.4,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeButton: {
    width: '31.8%',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  typeIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f2f4f7',
    marginBottom: 6,
  },
  typeLabel: {
    fontSize: 10,
    color: '#667085',
    textAlign: 'center',
    fontWeight: '600',
  },
  pondSelectorCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#d0d8e2',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedPondIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#eaf4ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectPondIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedPondInfo: {
    flex: 1,
    marginLeft: 10,
  },
  selectedPondName: {
    fontSize: 15,
    color: '#1f2937',
    fontWeight: '700',
  },
  selectedPondLocation: {
    marginTop: 2,
    fontSize: 12,
    color: '#667085',
  },
  selectPondText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: '#0b6cd4',
    fontWeight: '600',
  },
  emptyPonds: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 26,
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 8,
    fontSize: 14,
    color: '#667085',
    fontWeight: '600',
  },
  emptySubtext: {
    marginTop: 2,
    fontSize: 12,
    color: '#98a2b3',
  },
  pondStatusCard: {
    marginTop: 10,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  statusActive: {
    backgroundColor: '#dbfce7',
  },
  statusInactive: {
    backgroundColor: '#edf2f7',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statusActiveText: {
    color: '#17803d',
  },
  statusInactiveText: {
    color: '#667085',
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#eaf4ff',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  historyButtonText: {
    fontSize: 11,
    color: '#0b6cd4',
    fontWeight: '700',
  },
  stockInfo: {
    gap: 6,
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  speciesText: {
    fontSize: 13,
    color: '#1f2937',
    fontWeight: '600',
  },
  countText: {
    fontSize: 12,
    color: '#475467',
  },
  inactiveHint: {
    fontSize: 12,
    color: '#667085',
  },
  readinessRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  readinessChip: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  readinessChipDone: {
    backgroundColor: '#dbfce7',
  },
  readinessChipPending: {
    backgroundColor: '#edf2f7',
  },
  readinessText: {
    fontSize: 11,
    fontWeight: '700',
  },
  readinessTextDone: {
    color: '#17803d',
  },
  readinessTextPending: {
    color: '#667085',
  },
  inputGroup: {
    marginBottom: 14,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 13,
    color: '#1f2937',
    fontWeight: '700',
    marginBottom: 7,
  },
  optionalLabel: {
    fontSize: 11,
    color: '#98a2b3',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbe3ec',
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#1f2937',
    fontSize: 15,
  },
  textArea: {
    minHeight: 90,
  },
  quickAddContainer: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 8,
  },
  quickAddButton: {
    backgroundColor: '#edf5ff',
    borderColor: '#c9ddfb',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  quickAddText: {
    color: '#0b6cd4',
    fontSize: 12,
    fontWeight: '700',
  },
  speciesSelector: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbe3ec',
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  speciesSelectorDisabled: {
    backgroundColor: '#f8fafc',
  },
  speciesSelectorText: {
    flex: 1,
    color: '#1f2937',
    fontSize: 14,
  },
  speciesPlaceholder: {
    color: '#98a2b3',
  },
  fieldHint: {
    marginTop: 6,
    fontSize: 12,
    color: '#667085',
  },
  harvestTypeContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  harvestTypeButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dbe3ec',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    paddingVertical: 10,
  },
  harvestTypeButtonActive: {
    backgroundColor: '#17803d',
    borderColor: '#17803d',
  },
  harvestTypeText: {
    color: '#667085',
    fontSize: 13,
    fontWeight: '700',
  },
  harvestTypeTextActive: {
    color: '#fff',
  },
  filterRow: {
    gap: 8,
    paddingBottom: 12,
  },
  filterChip: {
    minWidth: 118,
    maxWidth: 170,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbe3ec',
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 1,
  },
  filterChipLabel: {
    fontSize: 10,
    color: '#98a2b3',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  filterChipValue: {
    fontSize: 12,
    color: '#1f2937',
    fontWeight: '600',
  },
  groupSection: {
    marginBottom: 14,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#344054',
  },
  groupCountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  groupCountText: {
    fontSize: 12,
    color: '#667085',
    fontWeight: '600',
  },
  swipeRowContainer: {
    marginBottom: 8,
  },
  entryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbe3ec',
    borderLeftWidth: 4,
    paddingVertical: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  entryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryInfo: {
    flex: 1,
    marginLeft: 9,
  },
  entryTypeText: {
    fontSize: 13,
    color: '#1f2937',
    fontWeight: '700',
  },
  entrySubText: {
    marginTop: 1,
    fontSize: 12,
    color: '#475467',
  },
  entryTimeText: {
    marginTop: 2,
    fontSize: 11,
    color: '#98a2b3',
  },
  entryStatusWrap: {
    marginLeft: 6,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusQueued: {
    backgroundColor: '#fff7cc',
  },
  statusSynced: {
    backgroundColor: '#def7e4',
  },
  statusFailed: {
    backgroundColor: '#fde1e1',
  },
  statusQueuedText: {
    color: '#a16207',
  },
  statusSyncedText: {
    color: '#137333',
  },
  statusFailedText: {
    color: '#b42318',
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  swipeActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginLeft: 8,
    borderRadius: 12,
    overflow: 'hidden',
    height: 54,
    alignSelf: 'center',
  },
  swipeActionButton: {
    width: 78,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  editAction: {
    backgroundColor: '#0b6cd4',
  },
  duplicateAction: {
    backgroundColor: '#7e22ce',
  },
  deleteAction: {
    backgroundColor: '#c92a2a',
  },
  swipeActionText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  historyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbe3ec',
    borderLeftWidth: 4,
    marginBottom: 8,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyInfo: {
    flex: 1,
    marginLeft: 9,
  },
  historyTitle: {
    fontSize: 13,
    color: '#1f2937',
    fontWeight: '700',
  },
  historySubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#475467',
  },
  historyDate: {
    marginTop: 2,
    fontSize: 11,
    color: '#98a2b3',
  },
  statusPillMiniText: {
    fontSize: 10,
    color: '#344054',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statusActiveLite: {
    backgroundColor: '#dbfce7',
  },
  statusHarvestedLite: {
    backgroundColor: '#f2f4f7',
  },
  statusLoggedLite: {
    backgroundColor: '#eaf4ff',
  },
  queueSummaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbe3ec',
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  queueSummaryTitle: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '800',
  },
  queueSummarySub: {
    marginTop: 2,
    fontSize: 11,
    color: '#667085',
    fontWeight: '600',
  },
  queueSyncButton: {
    borderRadius: 10,
    backgroundColor: '#0b6cd4',
    paddingHorizontal: 12,
    paddingVertical: 9,
    minWidth: 90,
    alignItems: 'center',
  },
  queueSyncButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  skeletonCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e8edf3',
    padding: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  skeletonAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#edf2f7',
  },
  skeletonTextWrap: {
    flex: 1,
    marginLeft: 10,
    gap: 6,
  },
  skeletonLineShort: {
    width: '36%',
    height: 8,
    borderRadius: 4,
    backgroundColor: '#edf2f7',
  },
  skeletonLineLong: {
    width: '76%',
    height: 8,
    borderRadius: 4,
    backgroundColor: '#edf2f7',
  },
  stickyComposer: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderTopWidth: 1,
    borderTopColor: '#dde3ea',
    paddingTop: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  saveButton: {
    flex: 1,
    borderRadius: 10,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonSecondary: {
    backgroundColor: '#edf5ff',
    borderWidth: 1,
    borderColor: '#bfd8ff',
    flex: 0.7,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  saveButtonSecondaryText: {
    color: '#0b6cd4',
    fontSize: 13,
    fontWeight: '700',
  },
  saveButtonDisabled: {
    opacity: 0.45,
  },
  resetInlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d0d8e2',
    backgroundColor: '#f8fafc',
  },
  resetInlineText: {
    color: '#475467',
    fontSize: 11,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '75%',
    minHeight: '52%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eff3f7',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1f2937',
  },
  searchContainer: {
    margin: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dbe3ec',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    color: '#1f2937',
    fontSize: 14,
  },
  pondListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f4f7',
  },
  pondListItemSelected: {
    backgroundColor: '#eff6ff',
  },
  pondIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f2f4f7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pondIconContainerSelected: {
    backgroundColor: '#e3f0ff',
  },
  pondInfo: {
    flex: 1,
    marginLeft: 10,
  },
  pondListName: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '700',
  },
  pondListNameSelected: {
    color: '#0b6cd4',
  },
  pondListLocation: {
    marginTop: 2,
    fontSize: 12,
    color: '#667085',
  },
  speciesItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f4f7',
  },
  speciesItemSelected: {
    backgroundColor: '#ecfdf6',
  },
  speciesListText: {
    flex: 1,
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '600',
  },
  speciesListTextSelected: {
    color: '#17803d',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyStateText: {
    marginTop: 10,
    fontSize: 15,
    color: '#667085',
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyStateSubtext: {
    marginTop: 4,
    fontSize: 12,
    color: '#98a2b3',
    textAlign: 'center',
  },
  pickPondButton: {
    marginTop: 12,
    borderRadius: 10,
    backgroundColor: '#0b6cd4',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  pickPondButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});
