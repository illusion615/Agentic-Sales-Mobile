export type FeedbackType = 'bug' | 'enhancement';

export type FeedbackSubmissionStatus =
  | 'collected'
  | 'submitting'
  | 'submitted'
  | 'failed'
  | 'duplicate';

export type FeedbackSource = 'copilot' | 'manual';

/** App-facing contract for user-confirmed product feedback. */
export interface AppFeedback {
  id: string;
  title: string;
  type: FeedbackType;
  description: string;
  expectedOutcome?: string;
  reproductionSteps?: string;
  currentPage?: string;
  appVersion: string;
  buildId: string;
  locale: string;
  device?: string;
  os?: string;
  browser?: string;
  source: FeedbackSource;
  status: FeedbackSubmissionStatus;
  clientRequestId: string;
  submittedOn: string;
  githubIssueNumber?: number;
  githubIssueUrl?: string;
  syncError?: string;
  ownerid?: string;
  createdon?: string;
}

export const _AppFeedback = 'AppFeedback' as const;
