import type {
  AutomationAction,
  AutomationActionResult,
  CarrierPageSnapshot,
  MiaQuotePayload,
  QuoteJob,
} from '@smartmapper/contracts';

export interface ExecutionContext {
  job: QuoteJob;
  quote: MiaQuotePayload;
  signal: AbortSignal;
}

export interface Executor {
  readonly mode: 'extension' | 'remote_browser';
  captureSnapshot(): Promise<CarrierPageSnapshot>;
  execute(action: AutomationAction, context: ExecutionContext): Promise<AutomationActionResult>;
  pause(reasonCode: string): Promise<void>;
  resume(): Promise<void>;
  cancel(): Promise<void>;
  dispose(): Promise<void>;
}

export interface InteractiveSessionHandle {
  readonly sessionReference: string;
  readonly expiresAt: string;
}

export interface InteractiveSessionProvider {
  createIsolatedSession(job: QuoteJob): Promise<InteractiveSessionHandle>;
  createReviewHandoff(session: InteractiveSessionHandle): Promise<{ handoffReference: string }>;
  revokeSession(session: InteractiveSessionHandle): Promise<void>;
}
