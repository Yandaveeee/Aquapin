import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useAppearance } from '../../contexts/AppearanceContext';
import { useFarmOverview, usePonds, useSync } from '../../hooks';
import { clearLocalDatabase } from '../../db';
import { supabase } from '../../lib/supabase';
import {
  buildOperationsReport,
  renderOperationsReportCsv,
  renderOperationsReportHtml,
  renderOperationsReportText,
  ReportRange,
} from '../../lib/reporting';
import { aquapinColors, formatRelativeTime, formatWholeNumber } from '../../theme/aquapin';

type Language = 'en' | 'fil';
type WeightUnit = 'kg' | 'g';
type FishCountFormat = 'full' | 'compact';
type ReportAction = 'csv' | 'pdf';

interface NotificationSettings {
  harvestReminders: boolean;
  mortalityAlerts: boolean;
  syncNotifications: boolean;
  weeklyReports: boolean;
}

interface PondAlertSettings {
  mortalitySpike: boolean;
  harvestDue: boolean;
  inactivity: boolean;
}

interface SecuritySettings {
  biometricLogin: boolean;
  pinProtection: boolean;
}

interface PreferenceSettings {
  language: Language;
  weightUnit: WeightUnit;
  fishCountFormat: FishCountFormat;
}

const PROFILE_NOTIFICATION_KEY = '@aquapin_profile_notifications';
const PROFILE_POND_ALERTS_KEY = '@aquapin_profile_pond_alerts';
const PROFILE_SECURITY_KEY = '@aquapin_profile_security';
const PROFILE_PIN_KEY = '@aquapin_profile_pin';
const PROFILE_PREFS_KEY = '@aquapin_profile_preferences';
const PROFILE_LOGS_KEY = '@aquapin_profile_logs';
const PROFILE_BACKUP_KEY = '@aquapin_profile_backup_latest';

const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  harvestReminders: true,
  mortalityAlerts: true,
  syncNotifications: true,
  weeklyReports: false,
};

const DEFAULT_POND_ALERTS: PondAlertSettings = {
  mortalitySpike: true,
  harvestDue: true,
  inactivity: true,
};

const DEFAULT_SECURITY: SecuritySettings = {
  biometricLogin: false,
  pinProtection: false,
};

const DEFAULT_PREFERENCES: PreferenceSettings = {
  language: 'en',
  weightUnit: 'kg',
  fishCountFormat: 'full',
};

const FAQ_ITEMS = [
  {
    id: 'faq-1',
    question: 'How do I create a pond?',
    answer: 'Open Ponds, choose GPS map or polygon creation, then save the pond details.',
  },
  {
    id: 'faq-2',
    question: 'How do I log stocking, mortality, or harvest?',
    answer: 'Use the center add button or Records module, select a pond, and save the record.',
  },
  {
    id: 'faq-3',
    question: 'How does offline sync work?',
    answer: 'Aquapin saves records locally first and pushes queued changes when connectivity returns.',
  },
  {
    id: 'faq-4',
    question: 'Can I export reports?',
    answer: 'Use the Data Tools section to export CSV, PDF, or text summaries.',
  },
];

function formatDateTime(value: Date | null): string {
  if (!value) return 'Never';
  return value.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCount(value: number, compact: boolean): string {
  return compact ? value.toLocaleString('en', { notation: 'compact' }) : value.toLocaleString();
}

function buildMailTo(subject: string, body: string): string {
  return `mailto:support@aquapin.app?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default function ProfileOverviewScreen() {
  const { user, signOut } = useAuth();
  const { appearanceMode, setAppearanceMode } = useAppearance();
  const overview = useFarmOverview();
  const { ponds } = usePonds();
  const {
    isOnline,
    isSyncing,
    lastSync,
    pendingChanges,
    queueSnapshot,
    performSync,
  } = useSync();

  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationSettings>(DEFAULT_NOTIFICATIONS);
  const [pondAlerts, setPondAlerts] = useState<Record<string, PondAlertSettings>>({});
  const [security, setSecurity] = useState<SecuritySettings>(DEFAULT_SECURITY);
  const [preferences, setPreferences] = useState<PreferenceSettings>(DEFAULT_PREFERENCES);
  const [recentLogs, setRecentLogs] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [reportAction, setReportAction] = useState<ReportAction | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pinCode, setPinCode] = useState<string | null>(null);
  const [pinSetupA, setPinSetupA] = useState('');
  const [pinSetupB, setPinSetupB] = useState('');
  const [pinUnlockInput, setPinUnlockInput] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [faqQuery, setFaqQuery] = useState('');
  const [feedbackText, setFeedbackText] = useState('');

  const compactCount = preferences.fishCountFormat === 'compact';
  const pendingTotal = pendingChanges.ponds + pendingChanges.entries;
  const appLanguageLabel = preferences.language === 'fil' ? 'Tagalog' : 'English';
  const appearanceLabel = appearanceMode === 'dark' ? 'Dark Mode' : 'Light Mode';
  const loadingCopy = reportAction ? 'Preparing report...' : 'Processing action...';

  const farmStats = useMemo(() => {
    const active = (ponds as any[]).filter((pond) => pond.isActive).length;
    const inactive = ponds.length - active;
    const speciesSet = new Set(
      (ponds as any[])
        .map((pond) => String(pond.currentSpecies || '').trim())
        .filter(Boolean)
    );

    return {
      total: ponds.length,
      active,
      inactive,
      speciesCount: speciesSet.size,
    };
  }, [ponds]);

  const filteredFaq = useMemo(() => {
    const query = faqQuery.trim().toLowerCase();
    if (!query) return FAQ_ITEMS;
    return FAQ_ITEMS.filter((item) => (
      item.question.toLowerCase().includes(query) || item.answer.toLowerCase().includes(query)
    ));
  }, [faqQuery]);

  const reportRangeOptions: Array<{ id: ReportRange; label: string }> = [
    { id: 'today', label: 'Today' },
    { id: '7d', label: 'Last 7 Days' },
    { id: '30d', label: 'Last 30 Days' },
    { id: 'all', label: 'All Time' },
  ];

  const logAction = useCallback(async (message: string) => {
    const stamp = new Date().toLocaleString('en-PH', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const next = [`[${stamp}] ${message}`, ...recentLogs].slice(0, 30);
    setRecentLogs(next);
    await AsyncStorage.setItem(PROFILE_LOGS_KEY, JSON.stringify(next));
  }, [recentLogs]);

  const getPondAlertConfig = useCallback((pondId: string): PondAlertSettings => {
    return pondAlerts[pondId] || DEFAULT_POND_ALERTS;
  }, [pondAlerts]);

  const setPondAlertField = useCallback((pondId: string, key: keyof PondAlertSettings, value: boolean) => {
    setPondAlerts((prev) => {
      const existing = prev[pondId] || DEFAULT_POND_ALERTS;
      return {
        ...prev,
        [pondId]: {
          ...existing,
          [key]: value,
        },
      };
    });
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadProfileSettings = async () => {
      try {
        const [notificationRaw, pondAlertsRaw, securityRaw, pinRaw, prefsRaw, logsRaw] = await Promise.all([
          AsyncStorage.getItem(PROFILE_NOTIFICATION_KEY),
          AsyncStorage.getItem(PROFILE_POND_ALERTS_KEY),
          AsyncStorage.getItem(PROFILE_SECURITY_KEY),
          AsyncStorage.getItem(PROFILE_PIN_KEY),
          AsyncStorage.getItem(PROFILE_PREFS_KEY),
          AsyncStorage.getItem(PROFILE_LOGS_KEY),
        ]);

        if (!mounted) return;

        if (notificationRaw) setNotifications({ ...DEFAULT_NOTIFICATIONS, ...JSON.parse(notificationRaw) });
        if (pondAlertsRaw) setPondAlerts(JSON.parse(pondAlertsRaw));
        if (securityRaw) setSecurity({ ...DEFAULT_SECURITY, ...JSON.parse(securityRaw) });
        if (pinRaw) setPinCode(pinRaw);
        if (prefsRaw) setPreferences({ ...DEFAULT_PREFERENCES, ...JSON.parse(prefsRaw) });
        if (logsRaw) setRecentLogs(JSON.parse(logsRaw));
      } finally {
        if (mounted) setHydrated(true);
      }
    };

    void loadProfileSettings();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void AsyncStorage.setItem(PROFILE_NOTIFICATION_KEY, JSON.stringify(notifications));
  }, [hydrated, notifications]);

  useEffect(() => {
    if (!hydrated) return;
    void AsyncStorage.setItem(PROFILE_POND_ALERTS_KEY, JSON.stringify(pondAlerts));
  }, [hydrated, pondAlerts]);

  useEffect(() => {
    if (!hydrated) return;
    void AsyncStorage.setItem(PROFILE_SECURITY_KEY, JSON.stringify(security));
  }, [hydrated, security]);

  useEffect(() => {
    if (!hydrated) return;
    void AsyncStorage.setItem(PROFILE_PREFS_KEY, JSON.stringify(preferences));
  }, [hydrated, preferences]);

  useEffect(() => {
    if (!hydrated) return;
    setIsLocked(Boolean(security.pinProtection && pinCode));
  }, [hydrated, pinCode, security.pinProtection]);

  useEffect(() => {
    if (!hydrated) return;
    setPondAlerts((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const pond of ponds as any[]) {
        if (!next[pond.id]) {
          next[pond.id] = { ...DEFAULT_POND_ALERTS };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [hydrated, ponds]);

  const closeModal = () => {
    setActiveModal(null);
    setReportAction(null);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setFeedbackText('');
    setFaqQuery('');
  };

  const authenticateBiometric = useCallback(async (): Promise<boolean> => {
    try {
      const dynamicRequire = (globalThis as any).require || ((0, eval)('require') as any);
      const LocalAuthentication = dynamicRequire('expo-local-authentication');
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) {
        Alert.alert('Unavailable', 'Biometric hardware not detected on this device.');
        return false;
      }

      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!enrolled) {
        Alert.alert('Unavailable', 'No biometrics enrolled on this device.');
        return false;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to continue',
        disableDeviceFallback: false,
      });
      return Boolean(result.success);
    } catch (_error) {
      Alert.alert('Biometric Module Missing', 'Install expo-local-authentication in your build to enable biometric login.');
      return false;
    }
  }, []);

  const handleToggleBiometric = async (value: boolean) => {
    if (!value) {
      setSecurity((prev) => ({ ...prev, biometricLogin: false }));
      await logAction('Biometric login disabled');
      return;
    }

    const ok = await authenticateBiometric();
    if (!ok) return;
    setSecurity((prev) => ({ ...prev, biometricLogin: true }));
    await logAction('Biometric login enabled');
  };

  const handlePinToggle = async (value: boolean) => {
    if (value) {
      setActiveModal('pinSetup');
      return;
    }

    Alert.alert('Disable PIN Lock', 'Turn off PIN protection for profile tools?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disable',
        style: 'destructive',
        onPress: async () => {
          setSecurity((prev) => ({ ...prev, pinProtection: false }));
          setPinCode(null);
          await AsyncStorage.removeItem(PROFILE_PIN_KEY);
          await logAction('PIN lock disabled');
        },
      },
    ]);
  };

  const savePinCode = async () => {
    if (!/^\d{4,6}$/.test(pinSetupA)) {
      Alert.alert('Invalid PIN', 'PIN must be 4 to 6 digits.');
      return;
    }
    if (pinSetupA !== pinSetupB) {
      Alert.alert('PIN Mismatch', 'PIN confirmation does not match.');
      return;
    }

    setPinCode(pinSetupA);
    setSecurity((prev) => ({ ...prev, pinProtection: true }));
    await AsyncStorage.setItem(PROFILE_PIN_KEY, pinSetupA);
    await logAction('PIN lock enabled');
    setPinSetupA('');
    setPinSetupB('');
    setActiveModal('security');
  };

  const unlockWithPin = async () => {
    if (!pinCode || pinUnlockInput === pinCode) {
      setPinUnlockInput('');
      setIsLocked(false);
      await logAction('Profile unlocked with PIN');
      return;
    }
    Alert.alert('Invalid PIN', 'Please try again.');
  };

  const unlockWithBiometric = async () => {
    const ok = await authenticateBiometric();
    if (ok) {
      setIsLocked(false);
      await logAction('Profile unlocked with biometric auth');
    }
  };

  const handleUpdatePassword = async () => {
    if (!user?.email) {
      Alert.alert('Error', 'Missing user email. Please sign in again.');
      return;
    }
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Validation', 'Please complete all password fields.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Validation', 'New password and confirmation do not match.');
      return;
    }
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      Alert.alert('Weak Password', 'Use at least 8 chars with 1 uppercase and 1 number.');
      return;
    }

    setActionLoading(true);
    try {
      const verify = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
      if (verify.error) {
        Alert.alert('Authentication Failed', 'Current password is incorrect.');
        return;
      }

      const update = await supabase.auth.updateUser({ password: newPassword });
      if (update.error) {
        Alert.alert('Update Failed', update.error.message || 'Could not update password.');
        return;
      }

      await logAction('Account password updated');
      Alert.alert('Success', 'Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } finally {
      setActionLoading(false);
    }
  };

  const buildReport = useCallback(async (range: ReportRange) => {
    return buildOperationsReport({
      ponds: ponds as any[],
      pendingEntries: pendingTotal,
      lastSync,
      isOnline,
      generatedBy: user?.email,
      range,
    });
  }, [isOnline, lastSync, pendingTotal, ponds, user?.email]);

  const shareTextFile = useCallback(async (input: {
    filename: string;
    content: string;
    mimeType: string;
    title: string;
  }) => {
    try {
      const cacheDirectory = FileSystem.cacheDirectory;
      const writeAsStringAsync = FileSystem.writeAsStringAsync;
      const encodingType = FileSystem.EncodingType?.UTF8;

      if (cacheDirectory && writeAsStringAsync && Sharing.isAvailableAsync) {
        const fileUri = `${cacheDirectory}${input.filename}`;
        await writeAsStringAsync(fileUri, input.content, encodingType ? { encoding: encodingType } : undefined);
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri, {
            mimeType: input.mimeType,
            dialogTitle: input.title,
          });
          return;
        }
      }
    } catch (_error) {
      // Text share remains available on devices without file sharing support.
    }

    await Share.share({ title: input.title, message: input.content });
  }, []);

  const openReportRangePicker = (nextAction: ReportAction) => {
    setReportAction(nextAction);
    setActiveModal('reportExport');
  };

  const runReportExport = async (range: ReportRange) => {
    if (!reportAction) return;
    setActionLoading(true);
    setActiveModal(null);

    try {
      const report = await buildReport(range);
      const baseFilename = `aquapin-${report.range}-${report.generatedAt.toISOString().slice(0, 10)}`;

      if (reportAction === 'csv') {
        await shareTextFile({
          filename: `${baseFilename}.csv`,
          content: renderOperationsReportCsv(report),
          mimeType: 'text/csv',
          title: 'Aquapin Operations CSV',
        });
        await logAction(`Operations CSV exported (${report.rangeLabel})`);
        return;
      }

      try {
        const pdf = await Print.printToFileAsync({ html: renderOperationsReportHtml(report) });
        const canShare = await Sharing.isAvailableAsync();
        if (!canShare) throw new Error('pdf_sharing_unavailable');
        await Sharing.shareAsync(pdf.uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Aquapin Operations PDF',
        });
      } catch (_error) {
        Alert.alert('PDF Export Unavailable', 'This device could not generate or share the PDF right now.');
        await logAction(`PDF export failed (${report.rangeLabel})`);
        return;
      }

      await logAction(`Operations PDF exported (${report.rangeLabel})`);
    } finally {
      setActionLoading(false);
      setReportAction(null);
    }
  };

  const shareReportSummary = async () => {
    setActionLoading(true);
    try {
      const report = await buildReport('all');
      await Share.share({
        title: 'Aquapin Operations Report',
        message: renderOperationsReportText(report),
      });
      await logAction('Operations report shared');
    } finally {
      setActionLoading(false);
    }
  };

  const createBackup = async () => {
    setActionLoading(true);
    try {
      const keys = await AsyncStorage.getAllKeys();
      const appKeys = keys.filter((key) => key.startsWith('@aquapin_db:'));
      const entries = await AsyncStorage.multiGet(appKeys);
      const backupPayload = {
        createdAt: Date.now(),
        itemCount: entries.length,
        items: entries,
      };

      await AsyncStorage.setItem(PROFILE_BACKUP_KEY, JSON.stringify(backupPayload));
      await logAction(`Backup created (${entries.length} records)`);
      Alert.alert('Backup Created', `Saved ${entries.length} local records.`);
    } finally {
      setActionLoading(false);
    }
  };

  const restoreBackup = async () => {
    const raw = await AsyncStorage.getItem(PROFILE_BACKUP_KEY);
    if (!raw) {
      Alert.alert('No Backup', 'Create a backup first before restore.');
      return;
    }

    const parsed = JSON.parse(raw);
    const items: [string, string][] = parsed.items || [];
    Alert.alert('Restore Backup', `Restore ${items.length} records from ${formatDateTime(new Date(parsed.createdAt))}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Restore',
        style: 'destructive',
        onPress: async () => {
          setActionLoading(true);
          try {
            await AsyncStorage.multiSet(items);
            await logAction(`Backup restored (${items.length} records)`);
            Alert.alert('Restored', 'Local backup restored successfully.');
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  };

  const sendIssueReport = async () => {
    const body = [
      'Issue Report',
      '',
      `User: ${user?.email || 'unknown'}`,
      `Platform: ${Platform.OS} ${Platform.Version}`,
      `Online: ${isOnline ? 'Yes' : 'No'}`,
      `Unresolved Sync Items: ${pendingTotal}`,
      `Last Sync: ${formatDateTime(lastSync)}`,
      '',
      'Problem Description:',
      feedbackText.trim() || '(no details provided)',
      '',
      'Recent App Logs:',
      ...(recentLogs.slice(0, 8).length > 0 ? recentLogs.slice(0, 8) : ['(no logs available)']),
    ].join('\n');

    await Linking.openURL(buildMailTo('Aquapin Issue Report', body));
    await logAction('Issue report opened in email client');
    setFeedbackText('');
  };

  const handleSyncNow = async () => {
    const result = await performSync(true);
    await logAction(result.success ? 'Manual sync completed' : `Manual sync failed: ${result.message}`);
    Alert.alert(result.success ? 'Sync Complete' : 'Sync Failed', result.message);
  };

  const handleDeactivateAccount = () => {
    Alert.alert('Deactivate Account', 'You will be signed out and your account metadata will be marked deactivated.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Deactivate',
        style: 'destructive',
        onPress: async () => {
          setActionLoading(true);
          try {
            const { error } = await supabase.auth.updateUser({
              data: {
                account_status: 'deactivated',
                deactivated_at: new Date().toISOString(),
              },
            });
            if (error) {
              Alert.alert('Failed', error.message || 'Could not deactivate account.');
              return;
            }
            await logAction('Account deactivated');
            await signOut();
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert('Delete Account', 'Local app data will be removed and a deletion request email will be generated.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Final Confirmation', 'Are you sure you want to request account deletion?', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Request Deletion',
              style: 'destructive',
              onPress: async () => {
                setActionLoading(true);
                try {
                  await clearLocalDatabase();
                  await logAction('Local data cleared for deletion request');
                  const body = [
                    'Please delete my Aquapin account and associated profile.',
                    '',
                    `User: ${user?.email || 'unknown'}`,
                    `Requested at: ${new Date().toLocaleString('en-PH')}`,
                  ].join('\n');
                  await Linking.openURL(buildMailTo('Aquapin Account Deletion Request', body));
                  await signOut();
                } finally {
                  setActionLoading(false);
                }
              },
            },
          ]);
        },
      },
    ]);
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Do you want to sign out from Aquapin 2.0 now?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await logAction('User signed out');
          await signOut();
        },
      },
    ]);
  };

  const renderActionRow = (item: {
    title: string;
    subtitle?: string;
    icon: keyof typeof Ionicons.glyphMap;
    tone?: 'blue' | 'green' | 'red' | 'amber' | 'teal';
    onPress: () => void;
    trailing?: keyof typeof Ionicons.glyphMap;
  }) => {
    const toneMap = {
      blue: { bg: aquapinColors.blueSoft, fg: aquapinColors.blue },
      green: { bg: aquapinColors.greenSoft, fg: aquapinColors.green },
      red: { bg: aquapinColors.redSoft, fg: aquapinColors.red },
      amber: { bg: aquapinColors.amberSoft, fg: aquapinColors.amber },
      teal: { bg: aquapinColors.tealSoft, fg: aquapinColors.teal },
    };
    const tone = toneMap[item.tone || 'blue'];

    return (
      <TouchableOpacity key={item.title} style={styles.actionRow} activeOpacity={0.9} onPress={item.onPress}>
        <View style={[styles.actionIcon, { backgroundColor: tone.bg }]}>
          <Ionicons name={item.icon} size={20} color={tone.fg} />
        </View>
        <View style={styles.actionCopy}>
          <Text style={styles.actionTitle}>{item.title}</Text>
          {item.subtitle ? <Text style={styles.actionSubtitle}>{item.subtitle}</Text> : null}
        </View>
        <Ionicons name={item.trailing || 'chevron-forward'} size={18} color={aquapinColors.textMuted} />
      </TouchableOpacity>
    );
  };

  const renderSettingSwitch = (
    title: string,
    subtitle: string,
    value: boolean,
    onValueChange: (value: boolean) => void
  ) => (
    <View style={styles.settingItem}>
      <View style={styles.settingInfo}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingDesc}>{subtitle}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );

  const renderChoiceChip = (label: string, active: boolean, onPress: () => void) => (
    <TouchableOpacity style={[styles.choiceChip, active && styles.choiceChipActive]} activeOpacity={0.9} onPress={onPress}>
      <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  const renderSheet = (modalKey: string, title: string, children: React.ReactNode) => (
    <Modal visible={activeModal === modalKey} animationType="slide" transparent onRequestClose={closeModal}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity style={styles.modalClose} onPress={closeModal}>
              <Ionicons name="close" size={18} color={aquapinColors.text} />
            </TouchableOpacity>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );

  const renderProfileModal = () => renderSheet('profile', 'User Profile', (
    <ScrollView contentContainerStyle={styles.modalScroll}>
      <View style={styles.profileModalCard}>
        <View style={styles.profileModalAvatar}>
          <Text style={styles.profileModalAvatarText}>{user?.email?.charAt(0).toUpperCase() || '?'}</Text>
        </View>
        <Text style={styles.profileModalEmail}>{user?.email || 'Aquapin user'}</Text>
        <Text style={styles.profileModalMeta}>Field staff workspace</Text>
        <Text style={styles.preferenceHint}>
          {appearanceLabel} | {appLanguageLabel} | {preferences.weightUnit.toUpperCase()} | {preferences.fishCountFormat}
        </Text>
      </View>

      <View style={styles.summaryGrid}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{formatCount(farmStats.total, compactCount)}</Text>
          <Text style={styles.summaryLabel}>Total ponds</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{formatCount(farmStats.active, compactCount)}</Text>
          <Text style={styles.summaryLabel}>Active ponds</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{formatCount(farmStats.inactive, compactCount)}</Text>
          <Text style={styles.summaryLabel}>Inactive</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{formatCount(farmStats.speciesCount, compactCount)}</Text>
          <Text style={styles.summaryLabel}>Species</Text>
        </View>
      </View>
    </ScrollView>
  ));

  const renderNotificationsModal = () => renderSheet('notifications', 'Notification Settings', (
    <ScrollView contentContainerStyle={styles.modalScroll}>
      {renderSettingSwitch(
        'Harvest Reminders',
        'Notify when a cycle is likely harvest-ready.',
        notifications.harvestReminders,
        (value) => setNotifications((prev) => ({ ...prev, harvestReminders: value }))
      )}
      {renderSettingSwitch(
        'Mortality Alerts',
        'Highlight unusual mortality increases.',
        notifications.mortalityAlerts,
        (value) => setNotifications((prev) => ({ ...prev, mortalityAlerts: value }))
      )}
      {renderSettingSwitch(
        'Sync Notifications',
        'Inform after sync success or failure.',
        notifications.syncNotifications,
        (value) => setNotifications((prev) => ({ ...prev, syncNotifications: value }))
      )}
      {renderSettingSwitch(
        'Weekly Reports',
        'Receive weekly operations summaries.',
        notifications.weeklyReports,
        (value) => setNotifications((prev) => ({ ...prev, weeklyReports: value }))
      )}

      <TouchableOpacity style={styles.primaryInlineButton} activeOpacity={0.9} onPress={() => setActiveModal('pondAlerts')}>
        <Ionicons name="notifications-circle-outline" size={18} color="#fff" />
        <Text style={styles.primaryInlineButtonText}>Configure Per-Pond Alerts</Text>
      </TouchableOpacity>
    </ScrollView>
  ));

  const renderPondAlertsModal = () => renderSheet('pondAlerts', 'Per-Pond Alert Rules', (
    <FlatList
      data={ponds as any[]}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.modalScroll}
      renderItem={({ item }) => {
        const config = getPondAlertConfig(item.id);
        return (
          <View style={styles.pondAlertCard}>
            <Text style={styles.pondAlertName}>{item.name}</Text>
            {renderSettingSwitch('Mortality spike', 'Alert when losses rise unusually.', config.mortalitySpike, (value) => setPondAlertField(item.id, 'mortalitySpike', value))}
            {renderSettingSwitch('Harvest due', 'Alert when active cycle is likely ready.', config.harvestDue, (value) => setPondAlertField(item.id, 'harvestDue', value))}
            {renderSettingSwitch('No activity', 'Alert when pond has no recent records.', config.inactivity, (value) => setPondAlertField(item.id, 'inactivity', value))}
          </View>
        );
      }}
      ListEmptyComponent={<Text style={styles.emptyText}>No ponds available for alert configuration.</Text>}
    />
  ));

  const renderSecurityModal = () => renderSheet('security', 'Security Settings', (
    <ScrollView contentContainerStyle={styles.modalScroll}>
      {renderSettingSwitch('Biometric Login', 'Use face or fingerprint authentication when available.', security.biometricLogin, handleToggleBiometric)}
      {renderSettingSwitch('PIN Lock', 'Require a 4-6 digit PIN before opening profile tools.', security.pinProtection, handlePinToggle)}

      {security.pinProtection ? (
        <TouchableOpacity style={styles.secondaryInlineButton} activeOpacity={0.9} onPress={() => setIsLocked(true)}>
          <Ionicons name="lock-closed-outline" size={18} color={aquapinColors.blue} />
          <Text style={styles.secondaryInlineButtonText}>Lock Now</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.modalSectionTitle}>Update Password</Text>
      <TextInput style={styles.input} placeholder="Current Password" placeholderTextColor={aquapinColors.textMuted} secureTextEntry value={currentPassword} onChangeText={setCurrentPassword} />
      <TextInput style={styles.input} placeholder="New Password" placeholderTextColor={aquapinColors.textMuted} secureTextEntry value={newPassword} onChangeText={setNewPassword} />
      <TextInput style={styles.input} placeholder="Confirm New Password" placeholderTextColor={aquapinColors.textMuted} secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} />

      <TouchableOpacity style={styles.primaryInlineButton} activeOpacity={0.9} onPress={handleUpdatePassword} disabled={actionLoading}>
        {actionLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryInlineButtonText}>Update Password</Text>}
      </TouchableOpacity>
    </ScrollView>
  ));

  const renderPinSetupModal = () => renderSheet('pinSetup', 'Set PIN Lock', (
    <View style={styles.modalScroll}>
      <TextInput style={styles.input} keyboardType="number-pad" placeholder="Enter 4-6 digit PIN" placeholderTextColor={aquapinColors.textMuted} secureTextEntry value={pinSetupA} onChangeText={setPinSetupA} />
      <TextInput style={styles.input} keyboardType="number-pad" placeholder="Confirm PIN" placeholderTextColor={aquapinColors.textMuted} secureTextEntry value={pinSetupB} onChangeText={setPinSetupB} />
      <View style={styles.modalButtonRow}>
        <TouchableOpacity style={styles.modalGhostButton} onPress={() => setActiveModal('security')}>
          <Text style={styles.modalGhostText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.modalPrimaryButton} onPress={savePinCode}>
          <Text style={styles.modalPrimaryText}>Save PIN</Text>
        </TouchableOpacity>
      </View>
    </View>
  ));

  const renderPreferencesModal = () => renderSheet('preferences', 'Account Preferences', (
    <ScrollView contentContainerStyle={styles.modalScroll}>
      <Text style={styles.modalSectionTitle}>Appearance</Text>
      <View style={styles.chipRow}>
        {renderChoiceChip('Light Mode', appearanceMode === 'light', () => setAppearanceMode('light'))}
        {renderChoiceChip('Dark Mode', appearanceMode === 'dark', () => setAppearanceMode('dark'))}
      </View>

      <Text style={styles.modalSectionTitle}>Language</Text>
      <View style={styles.chipRow}>
        {renderChoiceChip('English', preferences.language === 'en', () => setPreferences((prev) => ({ ...prev, language: 'en' })))}
        {renderChoiceChip('Tagalog', preferences.language === 'fil', () => setPreferences((prev) => ({ ...prev, language: 'fil' })))}
      </View>

      <Text style={styles.modalSectionTitle}>Weight Unit</Text>
      <View style={styles.chipRow}>
        {renderChoiceChip('Kilogram (kg)', preferences.weightUnit === 'kg', () => setPreferences((prev) => ({ ...prev, weightUnit: 'kg' })))}
        {renderChoiceChip('Gram (g)', preferences.weightUnit === 'g', () => setPreferences((prev) => ({ ...prev, weightUnit: 'g' })))}
      </View>

      <Text style={styles.modalSectionTitle}>Fish Count Format</Text>
      <View style={styles.chipRow}>
        {renderChoiceChip('Full Number', preferences.fishCountFormat === 'full', () => setPreferences((prev) => ({ ...prev, fishCountFormat: 'full' })))}
        {renderChoiceChip('Compact', preferences.fishCountFormat === 'compact', () => setPreferences((prev) => ({ ...prev, fishCountFormat: 'compact' })))}
      </View>
    </ScrollView>
  ));

  const renderReportExportModal = () => renderSheet('reportExport', 'Choose Report Range', (
    <View style={styles.modalScroll}>
      <Text style={styles.reportActionLabel}>{reportAction === 'csv' ? 'Export CSV' : 'Export PDF Summary'}</Text>
      <Text style={styles.reportActionHint}>Select the coverage period for the operations report.</Text>
      <View style={styles.chipRow}>
        {reportRangeOptions.map((option) => renderChoiceChip(option.label, false, () => runReportExport(option.id)))}
      </View>
    </View>
  ));

  const renderHelpModal = () => renderSheet('help', 'Help Center', (
    <ScrollView contentContainerStyle={styles.modalScroll}>
      <TextInput style={styles.input} value={faqQuery} onChangeText={setFaqQuery} placeholder="Search FAQs" placeholderTextColor={aquapinColors.textMuted} />
      {filteredFaq.map((item) => (
        <View key={item.id} style={styles.faqItem}>
          <Text style={styles.faqQuestion}>{item.question}</Text>
          <Text style={styles.faqAnswer}>{item.answer}</Text>
        </View>
      ))}

      <Text style={styles.modalSectionTitle}>Report Issue</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={feedbackText}
        onChangeText={setFeedbackText}
        placeholder="Describe the issue you encountered"
        placeholderTextColor={aquapinColors.textMuted}
        multiline
      />
      <TouchableOpacity style={styles.primaryInlineButton} activeOpacity={0.9} onPress={sendIssueReport}>
        <Ionicons name="mail-outline" size={18} color="#fff" />
        <Text style={styles.primaryInlineButtonText}>Report with Device Info & Logs</Text>
      </TouchableOpacity>

      <Text style={styles.modalSectionTitle}>Recent Logs</Text>
      {(recentLogs.length > 0 ? recentLogs.slice(0, 6) : ['No recent logs']).map((entry, index) => (
        <Text key={`${entry}-${index}`} style={styles.logText}>{entry}</Text>
      ))}
    </ScrollView>
  ));

  const renderLockOverlay = () => {
    if (!isLocked) return null;

    return (
      <View style={styles.lockOverlay}>
        <View style={styles.lockCard}>
          <Ionicons name="lock-closed" size={28} color={aquapinColors.blue} />
          <Text style={styles.lockTitle}>Profile Locked</Text>
          <Text style={styles.lockSubtitle}>Enter your PIN to continue.</Text>
          <TextInput style={styles.input} keyboardType="number-pad" placeholder="PIN" placeholderTextColor={aquapinColors.textMuted} secureTextEntry value={pinUnlockInput} onChangeText={setPinUnlockInput} />
          <TouchableOpacity style={styles.primaryInlineButton} onPress={unlockWithPin}>
            <Text style={styles.primaryInlineButtonText}>Unlock with PIN</Text>
          </TouchableOpacity>
          {security.biometricLogin ? (
            <TouchableOpacity style={styles.secondaryInlineButton} onPress={unlockWithBiometric}>
              <Ionicons name="finger-print-outline" size={18} color={aquapinColors.blue} />
              <Text style={styles.secondaryInlineButtonText}>Unlock with Biometrics</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.secondaryInlineButton} onPress={signOut}>
            <Ionicons name="log-out-outline" size={18} color={aquapinColors.blue} />
            <Text style={styles.secondaryInlineButtonText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const settingsCards = [
    {
      key: 'profile',
      title: 'User Profile',
      subtitle: 'Identity, role, farm stats, and account summary.',
      icon: 'person-circle-outline' as const,
      onPress: () => setActiveModal('profile'),
    },
    {
      key: 'notifications',
      title: 'Notification Settings',
      subtitle: 'Harvest reminders, mortality alerts, sync notifications.',
      icon: 'notifications-outline' as const,
      onPress: () => setActiveModal('notifications'),
    },
    {
      key: 'security',
      title: 'Security Settings',
      subtitle: 'Biometrics, PIN lock, and password updates.',
      icon: 'shield-checkmark-outline' as const,
      onPress: () => setActiveModal('security'),
    },
    {
      key: 'preferences',
      title: 'Account Preferences',
      subtitle: 'Language, appearance, units, and count format.',
      icon: 'settings-outline' as const,
      onPress: () => setActiveModal('preferences'),
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {renderProfileModal()}
      {renderNotificationsModal()}
      {renderPondAlertsModal()}
      {renderSecurityModal()}
      {renderPinSetupModal()}
      {renderPreferencesModal()}
      {renderReportExportModal()}
      {renderHelpModal()}
      {renderLockOverlay()}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>Aquapin 2.0</Text>
            <Text style={styles.title}>Profile</Text>
            <Text style={styles.subtitle}>{user?.email || 'Field staff account'}</Text>
          </View>
          <TouchableOpacity style={styles.avatarBadge} activeOpacity={0.9} onPress={() => setActiveModal('profile')}>
            <Text style={styles.avatarInitial}>{user?.email?.charAt(0).toUpperCase() || '?'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.heroNameBlock}>
              <Text style={styles.heroName} numberOfLines={1}>{user?.email || 'Aquapin user'}</Text>
              <Text style={styles.heroRole}>Field staff workspace</Text>
            </View>
            <View style={[styles.statusBadge, isOnline ? styles.statusBadgeOnline : styles.statusBadgeOffline]}>
              <Text style={[styles.statusBadgeText, isOnline ? styles.statusBadgeTextOnline : styles.statusBadgeTextOffline]}>
                {isOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
          </View>

          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{formatCount(overview.totalPonds, compactCount)}</Text>
              <Text style={styles.heroStatLabel}>Managed ponds</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{formatWholeNumber(queueSnapshot.pending)}</Text>
              <Text style={styles.heroStatLabel}>Sync queue</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{formatCount(overview.activePonds, compactCount)}</Text>
              <Text style={styles.heroStatLabel}>Active ponds</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeadRow}>
          <Text style={styles.sectionTitle}>System Status</Text>
          <TouchableOpacity style={styles.linkButton} onPress={handleSyncNow} disabled={isSyncing}>
            {isSyncing ? <ActivityIndicator size="small" color={aquapinColors.blue} /> : <Text style={styles.linkText}>Sync Now</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.statusGrid}>
          <View style={styles.statusCard}>
            <Text style={styles.statusLabel}>Last Sync</Text>
            <Text style={styles.statusValue}>{lastSync ? formatRelativeTime(lastSync.getTime()) : 'Not yet synced'}</Text>
            <Text style={styles.statusHint}>Cloud and offline queue state</Text>
          </View>
          <View style={styles.statusCard}>
            <Text style={styles.statusLabel}>Recent Activity</Text>
            <Text style={styles.statusValue}>{formatRelativeTime(overview.latestActivityAt)}</Text>
            <Text style={styles.statusHint}>Latest farm action recorded locally</Text>
          </View>
        </View>

        <View style={styles.sectionHeadRow}>
          <Text style={styles.sectionTitle}>Profile & Settings</Text>
          <Text style={styles.sectionMeta}>Integrated</Text>
        </View>

        <View style={styles.cardGrid}>
          {settingsCards.map((card) => (
            <TouchableOpacity key={card.key} style={styles.settingsCard} activeOpacity={0.92} onPress={card.onPress}>
              <View style={styles.settingsIcon}>
                <Ionicons name={card.icon} size={20} color={aquapinColors.blue} />
              </View>
              <Text style={styles.settingsTitle}>{card.title}</Text>
              <Text style={styles.settingsSubtitle}>{card.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.sectionHeadRow}>
          <Text style={styles.sectionTitle}>Data Tools</Text>
          <Text style={styles.sectionMeta}>Export & backup</Text>
        </View>

        <View style={styles.actionList}>
          {renderActionRow({ title: 'Export CSV', subtitle: 'Generate operations spreadsheet.', icon: 'document-text-outline', tone: 'blue', trailing: 'share-social-outline', onPress: () => openReportRangePicker('csv') })}
          {renderActionRow({ title: 'Export PDF Summary', subtitle: 'Generate a printable operations report.', icon: 'document-outline', tone: 'teal', trailing: 'share-social-outline', onPress: () => openReportRangePicker('pdf') })}
          {renderActionRow({ title: 'Share Report', subtitle: 'Share a text operations summary.', icon: 'share-outline', tone: 'green', trailing: 'share-social-outline', onPress: shareReportSummary })}
          {renderActionRow({ title: 'Create Backup', subtitle: 'Save local offline records snapshot.', icon: 'save-outline', tone: 'amber', onPress: createBackup })}
          {renderActionRow({ title: 'Restore Backup', subtitle: 'Restore the last local backup.', icon: 'refresh-outline', tone: 'teal', onPress: restoreBackup })}
        </View>

        <View style={styles.sectionHeadRow}>
          <Text style={styles.sectionTitle}>Help & Account</Text>
          <Text style={styles.sectionMeta}>Support</Text>
        </View>

        <View style={styles.actionList}>
          {renderActionRow({ title: 'Search FAQ & Report Issue', subtitle: 'Open help center and send logs.', icon: 'help-circle-outline', tone: 'amber', onPress: () => setActiveModal('help') })}
          {renderActionRow({ title: 'Deactivate Account', subtitle: 'Mark the account deactivated and sign out.', icon: 'pause-circle-outline', tone: 'red', onPress: handleDeactivateAccount })}
          {renderActionRow({ title: 'Delete Account', subtitle: 'Clear local data and request account deletion.', icon: 'trash-outline', tone: 'red', onPress: handleDeleteAccount })}
        </View>

        {actionLoading ? (
          <View style={styles.loadingBanner}>
            <ActivityIndicator size="small" color={aquapinColors.blue} />
            <Text style={styles.loadingBannerText}>{loadingCopy}</Text>
          </View>
        ) : null}

        <TouchableOpacity style={styles.signOutButton} activeOpacity={0.92} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={18} color="#fff" />
          <Text style={styles.signOutButtonText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>Version 2.0.0</Text>
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
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  headerCopy: {
    flex: 1,
    paddingRight: 12,
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
  },
  avatarBadge: {
    width: 46,
    height: 46,
    borderRadius: 18,
    backgroundColor: aquapinColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: aquapinColors.blue,
    fontSize: 18,
    fontWeight: '900',
  },
  heroCard: {
    backgroundColor: aquapinColors.surface,
    borderRadius: 28,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#16335c',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  heroNameBlock: {
    flex: 1,
  },
  heroName: {
    color: aquapinColors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  heroRole: {
    color: aquapinColors.textMuted,
    fontSize: 12,
    marginTop: 6,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusBadgeOnline: {
    backgroundColor: aquapinColors.greenSoft,
  },
  statusBadgeOffline: {
    backgroundColor: aquapinColors.redSoft,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  statusBadgeTextOnline: {
    color: aquapinColors.green,
  },
  statusBadgeTextOffline: {
    color: aquapinColors.red,
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
    padding: 15,
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
  sectionHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 2,
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
  linkButton: {
    minWidth: 76,
    alignItems: 'flex-end',
  },
  linkText: {
    color: aquapinColors.blue,
    fontSize: 13,
    fontWeight: '800',
  },
  statusGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statusCard: {
    flex: 1,
    backgroundColor: aquapinColors.surface,
    borderRadius: 22,
    padding: 16,
  },
  statusLabel: {
    color: aquapinColors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  statusValue: {
    color: aquapinColors.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 10,
  },
  statusHint: {
    color: aquapinColors.textMuted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 8,
  },
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
    marginBottom: 22,
  },
  settingsCard: {
    width: '48%',
    backgroundColor: aquapinColors.surface,
    borderRadius: 24,
    padding: 16,
    minHeight: 158,
  },
  settingsIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: aquapinColors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  settingsTitle: {
    color: aquapinColors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  settingsSubtitle: {
    color: aquapinColors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
  actionList: {
    gap: 10,
    marginBottom: 22,
  },
  actionRow: {
    backgroundColor: aquapinColors.surface,
    borderRadius: 22,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCopy: {
    flex: 1,
  },
  actionTitle: {
    color: aquapinColors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  actionSubtitle: {
    color: aquapinColors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  loadingBanner: {
    backgroundColor: aquapinColors.blueSoft,
    borderRadius: 18,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingBannerText: {
    color: aquapinColors.blue,
    fontSize: 12,
    fontWeight: '800',
  },
  signOutButton: {
    marginTop: 8,
    backgroundColor: aquapinColors.blue,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  signOutButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  version: {
    marginTop: 14,
    color: aquapinColors.textMuted,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(8, 18, 32, 0.34)',
  },
  modalContent: {
    backgroundColor: aquapinColors.surface,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    maxHeight: '86%',
    minHeight: '42%',
  },
  modalHandle: {
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: aquapinColors.border,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 6,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#edf3f8',
  },
  modalTitle: {
    color: aquapinColors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  modalClose: {
    width: 34,
    height: 34,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: aquapinColors.surfaceMuted,
  },
  modalScroll: {
    padding: 18,
    paddingBottom: 28,
  },
  profileModalCard: {
    backgroundColor: aquapinColors.surfaceMuted,
    borderRadius: 24,
    padding: 18,
    alignItems: 'center',
  },
  profileModalAvatar: {
    width: 72,
    height: 72,
    borderRadius: 28,
    backgroundColor: aquapinColors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  profileModalAvatarText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
  },
  profileModalEmail: {
    color: aquapinColors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  profileModalMeta: {
    color: aquapinColors.textMuted,
    fontSize: 12,
    marginTop: 6,
  },
  preferenceHint: {
    color: aquapinColors.textMuted,
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
    marginTop: 14,
  },
  summaryCard: {
    width: '48%',
    backgroundColor: aquapinColors.surfaceMuted,
    borderRadius: 20,
    padding: 14,
  },
  summaryValue: {
    color: aquapinColors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  summaryLabel: {
    color: aquapinColors.textMuted,
    fontSize: 12,
    marginTop: 6,
  },
  settingItem: {
    backgroundColor: aquapinColors.surfaceMuted,
    borderRadius: 20,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  settingInfo: {
    flex: 1,
  },
  settingTitle: {
    color: aquapinColors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  settingDesc: {
    color: aquapinColors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  primaryInlineButton: {
    marginTop: 10,
    backgroundColor: aquapinColors.blue,
    borderRadius: 18,
    paddingVertical: 13,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryInlineButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryInlineButton: {
    marginTop: 10,
    backgroundColor: aquapinColors.blueSoft,
    borderRadius: 18,
    paddingVertical: 13,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  secondaryInlineButtonText: {
    color: aquapinColors.blue,
    fontSize: 13,
    fontWeight: '800',
  },
  pondAlertCard: {
    backgroundColor: aquapinColors.surface,
    borderRadius: 24,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: aquapinColors.border,
  },
  pondAlertName: {
    color: aquapinColors.text,
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  input: {
    backgroundColor: aquapinColors.surfaceMuted,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: aquapinColors.border,
    color: aquapinColors.text,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 10,
  },
  textArea: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  modalSectionTitle: {
    color: aquapinColors.text,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choiceChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: aquapinColors.border,
    backgroundColor: aquapinColors.surfaceMuted,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  choiceChipActive: {
    backgroundColor: aquapinColors.blueSoft,
    borderColor: '#cfe1fb',
  },
  choiceChipText: {
    color: aquapinColors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  choiceChipTextActive: {
    color: aquapinColors.blue,
  },
  reportActionLabel: {
    color: aquapinColors.blue,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  reportActionHint: {
    color: aquapinColors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    marginBottom: 14,
  },
  faqItem: {
    backgroundColor: aquapinColors.surfaceMuted,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
  },
  faqQuestion: {
    color: aquapinColors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  faqAnswer: {
    color: aquapinColors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  logText: {
    color: aquapinColors.textMuted,
    fontSize: 11,
    lineHeight: 17,
    marginBottom: 6,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  modalButtonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  modalGhostButton: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: aquapinColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  modalGhostText: {
    color: aquapinColors.textMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  modalPrimaryButton: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: aquapinColors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  modalPrimaryText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  emptyText: {
    color: aquapinColors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 28,
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 18, 32, 0.72)',
    justifyContent: 'center',
    paddingHorizontal: 18,
    zIndex: 1000,
  },
  lockCard: {
    backgroundColor: aquapinColors.surface,
    borderRadius: 28,
    padding: 18,
    alignItems: 'stretch',
  },
  lockTitle: {
    color: aquapinColors.text,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 10,
  },
  lockSubtitle: {
    color: aquapinColors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 12,
  },
});
