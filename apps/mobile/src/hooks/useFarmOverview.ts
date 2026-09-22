import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { watchLocalData } from '../db/queries';
import { database, mockDatabase } from '../db';

const db = database || mockDatabase;
const isMock = !database;
const AVG_PRICE_PER_KG = 185;

function getCollection(name: string) {
  return isMock ? (db.collections as any)[name] : db.collections.get(name);
}

function toId(value: unknown): string {
  return String(value || '').trim();
}

function toTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = new Date(value as any).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parseSpeciesLabel(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return Array.from(
    new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

export interface FarmActivity {
  id: string;
  pondId: string;
  pondName: string;
  type: 'stocking' | 'mortality' | 'harvest';
  title: string;
  subtitle: string;
  amount: string;
  createdAt: number;
}

export interface FarmOverview {
  loading: boolean;
  totalPonds: number;
  activePonds: number;
  mappedPonds: number;
  speciesCount: number;
  totalStock: number;
  totalStocked: number;
  totalMortality: number;
  totalHarvestKg: number;
  survivalRate: number | null;
  estimatedRevenue: number;
  latestActivityAt: number | null;
  pondPreview: Array<{
    id: string;
    name: string;
    location: string;
    isActive: boolean;
    currentStockCount: number;
    currentSpecies?: string;
  }>;
  recentActivities: FarmActivity[];
}

const EMPTY_OVERVIEW: FarmOverview = {
  loading: true,
  totalPonds: 0,
  activePonds: 0,
  mappedPonds: 0,
  speciesCount: 0,
  totalStock: 0,
  totalStocked: 0,
  totalMortality: 0,
  totalHarvestKg: 0,
  survivalRate: null,
  estimatedRevenue: 0,
  latestActivityAt: null,
  pondPreview: [],
  recentActivities: [],
};

export function useFarmOverview() {
  const [overview, setOverview] = useState<FarmOverview>(EMPTY_OVERVIEW);

  const refresh = useCallback(async (isCancelled: () => boolean) => {
    try {
      const [ponds, stockingLogs, mortalityLogs, harvests] = await Promise.all([
        getCollection('ponds').query().fetch(),
        getCollection('stocking_logs').query().fetch(),
        getCollection('mortality_logs').query().fetch(),
        getCollection('harvests').query().fetch(),
      ]);

      const pondNameMap = new Map<string, string>();
      const speciesSet = new Set<string>();

      const pondPreview = (ponds as any[])
        .map((pond) => {
          const pondId = toId(pond.id);
          const currentSpecies = typeof pond.currentSpecies === 'string' ? pond.currentSpecies : undefined;
          pondNameMap.set(pondId, pond.name || 'Unnamed Pond');
          parseSpeciesLabel(currentSpecies).forEach((species) => speciesSet.add(species));

          return {
            id: pondId,
            name: pond.name || 'Unnamed Pond',
            location: pond.location || '',
            isActive: Boolean(pond.isActive),
            currentStockCount: Number(pond.currentStockCount || 0),
            currentSpecies,
          };
        })
        .sort((a, b) => b.currentStockCount - a.currentStockCount)
        .slice(0, 4);

      const totalPonds = ponds.length;
      const activePonds = (ponds as any[]).filter((pond) => Boolean(pond.isActive)).length;
      const mappedPonds = (ponds as any[]).filter((pond) => String(pond.location || '').trim().length > 0).length;
      const totalStock = (ponds as any[]).reduce((sum, pond) => sum + Number(pond.currentStockCount || 0), 0);
      const totalStocked = (stockingLogs as any[]).reduce((sum, log) => sum + Number(log.quantity || 0), 0);
      const totalMortality = (mortalityLogs as any[]).reduce((sum, log) => sum + Number(log.quantity || 0), 0);
      const totalHarvestKg = (harvests as any[]).reduce((sum, harvest) => sum + Number(harvest.yieldKg || 0), 0);
      const survivalRate = totalStocked > 0
        ? Math.max(0, ((totalStocked - totalMortality) / totalStocked) * 100)
        : null;

      const recentActivities = [
        ...(stockingLogs as any[]).map((log) => ({
          id: toId(log.id),
          pondId: toId(log.pondId),
          pondName: pondNameMap.get(toId(log.pondId)) || 'Unnamed Pond',
          type: 'stocking' as const,
          title: 'Stocking',
          subtitle: pondNameMap.get(toId(log.pondId)) || 'Unnamed Pond',
          amount: `${Math.round(Number(log.quantity || 0)).toLocaleString('en-PH')} fry`,
          createdAt: toTimestamp(log.createdAt),
        })),
        ...(mortalityLogs as any[]).map((log) => ({
          id: toId(log.id),
          pondId: toId(log.pondId),
          pondName: pondNameMap.get(toId(log.pondId)) || 'Unnamed Pond',
          type: 'mortality' as const,
          title: 'Mortality',
          subtitle: pondNameMap.get(toId(log.pondId)) || 'Unnamed Pond',
          amount: `${Math.round(Number(log.quantity || 0)).toLocaleString('en-PH')} fish`,
          createdAt: toTimestamp(log.createdAt),
        })),
        ...(harvests as any[]).map((harvest) => ({
          id: toId(harvest.id),
          pondId: toId(harvest.pondId),
          pondName: pondNameMap.get(toId(harvest.pondId)) || 'Unnamed Pond',
          type: 'harvest' as const,
          title: 'Harvest',
          subtitle: pondNameMap.get(toId(harvest.pondId)) || 'Unnamed Pond',
          amount: `${Math.round(Number(harvest.yieldKg || 0)).toLocaleString('en-PH')} kg`,
          createdAt: toTimestamp(harvest.createdAt),
        })),
      ]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 8);

      const latestActivityAt = recentActivities.length > 0 ? recentActivities[0].createdAt : null;

      if (isCancelled()) return;
      setOverview({
        loading: false,
        totalPonds,
        activePonds,
        mappedPonds,
        speciesCount: speciesSet.size,
        totalStock,
        totalStocked,
        totalMortality,
        totalHarvestKg,
        survivalRate,
        estimatedRevenue: totalHarvestKg * AVG_PRICE_PER_KG,
        latestActivityAt,
        pondPreview,
        recentActivities,
      });
    } catch (error) {
      console.error('Error loading farm overview:', error);
      if (isCancelled()) return;
      setOverview((current) => ({ ...current, loading: false }));
    }
  }, []);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    const stop = watchLocalData(
      ['ponds', 'stocking_logs', 'mortality_logs', 'harvests'],
      () => refresh(() => cancelled)
    );
    return () => { cancelled = true; stop(); };
  }, [refresh]));

  return overview;
}
