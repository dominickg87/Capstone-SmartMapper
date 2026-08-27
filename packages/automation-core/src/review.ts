import type { ReviewItem, RiskClassification } from '@smartmapper/contracts';

export interface ReviewItemInput {
  jobId: string;
  fieldPath?: string | undefined;
  reasonCode: ReviewItem['reasonCode'];
  summary: string;
  risk: RiskClassification;
  blocking: boolean;
}

export class UnresolvedFieldCollector {
  private readonly itemsByKey = new Map<string, ReviewItem>();

  public add(input: ReviewItemInput, createdAt = new Date().toISOString()): ReviewItem {
    const key = (input.fieldPath ?? 'job') + ':' + input.reasonCode;
    const optionalFieldPath = input.fieldPath ? { fieldPath: input.fieldPath } : {};
    const item: ReviewItem = {
      version: '1.0',
      reviewItemId: input.jobId + ':' + key,
      jobId: input.jobId,
      ...optionalFieldPath,
      reasonCode: input.reasonCode,
      summary: input.summary,
      risk: input.risk,
      blocking: input.blocking,
      createdAt,
    };

    this.itemsByKey.set(key, item);
    return item;
  }

  public all(): ReviewItem[] {
    return [...this.itemsByKey.values()];
  }
}

export interface SafeStopSignals {
  pageText: string;
  authenticationRequired: boolean;
  missingRequiredFields: boolean;
  mappingConfidence?: number;
}

export interface SafeStopDecision {
  shouldStop: boolean;
  reasonCode: string;
}

const legalOrFinalAction =
  /\b(submit|bind|purchase|electronic signature|attestation|consumer report authorization|accept terms)\b/i;

export function evaluateSafeStop(signals: SafeStopSignals): SafeStopDecision {
  if (legalOrFinalAction.test(signals.pageText)) {
    return { shouldStop: true, reasonCode: 'final_or_legal_action_detected' };
  }
  if (signals.authenticationRequired) {
    return { shouldStop: true, reasonCode: 'authentication_required' };
  }
  if (signals.missingRequiredFields) {
    return { shouldStop: true, reasonCode: 'required_source_missing' };
  }
  if (signals.mappingConfidence !== undefined && signals.mappingConfidence < 0.85) {
    return { shouldStop: true, reasonCode: 'low_confidence_mapping' };
  }

  return { shouldStop: false, reasonCode: 'safe_to_continue' };
}
