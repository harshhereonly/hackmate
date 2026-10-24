// Typed models for the HackMate REST API. They mirror the Pydantic schemas
// in backend/app/schemas. Timestamps are ISO-8601 strings in UTC.

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert'
export type PreferredExperience = 'any' | ExperienceLevel
export type Availability = 'limited' | 'weekends' | 'part_time' | 'full_time' | 'unavailable'
export type CollaborationMode = 'remote' | 'in_person' | 'hybrid'
export type Role =
  | 'frontend' | 'backend' | 'fullstack' | 'mobile' | 'ml' | 'data' | 'design'
  | 'devops' | 'security' | 'blockchain' | 'hardware' | 'research' | 'product'
export type Visibility = 'public' | 'members' | 'hidden'
export type MessagePermission = 'everyone' | 'teammates'
export type ProjectStatus = 'recruiting' | 'active' | 'completed'
export type ProjectCategory =
  | 'hackathon' | 'open_source' | 'research' | 'startup' | 'academic' | 'social_impact' | 'side_project' | 'other'
export type RequestKind = 'application' | 'invitation'
export type RequestStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn'
export type OpportunityType = 'hackathon' | 'project' | 'research'
export type OpportunityMode = 'online' | 'in_person' | 'hybrid'
export type SourceKind = 'curated' | 'community' | 'demo' | 'feed'
export type Timing = 'upcoming' | 'ongoing' | 'open' | 'closed' | 'past' | 'unscheduled'
export type ApplicationStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn'
export type ReportTargetType = 'user' | 'project' | 'opportunity' | 'message'
export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'misleading' | 'scam' | 'other'
export type ReportStatus = 'open' | 'resolved' | 'dismissed'

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface PersonSummary {
  handle: string | null
  name: string
  avatar_url: string | null
  headline: string | null
  experience_level: string | null
  is_private: boolean
}

// --- Auth -------------------------------------------------------------------

export interface AuthUser {
  id: string
  email: string
  role: 'user' | 'admin'
  email_verified: boolean
  created_at: string
  profile: { handle: string; name: string; avatar_url: string | null } | null
}

export interface SessionResponse {
  user: AuthUser
  csrf_token: string
}

export interface SignupResponse {
  user: AuthUser | null
  csrf_token: string
  verification_required: boolean
  email_delivery: 'sent' | 'not_configured' | 'failed'
}

export interface EmailActionResponse {
  message: string
  email_delivery: 'enabled' | 'not_configured'
}

export interface PublicConfig {
  environment: string
  email_delivery_enabled: boolean
  email_verification_required: boolean
  in_memory_database: boolean
  external_providers_enabled: boolean
}

// --- Profiles ---------------------------------------------------------------

export interface ProfileCard {
  handle: string
  name: string
  headline: string | null
  avatar_url: string | null
  institution: string | null
  skills: string[]
  interests: string[]
  experience_level: ExperienceLevel | null
  preferred_roles: Role[]
  availability: Availability | null
  collaboration_mode: CollaborationMode | null
  open_to_collaborate: boolean
}

export interface ProfilePublic extends ProfileCard {
  bio: string | null
  background: string | null
  github_url: string | null
  portfolio_url: string | null
  linkedin_url: string | null
  joined_at: string
  is_self: boolean
  can_message: boolean
}

export interface ProfileMe extends ProfilePublic {
  visibility: Visibility
  allow_messages: MessagePermission
  completeness: { percent: number; missing: string[] }
}

export type ProfileUpdate = Partial<{
  name: string
  handle: string
  headline: string
  bio: string
  institution: string
  background: string
  skills: string[]
  interests: string[]
  experience_level: ExperienceLevel | null
  preferred_roles: Role[]
  availability: Availability | null
  collaboration_mode: CollaborationMode | null
  github_url: string | null
  portfolio_url: string | null
  linkedin_url: string | null
  visibility: Visibility
  allow_messages: MessagePermission
  open_to_collaborate: boolean
}>

// --- Projects and requests -----------------------------------------------------

export interface ProjectListItem {
  id: string
  title: string
  summary: string
  required_skills: string[]
  roles_needed: Role[]
  preferred_experience: PreferredExperience
  status: ProjectStatus
  category: ProjectCategory
  collaboration_mode: CollaborationMode
  member_count: number
  max_team_size: number
  open_spots: number
  owner: PersonSummary
  created_at: string
  updated_at: string
  is_removed: boolean
}

export interface ProjectDetail extends ProjectListItem {
  description: string
  repo_url: string | null
  opportunity: { id: string; title: string; type: OpportunityType } | null
  viewer: {
    is_owner: boolean
    is_member: boolean
    request: { id: string; kind: RequestKind; status: RequestStatus } | null
    can_request: boolean
    cannot_request_reason: string | null
  }
  removed_reason: string | null
}

export interface ProjectInput {
  title: string
  summary: string
  description: string
  required_skills: string[]
  roles_needed: Role[]
  preferred_experience: PreferredExperience
  max_team_size: number
  status: ProjectStatus
  category: ProjectCategory
  collaboration_mode: CollaborationMode
  repo_url: string | null
  opportunity_id: string | null
}

export interface ProjectMember {
  person: PersonSummary
  role: 'owner' | 'member'
  functional_role: Role | null
  joined_at: string
  is_you: boolean
}

export interface JoinRequest {
  id: string
  kind: RequestKind
  status: RequestStatus
  direction: 'incoming' | 'outgoing'
  message: string
  role: Role | null
  project: { id: string; title: string; status: ProjectStatus; member_count: number; max_team_size: number } | null
  person: PersonSummary
  created_at: string
  decided_at: string | null
  decision_note: string | null
  can_decide: boolean
  can_withdraw: boolean
}

// --- Notifications ------------------------------------------------------------

export interface AppNotification {
  id: string
  type: string
  title: string
  body: string
  link: string | null
  read: boolean
  created_at: string
}

// --- Opportunities and research -----------------------------------------------

export interface Opportunity {
  id: string
  key: string
  type: OpportunityType
  title: string
  summary: string
  description: string
  organizer: string
  url: string | null
  source: { kind: SourceKind; name: string; url: string | null }
  skills: string[]
  tags: string[]
  mode: OpportunityMode | null
  location: string
  starts_at: string | null
  ends_at: string | null
  deadline: string | null
  timing: Timing
  is_demo: boolean
  verified: boolean
  accepts_applications: boolean
  posted_by: PersonSummary | null
  teams_forming: number
  is_removed: boolean
  created_at: string
  viewer: {
    saved: boolean
    is_owner: boolean
    application: { id: string; status: ApplicationStatus } | null
    can_apply: boolean
    cannot_apply_reason: string | null
  } | null
}

export interface OpportunityInput {
  title: string
  summary: string
  description: string
  organizer: string
  url: string | null
  skills: string[]
  tags: string[]
  mode: OpportunityMode | null
  location: string
  starts_at: string | null
  ends_at: string | null
  deadline: string | null
  accepts_applications: boolean
}

export interface CuratedOpportunityInput extends OpportunityInput {
  type: OpportunityType
  source_name: string
  source_url: string | null
}

export interface OpportunityApplication {
  id: string
  status: ApplicationStatus
  direction: 'incoming' | 'outgoing'
  message: string
  opportunity: { id: string; title: string; type: OpportunityType } | null
  person: PersonSummary
  created_at: string
  decided_at: string | null
  can_decide: boolean
  can_withdraw: boolean
}

export interface Paper {
  key: string
  source: 'openalex' | 'crossref'
  title: string
  authors: string[]
  published: string | null
  venue: string | null
  doi: string | null
  url: string | null
  abstract: string | null
  open_access: boolean | null
  open_access_url: string | null
  cited_by: number | null
  type: string | null
}

export interface OpenSourceIssue {
  key: string
  title: string
  repository: string
  url: string
  labels: string[]
  language: string | null
  comments: number
  summary: string
  updated_at: string | null
}

export interface ProviderPage<T> extends Page<T> {
  source: string
  attribution: string
  notice: string | null
}

export interface ProviderStatus {
  id: string
  name: string
  enabled: boolean
  note: string
  last_check: { ok: boolean; reason: string | null; checked_at: string } | null
}

export type SavedItemType = 'hackathon' | 'project' | 'research' | 'paper' | 'issue'

export interface SavedItem {
  item_key: string
  item_type: SavedItemType
  title: string
  subtitle: string | null
  url: string | null
  internal_path: string | null
  available: boolean
  saved_at: string
}

export interface SaveItemInput {
  item_key: string
  title?: string
  url?: string | null
  subtitle?: string | null
  item_type?: SavedItemType
}

// --- Matching -------------------------------------------------------------------

export interface ScoreComponent {
  component: string
  label: string
  points: number
  max_points: number
}

export interface Explained {
  score: number | null
  confidence: 'high' | 'medium' | 'low'
  reasons: string[]
  cautions: string[]
  breakdown: ScoreComponent[]
}

export interface TeammateSuggestion extends Explained {
  person: ProfileCard
}

export interface OpportunitySuggestion extends Explained {
  kind: 'opportunity' | 'project'
  id: string
  title: string
  summary: string
  type: string
  path: string
  timing: string
  is_demo: boolean
}

export interface Suggestions<T> {
  items: T[]
  method: 'rule_based'
  method_description: string
  notice: string | null
}

// --- Messaging --------------------------------------------------------------------

export interface Conversation {
  id: string
  kind: 'direct' | 'project'
  title: string
  participants: PersonSummary[]
  project: { id: string; title: string } | null
  last_message: { preview: string; sender_is_me: boolean; created_at: string } | null
  unread_count: number
  can_send: boolean
  cannot_send_reason: string | null
  updated_at: string
}

export interface Message {
  id: string
  sender: PersonSummary
  is_mine: boolean
  body: string
  deleted: boolean
  created_at: string
  seen_by: number
}

export interface MessagePage {
  items: Message[]
  has_more: boolean
}

export interface UnreadMessages {
  conversations: number
  messages: number
}

// --- Reports and admin ------------------------------------------------------------

export interface Report {
  id: string
  target_type: ReportTargetType
  reason: ReportReason
  details: string
  status: ReportStatus
  created_at: string
  resolved_at: string | null
  target_label: string
}

export interface AdminStats {
  users: Record<string, number>
  projects: Record<string, number>
  requests: Record<string, number>
  opportunities: Record<string, number>
  reports: Record<string, number>
  messaging: Record<string, number>
}

export interface AdminUser {
  id: string
  email: string
  role: 'user' | 'admin'
  status: 'active' | 'suspended'
  email_verified: boolean
  created_at: string
  last_login_at: string | null
  suspended_reason: string | null
  handle: string | null
  name: string | null
  projects_owned: number
  open_reports: number
  is_demo: boolean
}

export interface AdminReport {
  id: string
  target_type: ReportTargetType
  target_id: string
  target: {
    exists: boolean
    label: string | null
    path?: string | null
    status?: string | null
    is_removed?: boolean
    body?: string
    deleted?: boolean
    sender?: { name: string; handle: string } | null
    user_id?: string
  }
  reason: ReportReason
  details: string
  status: ReportStatus
  reporter: { name: string; handle?: string }
  created_at: string
  resolved_at: string | null
  resolution_note: string | null
  resolved_by: string | null
}

export interface AdminListing {
  id: string
  kind: 'project' | 'opportunity'
  title: string
  type: string
  status: string | null
  source_kind: SourceKind | null
  owner: { handle: string; name: string } | null
  is_removed: boolean
  removed_reason: string | null
  is_demo: boolean
  verified: boolean
  open_reports: number
  created_at: string
}

export interface AuditEntry {
  id: string
  action: string
  target_type: string
  target_id: string
  target_label: string
  reason: string | null
  admin: { name: string; handle?: string }
  created_at: string
}

export interface FeedSyncResult {
  url: string
  imported: number
  updated: number
  skipped: number
  error: string | null
}
