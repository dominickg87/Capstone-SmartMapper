export type RunStatus = 'idle' | 'running' | 'paused' | 'cancelled' | 'ready_for_review';

export interface PersistedRunState {
  version: '1.0';
  status: RunStatus;
  quoteReference?: string;
  activeTabId?: number;
  progress: string[];
  reviewItems: string[];
  updatedAt: string;
}

export type ExtensionMessage =
  | { type: 'detect-page' }
  | { type: 'get-state' }
  | { type: 'start-run'; quoteReference: string }
  | { type: 'pause-run' }
  | { type: 'resume-run' }
  | { type: 'cancel-run' };

export interface PageDetection {
  supported: boolean;
  adapterId?: 'mock-modern' | 'mock-classic';
  pagePath: string;
  reason: string;
}

export interface ExtensionResponse {
  state?: PersistedRunState;
  detection?: PageDetection;
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPageDetection(value: unknown): value is PageDetection {
  if (!isRecord(value)) {
    return false;
  }
  const adapterIdIsValid =
    value.adapterId === undefined ||
    value.adapterId === 'mock-modern' ||
    value.adapterId === 'mock-classic';
  return (
    typeof value.supported === 'boolean' &&
    typeof value.pagePath === 'string' &&
    typeof value.reason === 'string' &&
    adapterIdIsValid
  );
}

function isPersistedRunState(value: unknown): value is PersistedRunState {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.version === '1.0' &&
    ['idle', 'running', 'paused', 'cancelled', 'ready_for_review'].includes(String(value.status)) &&
    Array.isArray(value.progress) &&
    value.progress.every((item) => typeof item === 'string') &&
    Array.isArray(value.reviewItems) &&
    value.reviewItems.every((item) => typeof item === 'string') &&
    typeof value.updatedAt === 'string'
  );
}

export function parseExtensionResponse(value: unknown): ExtensionResponse {
  if (!isRecord(value)) {
    return { error: 'The extension returned an invalid response.' };
  }

  return {
    ...(isPersistedRunState(value.state) ? { state: value.state } : {}),
    ...(isPageDetection(value.detection) ? { detection: value.detection } : {}),
    ...(typeof value.error === 'string' ? { error: value.error } : {}),
  };
}

export const initialRunState: PersistedRunState = {
  version: '1.0',
  status: 'idle',
  progress: [],
  reviewItems: [],
  updatedAt: new Date(0).toISOString(),
};
