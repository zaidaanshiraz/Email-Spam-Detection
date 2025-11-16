import type { DetectPhishingEmailInput, DetectPhishingEmailOutput } from '@/ai/flows/phishing-email-detection';
import type { UrlRiskAssessmentOutput } from '@/ai/flows/url-risk-assessment';
import type { AiAssistedReplyOutput } from '@/ai/flows/ai-assisted-reply';
import type { SummarizeEmailOutput } from '@/ai/flows/summarize-email';
import type { SecurityBriefingOutput } from '@/ai/flows/security-briefing';
import type { SecurityCoachOutput } from '@/ai/flows/security-coach';

// -------------------------------------------------------------
// Generic Analysis States
// -------------------------------------------------------------
export type AnalysisStatus = 'idle' | 'loading' | 'success' | 'error';

export type EmailAnalysisState = {
  status: AnalysisStatus;
  result: DetectPhishingEmailOutput | null;
  error: string | null;
};

export type UrlAnalysisState = {
  status: AnalysisStatus;
  result: UrlRiskAssessmentOutput | null;
  error: string | null;
};

export type ReplyGenerationState = {
  status: AnalysisStatus;
  result: AiAssistedReplyOutput | null;
  error: string | null;
};

export type SummarizationState = {
  status: AnalysisStatus;
  result: SummarizeEmailOutput | null;
  error: string | null;
};

export type SecurityBriefingState = {
  status: AnalysisStatus;
  result: SecurityBriefingOutput | null;
  error: string | null;
};

// -------------------------------------------------------------
// Mock Email
// -------------------------------------------------------------
export type MockEmail = {
  subject: string;
  senderDomain: string;
  senderIp: string;
  body: string;
  label: string;
  urlList: string[];
};

// -------------------------------------------------------------
// Risk Levels
// -------------------------------------------------------------
export type EmailRiskLevel =
  | 'low'
  | 'medium'
  | 'high'
  | 'analyzing'
  | 'unknown'
  | 'safe'
  | 'suspicious'
  | 'spam';

// -------------------------------------------------------------
// Inbox Email Type (UPDATED — FIXES ALL ERRORS)
// -------------------------------------------------------------
export type InboxEmail = {
  id: string;

  from: {
    name: string;
    email: string;
    avatar: string;
  };

  subject: string;
  snippet: string;
  body: string;
  date: string;
  unread: boolean;
  starred: boolean;
  status: 'inbox' | 'trash';
  tags: string[];

  riskLevel?: EmailRiskLevel;

  // Existing fields (KEEP THEM)
  ipInfo?: {
    ipAddress: string;
    safe: boolean;
    score: number;
  };

  vpnInfo?: {
    isVPN: boolean;
    org?: string;
  };

  // ---------------------------------------------------------
  // NEW OPTIONAL FIELDS — needed by inbox.tsx to stop errors
  // ---------------------------------------------------------
  ip?: string;            // email.ip
  score?: number;         // email.score
  vpn?: string;           // email.vpn
  vpnProvider?: string;   // data.vpnProvider
  senderIp?: string;      // data.senderIp
};

// -------------------------------------------------------------
// Sent Email
// -------------------------------------------------------------
export type SentEmail = {
  id: string;
  to: {
    name: string;
    email: string;
  };
  subject: string;
  body: string;
  date: string;
  riskLevel?: EmailRiskLevel;
  starred: boolean;
};

// -------------------------------------------------------------
// Analysis Request
// -------------------------------------------------------------
export type EmailForAnalysis = DetectPhishingEmailInput;

// -------------------------------------------------------------
// User Settings
// -------------------------------------------------------------
export type UserSettings = {
  sensitivity: number; // 0–100
  replyTone: 'formal' | 'neutral' | 'casual';
};

// -------------------------------------------------------------
// Security Coach Messages
// -------------------------------------------------------------
export type CoachMessage = {
  role: 'user' | 'model';
  content: string;
};
