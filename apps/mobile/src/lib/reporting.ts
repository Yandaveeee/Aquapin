import { database, mockDatabase } from '../db';

const db = database || mockDatabase;
const isMock = !database;
const getCollection = (name: string) =>
  isMock ? (db.collections as any)[name] : db.collections.get(name);

export type ReportRange = 'today' | '7d' | '30d' | 'all';

type PondLike = {
  id: string;
  name?: string;
  location?: string;
  createdAt?: number | Date | string;
  isActive?: boolean;
  currentSpecies?: string;
  currentStockCount?: number;
};

type MortalityLike = {
  pondId?: string;
  quantity?: number;
  createdAt?: number | Date | string;
};

type HarvestLike = {
  pondId?: string;
  yieldKg?: number;
  isPartial?: boolean;
  fishCount?: number;
  createdAt?: number | Date | string;
};

type StockingLike = {
  pondId?: string;
  quantity?: number;
  species?: string;
  createdAt?: number | Date | string;
};

export interface ReportPondRow {
  pondId: string;
  pondName: string;
  status: 'Active' | 'Inactive';
  species: string;
  estimatedStock: number;
  mortalityTotal: number;
  mortalityEvents: number;
  stockingTotal: number;
  stockingEvents: number;
  harvestKgTotal: number;
  harvestEvents: number;
  partialHarvestEvents: number;
  fullHarvestEvents: number;
  lastActivityAt: number | null;
  location: string;
  createdAt: number;
}

export interface OperationsReport {
  generatedAt: Date;
  generatedBy: string;
  range: ReportRange;
  rangeLabel: string;
  lastSyncLabel: string;
  isOnline: boolean;
  overview: {
    totalPonds: number;
    activePonds: number;
    inactivePonds: number;
    speciesCount: number;
    pendingEntries: number;
  };
  operations: {
    mortalityTotal: number;
    mortalityEvents: number;
    harvestKgTotal: number;
    harvestEvents: number;
    partialHarvests: number;
    fullHarvests: number;
    stockingTotal: number;
    stockingEvents: number;
    pondsWithOperations: number;
  };
  topActivePonds: Array<{
    pondName: string;
    events: number;
  }>;
  pondRows: ReportPondRow[];
}

function normalizeTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function startOfToday(at: Date): number {
  const next = new Date(at);
  next.setHours(0, 0, 0, 0);
  return next.getTime();
}

function getRangeStart(range: ReportRange, generatedAt: Date): number | null {
  const now = generatedAt.getTime();
  if (range === 'today') return startOfToday(generatedAt);
  if (range === '7d') return now - 7 * 24 * 60 * 60 * 1000;
  if (range === '30d') return now - 30 * 24 * 60 * 60 * 1000;
  return null;
}

function getRangeLabel(range: ReportRange): string {
  switch (range) {
    case 'today':
      return 'Today';
    case '7d':
      return 'Last 7 Days';
    case '30d':
      return 'Last 30 Days';
    default:
      return 'All Time';
  }
}

function matchesRange(createdAt: unknown, rangeStart: number | null): boolean {
  if (rangeStart === null) return true;
  return normalizeTimestamp(createdAt) >= rangeStart;
}

function formatDateTime(value: Date | number | null): string {
  if (!value) return 'Never';
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateShort(value: number | null): string {
  if (!value) return 'No activity yet';
  return new Date(value).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function escapeCsv(value: string | number): string {
  const stringValue = String(value ?? '');
  return `"${stringValue.replace(/"/g, '""')}"`;
}

function escapeHtml(value: string | number): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function fetchCollection<T>(name: string): Promise<T[]> {
  const collection = getCollection(name);
  return collection.query().fetch();
}

export async function buildOperationsReport(input: {
  ponds: PondLike[];
  pendingEntries: number;
  lastSync: Date | null;
  isOnline: boolean;
  generatedBy?: string | null;
  range: ReportRange;
}): Promise<OperationsReport> {
  const generatedAt = new Date();
  const rangeStart = getRangeStart(input.range, generatedAt);
  const [mortalityLogs, harvests, stockingLogs] = await Promise.all([
    fetchCollection<MortalityLike>('mortality_logs'),
    fetchCollection<HarvestLike>('harvests'),
    fetchCollection<StockingLike>('stocking_logs'),
  ]);

  const activePonds = input.ponds.filter((pond) => Boolean(pond.isActive)).length;
  const speciesCount = new Set(
    input.ponds
      .map((pond) => String(pond.currentSpecies || '').trim())
      .filter((species) => species.length > 0)
  ).size;

  const pondRows = input.ponds.map<ReportPondRow>((pond) => ({
    pondId: String(pond.id),
    pondName: pond.name?.trim() || 'Unnamed Pond',
    status: pond.isActive ? 'Active' : 'Inactive',
    species: pond.currentSpecies?.trim() || 'Not set',
    estimatedStock: Number(pond.currentStockCount || 0),
    mortalityTotal: 0,
    mortalityEvents: 0,
    stockingTotal: 0,
    stockingEvents: 0,
    harvestKgTotal: 0,
    harvestEvents: 0,
    partialHarvestEvents: 0,
    fullHarvestEvents: 0,
    lastActivityAt: null,
    location: pond.location?.trim() || 'No location',
    createdAt: normalizeTimestamp(pond.createdAt),
  }));

  const pondMap = new Map(pondRows.map((row) => [row.pondId, row]));

  let mortalityTotal = 0;
  let mortalityEvents = 0;
  let harvestKgTotal = 0;
  let harvestEvents = 0;
  let partialHarvests = 0;
  let fullHarvests = 0;
  let stockingTotal = 0;
  let stockingEvents = 0;

  const touchActivity = (pondId: string, timestamp: number) => {
    const row = pondMap.get(pondId);
    if (!row) return;
    row.lastActivityAt = row.lastActivityAt ? Math.max(row.lastActivityAt, timestamp) : timestamp;
  };

  for (const log of mortalityLogs) {
    if (!matchesRange(log.createdAt, rangeStart)) continue;
    const pondId = String(log.pondId || '');
    const row = pondMap.get(pondId);
    if (!row) continue;

    const quantity = Number(log.quantity || 0);
    const timestamp = normalizeTimestamp(log.createdAt);
    row.mortalityTotal += quantity;
    row.mortalityEvents += 1;
    mortalityTotal += quantity;
    mortalityEvents += 1;
    touchActivity(pondId, timestamp);
  }

  for (const harvest of harvests) {
    if (!matchesRange(harvest.createdAt, rangeStart)) continue;
    const pondId = String(harvest.pondId || '');
    const row = pondMap.get(pondId);
    if (!row) continue;

    const yieldKg = Number(harvest.yieldKg || 0);
    const timestamp = normalizeTimestamp(harvest.createdAt);
    const isPartial = Boolean(harvest.isPartial);
    row.harvestKgTotal += yieldKg;
    row.harvestEvents += 1;
    row.partialHarvestEvents += isPartial ? 1 : 0;
    row.fullHarvestEvents += isPartial ? 0 : 1;
    harvestKgTotal += yieldKg;
    harvestEvents += 1;
    partialHarvests += isPartial ? 1 : 0;
    fullHarvests += isPartial ? 0 : 1;
    touchActivity(pondId, timestamp);
  }

  for (const stocking of stockingLogs) {
    if (!matchesRange(stocking.createdAt, rangeStart)) continue;
    const pondId = String(stocking.pondId || '');
    const row = pondMap.get(pondId);
    if (!row) continue;

    const quantity = Number(stocking.quantity || 0);
    const timestamp = normalizeTimestamp(stocking.createdAt);
    row.stockingTotal += quantity;
    row.stockingEvents += 1;
    stockingTotal += quantity;
    stockingEvents += 1;
    if (row.species === 'Not set' && stocking.species?.trim()) {
      row.species = stocking.species.trim();
    }
    touchActivity(pondId, timestamp);
  }

  pondRows.sort((a, b) => a.pondName.localeCompare(b.pondName));

  const topActivePonds = pondRows
    .map((row) => ({
      pondName: row.pondName,
      events: row.mortalityEvents + row.harvestEvents + row.stockingEvents,
    }))
    .filter((item) => item.events > 0)
    .sort((a, b) => b.events - a.events || a.pondName.localeCompare(b.pondName))
    .slice(0, 5);

  return {
    generatedAt,
    generatedBy: input.generatedBy?.trim() || 'Unknown user',
    range: input.range,
    rangeLabel: getRangeLabel(input.range),
    lastSyncLabel: formatDateTime(input.lastSync),
    isOnline: input.isOnline,
    overview: {
      totalPonds: input.ponds.length,
      activePonds,
      inactivePonds: input.ponds.length - activePonds,
      speciesCount,
      pendingEntries: input.pendingEntries,
    },
    operations: {
      mortalityTotal,
      mortalityEvents,
      harvestKgTotal,
      harvestEvents,
      partialHarvests,
      fullHarvests,
      stockingTotal,
      stockingEvents,
      pondsWithOperations: pondRows.filter((row) => row.lastActivityAt !== null).length,
    },
    topActivePonds,
    pondRows,
  };
}

export function renderOperationsReportText(report: OperationsReport, options?: { maxPonds?: number }): string {
  const maxPonds = options?.maxPonds ?? report.pondRows.length;
  const pondLines = report.pondRows.slice(0, maxPonds).map((row) => (
    `- ${row.pondName} | ${row.status} | ${row.species} | Stock ${row.estimatedStock.toLocaleString()} | Mortality ${row.mortalityTotal.toLocaleString()} | Stocking ${row.stockingTotal.toLocaleString()} | Harvest ${row.harvestKgTotal.toFixed(2)} kg`
  ));

  const omittedPonds = Math.max(0, report.pondRows.length - maxPonds);
  const topPondLines = report.topActivePonds.length > 0
    ? report.topActivePonds.map((item, index) => `${index + 1}. ${item.pondName} - ${item.events} event${item.events === 1 ? '' : 's'}`)
    : ['No logged operations in this period.'];

  return [
    'AquaPin BFAR Operations Summary',
    `Generated: ${formatDateTime(report.generatedAt)}`,
    `Prepared by: ${report.generatedBy}`,
    `Date range: ${report.rangeLabel}`,
    '',
    'Farm Snapshot',
    `- Total ponds: ${report.overview.totalPonds}`,
    `- Active ponds: ${report.overview.activePonds}`,
    `- Inactive ponds: ${report.overview.inactivePonds}`,
    `- Species tracked: ${report.overview.speciesCount}`,
    `- Pending local entries: ${report.overview.pendingEntries}`,
    `- Last sync: ${report.lastSyncLabel}`,
    `- Connectivity: ${report.isOnline ? 'Online' : 'Offline'}`,
    '',
    'Operations Summary',
    `- Mortality: ${report.operations.mortalityTotal.toLocaleString()} fish across ${report.operations.mortalityEvents} log${report.operations.mortalityEvents === 1 ? '' : 's'}`,
    `- Stocking: ${report.operations.stockingTotal.toLocaleString()} fingerlings across ${report.operations.stockingEvents} event${report.operations.stockingEvents === 1 ? '' : 's'}`,
    `- Harvest: ${report.operations.harvestKgTotal.toFixed(2)} kg across ${report.operations.harvestEvents} event${report.operations.harvestEvents === 1 ? '' : 's'}`,
    `- Partial harvests: ${report.operations.partialHarvests}`,
    `- Full harvests: ${report.operations.fullHarvests}`,
    `- Ponds with activity: ${report.operations.pondsWithOperations}`,
    '',
    'Top Active Ponds',
    ...topPondLines,
    '',
    'Pond Summary',
    ...pondLines,
    ...(omittedPonds > 0 ? [`- +${omittedPonds} more pond${omittedPonds === 1 ? '' : 's'} not shown`] : []),
  ].join('\n');
}

export function renderOperationsReportCsv(report: OperationsReport): string {
  const rows: string[] = [
    ['Section', 'Metric', 'Value'].map(escapeCsv).join(','),
    [escapeCsv('Overview'), escapeCsv('Generated At'), escapeCsv(formatDateTime(report.generatedAt))].join(','),
    [escapeCsv('Overview'), escapeCsv('Prepared By'), escapeCsv(report.generatedBy)].join(','),
    [escapeCsv('Overview'), escapeCsv('Date Range'), escapeCsv(report.rangeLabel)].join(','),
    [escapeCsv('Overview'), escapeCsv('Total Ponds'), escapeCsv(report.overview.totalPonds)].join(','),
    [escapeCsv('Overview'), escapeCsv('Active Ponds'), escapeCsv(report.overview.activePonds)].join(','),
    [escapeCsv('Overview'), escapeCsv('Inactive Ponds'), escapeCsv(report.overview.inactivePonds)].join(','),
    [escapeCsv('Overview'), escapeCsv('Species Count'), escapeCsv(report.overview.speciesCount)].join(','),
    [escapeCsv('Overview'), escapeCsv('Pending Entries'), escapeCsv(report.overview.pendingEntries)].join(','),
    [escapeCsv('Overview'), escapeCsv('Last Sync'), escapeCsv(report.lastSyncLabel)].join(','),
    [escapeCsv('Overview'), escapeCsv('Connectivity'), escapeCsv(report.isOnline ? 'Online' : 'Offline')].join(','),
    [escapeCsv('Operations'), escapeCsv('Mortality Total'), escapeCsv(report.operations.mortalityTotal)].join(','),
    [escapeCsv('Operations'), escapeCsv('Mortality Events'), escapeCsv(report.operations.mortalityEvents)].join(','),
    [escapeCsv('Operations'), escapeCsv('Stocking Total'), escapeCsv(report.operations.stockingTotal)].join(','),
    [escapeCsv('Operations'), escapeCsv('Stocking Events'), escapeCsv(report.operations.stockingEvents)].join(','),
    [escapeCsv('Operations'), escapeCsv('Harvest Total Kg'), escapeCsv(report.operations.harvestKgTotal.toFixed(2))].join(','),
    [escapeCsv('Operations'), escapeCsv('Harvest Events'), escapeCsv(report.operations.harvestEvents)].join(','),
    [escapeCsv('Operations'), escapeCsv('Partial Harvests'), escapeCsv(report.operations.partialHarvests)].join(','),
    [escapeCsv('Operations'), escapeCsv('Full Harvests'), escapeCsv(report.operations.fullHarvests)].join(','),
    '',
    [
      'Pond Name',
      'Status',
      'Species',
      'Estimated Stock',
      'Mortality Total',
      'Mortality Events',
      'Stocking Total',
      'Stocking Events',
      'Harvest Kg Total',
      'Harvest Events',
      'Partial Harvests',
      'Full Harvests',
      'Last Activity',
      'Location',
      'Created At',
    ].map(escapeCsv).join(','),
  ];

  for (const row of report.pondRows) {
    rows.push([
      row.pondName,
      row.status,
      row.species,
      row.estimatedStock,
      row.mortalityTotal,
      row.mortalityEvents,
      row.stockingTotal,
      row.stockingEvents,
      row.harvestKgTotal.toFixed(2),
      row.harvestEvents,
      row.partialHarvestEvents,
      row.fullHarvestEvents,
      formatDateShort(row.lastActivityAt),
      row.location,
      formatDateTime(row.createdAt),
    ].map(escapeCsv).join(','));
  }

  return rows.join('\n');
}

export function renderOperationsReportHtml(report: OperationsReport, options?: {
  appLogoDataUri?: string | null;
  bfarLogoDataUri?: string | null;
}): string {
  const logoBlock = [options?.appLogoDataUri, options?.bfarLogoDataUri]
    .filter(Boolean)
    .map((src) => `<img src="${src}" alt="Logo" style="height: 56px; object-fit: contain;" />`)
    .join('');

  const topPondsHtml = report.topActivePonds.length > 0
    ? report.topActivePonds.map((item) => (
        `<li><strong>${escapeHtml(item.pondName)}</strong> - ${item.events} event${item.events === 1 ? '' : 's'}</li>`
      )).join('')
    : '<li>No logged operations in this period.</li>';

  const pondRowsHtml = report.pondRows.map((row) => `
      <tr>
        <td>${escapeHtml(row.pondName)}</td>
        <td>${escapeHtml(row.status)}</td>
        <td>${escapeHtml(row.species)}</td>
        <td>${escapeHtml(row.estimatedStock.toLocaleString())}</td>
        <td>${escapeHtml(row.mortalityTotal.toLocaleString())}</td>
        <td>${escapeHtml(row.stockingTotal.toLocaleString())}</td>
        <td>${escapeHtml(row.harvestKgTotal.toFixed(2))} kg</td>
        <td>${escapeHtml(formatDateShort(row.lastActivityAt))}</td>
      </tr>
    `).join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body {
            font-family: Arial, sans-serif;
            color: #0f172a;
            padding: 28px;
            font-size: 12px;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 16px;
            margin-bottom: 18px;
          }
          .logo-row {
            display: flex;
            align-items: center;
            gap: 14px;
          }
          .title-block h1 {
            margin: 0;
            font-size: 24px;
          }
          .title-block p {
            margin: 4px 0 0;
            color: #475569;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
            margin-bottom: 18px;
          }
          .card {
            border: 1px solid #dbeafe;
            border-radius: 12px;
            padding: 12px;
            background: #f8fbff;
          }
          .card h3 {
            margin: 0 0 8px;
            font-size: 14px;
            color: #0369a1;
          }
          .meta {
            margin-bottom: 18px;
            padding: 12px;
            border-radius: 12px;
            background: #eff6ff;
            border: 1px solid #bfdbfe;
          }
          .meta p,
          .card p {
            margin: 4px 0;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
          }
          th, td {
            border: 1px solid #dbe2ea;
            padding: 8px;
            text-align: left;
            vertical-align: top;
          }
          th {
            background: #eff6ff;
            color: #0c4a6e;
          }
          .section-title {
            font-size: 16px;
            margin: 18px 0 8px;
            color: #0f172a;
          }
          ul {
            padding-left: 18px;
            margin: 8px 0 0;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title-block">
            <h1>AquaPin BFAR Operations Summary</h1>
            <p>Printable farm operations report for pond management and handoff.</p>
          </div>
          <div class="logo-row">${logoBlock}</div>
        </div>

        <div class="meta">
          <p><strong>Generated:</strong> ${escapeHtml(formatDateTime(report.generatedAt))}</p>
          <p><strong>Prepared by:</strong> ${escapeHtml(report.generatedBy)}</p>
          <p><strong>Date range:</strong> ${escapeHtml(report.rangeLabel)}</p>
          <p><strong>Last sync:</strong> ${escapeHtml(report.lastSyncLabel)}</p>
          <p><strong>Connectivity:</strong> ${escapeHtml(report.isOnline ? 'Online' : 'Offline')}</p>
        </div>

        <div class="grid">
          <div class="card">
            <h3>Farm Snapshot</h3>
            <p><strong>Total ponds:</strong> ${report.overview.totalPonds}</p>
            <p><strong>Active ponds:</strong> ${report.overview.activePonds}</p>
            <p><strong>Inactive ponds:</strong> ${report.overview.inactivePonds}</p>
            <p><strong>Species tracked:</strong> ${report.overview.speciesCount}</p>
            <p><strong>Pending entries:</strong> ${report.overview.pendingEntries}</p>
          </div>
          <div class="card">
            <h3>Operations Summary</h3>
            <p><strong>Mortality:</strong> ${report.operations.mortalityTotal.toLocaleString()} fish / ${report.operations.mortalityEvents} logs</p>
            <p><strong>Stocking:</strong> ${report.operations.stockingTotal.toLocaleString()} fingerlings / ${report.operations.stockingEvents} events</p>
            <p><strong>Harvest:</strong> ${report.operations.harvestKgTotal.toFixed(2)} kg / ${report.operations.harvestEvents} events</p>
            <p><strong>Partial harvests:</strong> ${report.operations.partialHarvests}</p>
            <p><strong>Full harvests:</strong> ${report.operations.fullHarvests}</p>
            <p><strong>Ponds with activity:</strong> ${report.operations.pondsWithOperations}</p>
          </div>
        </div>

        <div class="card">
          <h3>Top Active Ponds</h3>
          <ul>${topPondsHtml}</ul>
        </div>

        <h2 class="section-title">Pond Summary</h2>
        <table>
          <thead>
            <tr>
              <th>Pond</th>
              <th>Status</th>
              <th>Species</th>
              <th>Est. Stock</th>
              <th>Mortality</th>
              <th>Stocking</th>
              <th>Harvest</th>
              <th>Last Activity</th>
            </tr>
          </thead>
          <tbody>
            ${pondRowsHtml}
          </tbody>
        </table>
      </body>
    </html>
  `;
}
