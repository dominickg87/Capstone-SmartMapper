import {
  AutomationActionSchema,
  type AutomationAction,
  type FieldMappingCandidate,
} from '@smartmapper/contracts';

export interface PolicyDecision {
  disposition: 'allow' | 'review' | 'block';
  reasonCode: string;
}

const prohibitedIntent =
  /\b(submit|bind|purchase|buy|attest|signature|sign|accept terms|authorize report|captcha|mfa bypass)\b/i;

function targetText(action: AutomationAction): string {
  if ('target' in action) {
    return Object.values(action.target).filter(Boolean).join(' ');
  }

  return '';
}

export function evaluateActionPolicy(untrustedAction: unknown): PolicyDecision {
  const parsed = AutomationActionSchema.safeParse(untrustedAction);

  if (!parsed.success) {
    return { disposition: 'block', reasonCode: 'invalid_action_schema' };
  }

  const action = parsed.data;
  if (action.risk === 'prohibited') {
    return { disposition: 'block', reasonCode: 'prohibited_risk' };
  }

  if (prohibitedIntent.test(targetText(action))) {
    return { disposition: 'block', reasonCode: 'prohibited_target_intent' };
  }

  if (action.type === 'setCheckbox' && action.risk !== 'low') {
    return { disposition: 'review', reasonCode: 'checkbox_requires_review' };
  }

  if (action.risk === 'high') {
    return { disposition: 'review', reasonCode: 'high_risk_action' };
  }

  return { disposition: 'allow', reasonCode: 'allowlisted_action' };
}

export function evaluateMappingGate(candidate: FieldMappingCandidate): PolicyDecision {
  if (candidate.risk === 'prohibited') {
    return { disposition: 'block', reasonCode: 'prohibited_mapping' };
  }

  if (candidate.risk === 'high' || candidate.requiresReview) {
    return { disposition: 'review', reasonCode: 'mapping_requires_review' };
  }

  const threshold = candidate.risk === 'medium' ? 0.95 : 0.85;
  if (candidate.confidence < threshold) {
    return { disposition: 'review', reasonCode: 'confidence_below_threshold' };
  }

  return { disposition: 'allow', reasonCode: 'mapping_gate_passed' };
}
