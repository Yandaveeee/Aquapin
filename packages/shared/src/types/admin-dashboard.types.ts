export type PondLifecycleEventType = 'pond' | 'stocking' | 'mortality' | 'harvest' | 'history'

export type PondStatus = 'active' | 'inactive'

export interface AdminPondSummary {
  id: string
  name: string
  created_at: string
  location: { lat: number; lng: number } | null
  status: PondStatus
  is_active: boolean
  current_species: string | null
  current_stock_count: number | null
}

export interface AdminPondMetrics {
  totalStocked: number
  totalMortality: number
  totalHarvestKg: number
  survivalRate: number | null
  lastEventAt: string | null
}

export interface PondTimelineEvent {
  id: string
  type: PondLifecycleEventType
  created_at: string
  actor_id: string | null
  summary: string
}

export interface AdminPondDetailResponse {
  pond: AdminPondSummary
  metrics: AdminPondMetrics
  alerts: string[]
  timeline: PondTimelineEvent[]
}

export type PendingUserAction = 'approve' | 'reject'

export interface PendingProfile {
  id: string
  email: string
  role: string
  status: string
  created_at: string
  updated_at?: string
}

export interface PendingUserActionResponse {
  success: boolean
  action: PendingUserAction
  userId: string
  processedAt: string
  profile?: PendingProfile
}
