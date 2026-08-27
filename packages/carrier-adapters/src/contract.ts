import type {
  ActionTarget,
  CarrierPageSnapshot,
  FieldMappingCandidate,
  PageFingerprint,
  ReviewItem,
} from '@smartmapper/contracts';
import type { Normalization, Transformation } from '@smartmapper/automation-core';

export interface AdapterIdentity {
  adapterId: string;
  adapterVersion: string;
  displayName: string;
  carrierKey: string;
  linesOfBusiness: string[];
  allowedOrigins: string[];
}

export interface PageSignal {
  kind: 'url_path' | 'heading' | 'label' | 'accessible_name' | 'nearby_text';
  value: string;
  required: boolean;
  weight: number;
}

export interface PageDefinition {
  pageId: string;
  signals: PageSignal[];
  expectedValidationErrors: string[];
  nextPageIds: string[];
  stopPoint: boolean;
}

export interface AdapterFieldMapping {
  mappingId: string;
  pageId: string;
  sourcePathPattern: string;
  target: ActionTarget;
  aliases: string[];
  transformation: Transformation;
  readBackNormalization: Normalization;
  confidence: number;
  risk: 'low' | 'medium' | 'high';
  required: boolean;
  dynamicCollection?: 'drivers' | 'vehicles' | 'properties';
}

export interface ConditionalRule {
  ruleId: string;
  whenSourcePath: string;
  operator: 'equals' | 'truthy' | 'present';
  expected?: string | boolean;
  revealMappingIds: string[];
  missingBehavior: 'review' | 'skip';
}

export interface CarrierAdapter {
  version: '1.0';
  identity: AdapterIdentity;
  pages: PageDefinition[];
  mappings: AdapterFieldMapping[];
  conditionalRules: ConditionalRule[];
  recognizePage(snapshot: CarrierPageSnapshot): PageFingerprint | undefined;
  proposeMappings(snapshot: CarrierPageSnapshot): FieldMappingCandidate[];
  reviewRequirements(
    snapshot: CarrierPageSnapshot,
  ): Omit<ReviewItem, 'jobId' | 'reviewItemId' | 'createdAt'>[];
  validateAfterFill(snapshot: CarrierPageSnapshot): string[];
}

export function isAllowedAdapterUrl(adapter: CarrierAdapter, url: string): boolean {
  const origin = new URL(url).origin;
  return adapter.identity.allowedOrigins.includes(origin);
}

function simpleFingerprint(value: string): string {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const block = (hash >>> 0).toString(16).padStart(8, '0');
  return block.repeat(8);
}

export function recognizeFromDefinitions(
  adapter: Pick<CarrierAdapter, 'identity' | 'pages'>,
  snapshot: CarrierPageSnapshot,
): PageFingerprint | undefined {
  if (!adapter.identity.allowedOrigins.includes(new URL(snapshot.url).origin)) {
    return undefined;
  }

  const searchable = [
    new URL(snapshot.url).pathname,
    ...snapshot.headings,
    ...snapshot.labels,
    ...snapshot.controls.flatMap((control) => [
      control.accessibleName ?? '',
      control.label ?? '',
      ...control.nearbyText,
    ]),
  ]
    .join(' ')
    .toLocaleLowerCase();

  const candidates = adapter.pages
    .map((page) => {
      const requiredSignalsMatch = page.signals
        .filter((signal) => signal.required)
        .every((signal) => searchable.includes(signal.value.toLocaleLowerCase()));
      const score = page.signals
        .filter((signal) => searchable.includes(signal.value.toLocaleLowerCase()))
        .reduce((total, signal) => total + signal.weight, 0);
      return { page, requiredSignalsMatch, score };
    })
    .filter((candidate) => candidate.requiredSignalsMatch)
    .sort((left, right) => right.score - left.score);

  const best = candidates[0];
  if (!best || best.score <= 0) {
    return undefined;
  }

  const matchedSignals = best.page.signals
    .filter((signal) => searchable.includes(signal.value.toLocaleLowerCase()))
    .map((signal) => signal.kind + ':' + signal.value);
  const fingerprintInput = [
    adapter.identity.adapterId,
    adapter.identity.adapterVersion,
    best.page.pageId,
    ...matchedSignals,
  ].join('|');

  return {
    version: '1.0',
    adapterId: adapter.identity.adapterId,
    adapterVersion: adapter.identity.adapterVersion,
    pageId: best.page.pageId,
    hash: simpleFingerprint(fingerprintInput),
    matchedSignals,
  };
}

export function proposeFromMappings(
  mappings: AdapterFieldMapping[],
  pageId: string,
): FieldMappingCandidate[] {
  return mappings
    .filter((mapping) => mapping.pageId === pageId)
    .map((mapping) => ({
      version: '1.0',
      sourcePath: mapping.sourcePathPattern.replace('[*]', '[0]'),
      target: mapping.target,
      evidence: [
        {
          kind: 'adapter_rule',
          detail: mapping.mappingId,
          weight: 1,
        },
      ],
      confidence: mapping.confidence,
      risk: mapping.risk,
      requiresReview: mapping.risk === 'high' || mapping.confidence < 0.85,
    }));
}
