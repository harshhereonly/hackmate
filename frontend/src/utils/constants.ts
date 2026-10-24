import type {
  ApplicationStatus,
  Availability,
  CollaborationMode,
  ExperienceLevel,
  MessagePermission,
  OpportunityMode,
  OpportunityType,
  PreferredExperience,
  ProjectCategory,
  ProjectStatus,
  ReportReason,
  RequestStatus,
  Role,
  SourceKind,
  Timing,
  Visibility,
} from '../types/api'

export interface Option<T extends string> {
  value: T
  label: string
  hint?: string
}

export const EXPERIENCE_OPTIONS: Option<ExperienceLevel>[] = [
  { value: 'beginner', label: 'Beginner', hint: '0–1 years' },
  { value: 'intermediate', label: 'Intermediate', hint: '1–3 years' },
  { value: 'advanced', label: 'Advanced', hint: '3–5 years' },
  { value: 'expert', label: 'Expert', hint: '5+ years' },
]

export const PREFERRED_EXPERIENCE_OPTIONS: Option<PreferredExperience>[] = [
  { value: 'any', label: 'Any experience level' },
  ...EXPERIENCE_OPTIONS,
]

export const AVAILABILITY_OPTIONS: Option<Availability>[] = [
  { value: 'limited', label: 'A few hours a week' },
  { value: 'weekends', label: 'Weekends' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'full_time', label: 'Full-time' },
  { value: 'unavailable', label: 'Not available right now' },
]

export const MODE_OPTIONS: Option<CollaborationMode>[] = [
  { value: 'remote', label: 'Remote' },
  { value: 'in_person', label: 'In person' },
  { value: 'hybrid', label: 'Hybrid' },
]

export const ROLE_OPTIONS: Option<Role>[] = [
  { value: 'frontend', label: 'Frontend developer' },
  { value: 'backend', label: 'Backend developer' },
  { value: 'fullstack', label: 'Full-stack developer' },
  { value: 'mobile', label: 'Mobile developer' },
  { value: 'ml', label: 'ML/AI engineer' },
  { value: 'data', label: 'Data scientist' },
  { value: 'design', label: 'UI/UX designer' },
  { value: 'devops', label: 'DevOps/cloud engineer' },
  { value: 'security', label: 'Security engineer' },
  { value: 'blockchain', label: 'Blockchain developer' },
  { value: 'hardware', label: 'Hardware/IoT engineer' },
  { value: 'research', label: 'Researcher' },
  { value: 'product', label: 'Product/project lead' },
]

export const VISIBILITY_OPTIONS: Option<Visibility>[] = [
  { value: 'public', label: 'Public', hint: 'Anyone with the link, including people who are not signed in' },
  { value: 'members', label: 'Members only', hint: 'Signed-in HackMate members' },
  { value: 'hidden', label: 'Hidden', hint: 'Only people you already collaborate with' },
]

export const MESSAGE_PERMISSION_OPTIONS: Option<MessagePermission>[] = [
  { value: 'everyone', label: 'Any signed-in member who can see my profile' },
  { value: 'teammates', label: 'Only people I collaborate with' },
]

export const PROJECT_STATUS_OPTIONS: Option<ProjectStatus>[] = [
  { value: 'recruiting', label: 'Recruiting' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
]

export const PROJECT_CATEGORY_OPTIONS: Option<ProjectCategory>[] = [
  { value: 'hackathon', label: 'Hackathon' },
  { value: 'open_source', label: 'Open source' },
  { value: 'research', label: 'Research' },
  { value: 'startup', label: 'Startup' },
  { value: 'academic', label: 'Academic' },
  { value: 'social_impact', label: 'Social impact' },
  { value: 'side_project', label: 'Side project' },
  { value: 'other', label: 'Other' },
]

export const OPPORTUNITY_TYPE_OPTIONS: Option<OpportunityType>[] = [
  { value: 'hackathon', label: 'Hackathons' },
  { value: 'project', label: 'Projects & collaboration' },
  { value: 'research', label: 'Research' },
]

export const OPPORTUNITY_MODE_OPTIONS: Option<OpportunityMode>[] = [
  { value: 'online', label: 'Online' },
  { value: 'in_person', label: 'In person' },
  { value: 'hybrid', label: 'Hybrid' },
]

export const REPORT_REASON_OPTIONS: Option<ReportReason>[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment or abuse' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'misleading', label: 'Misleading or false information' },
  { value: 'scam', label: 'Scam or fraud' },
  { value: 'other', label: 'Something else' },
]

export const TIMING_LABELS: Record<Timing, string> = {
  upcoming: 'Upcoming',
  ongoing: 'Happening now',
  open: 'Open',
  closed: 'Closed',
  past: 'Past',
  unscheduled: 'Dates not listed',
}

export const SOURCE_LABELS: Record<SourceKind, string> = {
  curated: 'Verified by admins',
  community: 'Member post',
  demo: 'Demo data',
  feed: 'Organizer feed',
}

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  rejected: 'Declined',
  withdrawn: 'Withdrawn',
}

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
}

export function labelFor<T extends string>(options: Option<T>[], value: T | null | undefined): string {
  if (!value) return ''
  return options.find((option) => option.value === value)?.label ?? value
}

export const SKILL_SUGGESTIONS = [
  'JavaScript', 'TypeScript', 'React', 'Next.js', 'Vue', 'Svelte', 'HTML', 'CSS', 'Tailwind CSS',
  'Node.js', 'Express', 'Python', 'FastAPI', 'Django', 'Flask', 'Go', 'Rust', 'Java', 'Spring', 'C#', '.NET',
  'C++', 'C', 'Kotlin', 'Swift', 'Flutter', 'Dart', 'React Native', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis',
  'GraphQL', 'REST API', 'Docker', 'Kubernetes', 'AWS', 'Google Cloud', 'Azure', 'Terraform', 'CI/CD', 'Linux',
  'Machine Learning', 'Deep Learning', 'PyTorch', 'TensorFlow', 'scikit-learn', 'NLP', 'Computer Vision', 'LLM',
  'Data Science', 'Data Analysis', 'Pandas', 'SQL', 'Statistics', 'R', 'Tableau', 'Data visualization',
  'Figma', 'UI design', 'UX design', 'User research', 'Prototyping', 'Accessibility', 'Product management',
  'Cybersecurity', 'Solidity', 'Web3', 'Arduino', 'Raspberry Pi', 'IoT', 'Embedded systems', 'Robotics',
  'Technical writing', 'Public speaking', 'LaTeX', 'MATLAB',
]

export const INTEREST_SUGGESTIONS = [
  'Climate', 'Sustainability', 'Health', 'HealthTech', 'EdTech', 'FinTech', 'Social Impact', 'Open Source',
  'Accessibility', 'Privacy', 'Security', 'AI', 'NLP', 'Robotics', 'Games', 'Music', 'Web3', 'Space',
  'Civic Tech', 'Developer Tools', 'Open Data', 'Research', 'Public Health', 'Agriculture', 'Mobility',
]
