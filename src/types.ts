/**
 * Types and Interfaces for Gemini Auto MCQ & Quiz Solver Extension
 */

export type ExtensionStatus =
  | 'IDLE'
  | 'LOCKING_TAB'
  | 'SCANNING'
  | 'SOLVING'
  | 'CLICKING'
  | 'VERIFYING'
  | 'SCROLLING'
  | 'SUBMITTING'
  | 'PAUSED'
  | 'PAUSED_CAPTCHA'
  | 'COMPLETED'
  | 'ERROR';

export interface McqOption {
  index: number;
  text: string;
  elementSelector?: string;
  isRadioOrInput?: boolean;
  domElementRef?: any;
}

export interface McqQuestion {
  id: string; // Unique hash based on text and options
  questionNumber: number;
  questionText: string;
  options: string[];
  optionsDetails?: McqOption[];
  containerSelector?: string;
  status: 'UNANSWERED' | 'SOLVING' | 'ANSWERED' | 'FAILED' | 'VERIFIED';
  selectedOptionIndex?: number;
  selectedOptionText?: string;
  confidence?: number;
  rationale?: string;
  retries: number;
  timestamp?: number;
  verified: boolean;
}

export interface ExtensionConfig {
  autoSubmit: boolean;
  clickDelayMs: number;
  scrollDelayMs: number;
  maxRetries: number;
  apiEndpoint: string;
  apiKey: string;
  model: string;
  showOverlayHud: boolean;
  smoothScroll: boolean;
  minConfidence: number;
}

export interface ExtensionStats {
  detected: number;
  answered: number;
  remaining: number;
  failed: number;
  currentQuestionIndex: number;
  currentQuestionText?: string;
  scrollProgress: number; // 0 - 100%
  bottomReached: boolean;
  isComplete: boolean;
  submissionStatus?: 'NOT_SUBMITTED' | 'SUBMITTING' | 'SUCCESS' | 'FAILED';
  submissionMessage?: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warn' | 'error' | 'gemini';
  message: string;
  details?: any;
}

export interface TargetTabInfo {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
}

export interface SolveResponse {
  success: boolean;
  answer_index: number;
  answer: string;
  confidence: number;
  rationale?: string;
  error?: string;
}
