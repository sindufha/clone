export type AssignmentStatus = 'submitted' | 'pending' | 'overdue' | 'draft' | 'unknown';
export type GradingStatus = 'not_graded' | 'graded' | 'pending';

export interface User {
  id: string;
  nim: string;
  name: string;
  email: string;
  username?: string;
}

export interface AuthResponse {
  success: true;
  csrfToken: string;
  user: User;
  expiresAt: string;
}

export interface SessionValidationResponse {
  success: true;
  user: User;
  expiresAt: string;
  csrfToken: string;
}

export interface CourseSummary {
  id: string;
  name: string;
  code: string;
  url: string;
  scrapedAt: string;
  activityCount: number;
  assignmentCount: number;
  available?: boolean;
}

export interface CourseActivity {
  id: number;
  courseId: string;
  sectionId: number | null;
  name: string;
  type: string;
  link: string;
  position: number;
}

export interface CourseSection {
  id: number;
  courseId: string;
  title: string;
  content: string;
  position: number;
  activities: CourseActivity[];
}

export interface CourseDetail extends CourseSummary {
  description: string;
  sections: CourseSection[];
}

export interface Assignment {
  id: string;
  courseId: string;
  courseName: string;
  courseUrl: string;
  title: string;
  url: string;
  description: string;
  dueAt: string | null;
  submittedAt: string | null;
  status: AssignmentStatus;
  gradingStatus: GradingStatus;
  points: number | null;
  isFinished: boolean;
  scrapedAt: string;
  checkedAt: string | null;
  verified: boolean;
  lastError: string | null;
  dismissedAt: string | null;
  archived: boolean;
}

export interface DashboardStats {
  courses: number;
  assignments: number;
  submitted: number;
  pending: number;
  overdue: number;
  completionRate: number;
  unknown?: number;
}

export interface CourseCandidate { id: string; name: string; url: string; }
export interface CourseLink {
  code: string; name: string; selectedCourseId: string | null; candidates: CourseCandidate[];
}
export interface SyncStatus {
  connected: boolean; nim: string | null; state: 'disconnected' | 'connected' | 'error' | 'needs_login';
  lastError: string | null; lastSyncAt: string | null; requestedAt: string | null;
  latestRun: { startedAt: string; finishedAt: string | null; status: string; courses: number; assignments: number; errors: number; message: string | null } | null;
  courseLinks: CourseLink[];
}

export interface ApiErrorBody {
  success: false;
  error: string;
}
