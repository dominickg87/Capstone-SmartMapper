import {
  MappingProposalSchema,
  SanitizedMappingRequestSchema,
  type AiMapperProvider,
  type MappingProposal,
  type SanitizedMappingRequest,
} from '@smartmapper/ai-mapper';
import {
  ActionTargetSchema,
  type AccessibleControl,
  type ActionTarget,
  type FieldMappingCandidate,
} from '@smartmapper/contracts';

import { fieldDictionary, type FieldSignalDefinition } from './field-dictionary.js';
import { matchAll, type FieldMatch, type ScoredControl } from './matching.js';

/** Human-readable handle for a control, used only in notes and evidence. */
function describeControl(control: AccessibleControl): string {
  return (
    control.label ??
    control.accessibleName ??
    control.name ??
    control.stableId ??
    control.controlKey
  );
}

function toTargetRole(role: string): ActionTarget['role'] {
  switch (role.toLocaleLowerCase()) {
    case 'select':
    case 'combobox':
    case 'listbox':
      return 'combobox';
    case 'spinbutton':
      return 'spinbutton';
    default:
      return 'textbox';
  }
}

/*
 * Build the action target from the control's stable hints. Returns undefined when the
 * control carries nothing but a role: an action that cannot name its destination is an
 * action the executor must not be asked to perform.
 */
function toActionTarget(control: AccessibleControl): ActionTarget | undefined {
  const hints: Record<string, string> = {};
  if (control.label !== undefined && control.label.length > 0) {
    hints['label'] = control.label;
  }
  if (control.accessibleName !== undefined && control.accessibleName.length > 0) {
    hints['accessibleName'] = control.accessibleName;
  }
  if (control.name !== undefined && control.name.length > 0) {
    hints['name'] = control.name;
  }
  if (control.stableId !== undefined && control.stableId.length > 0) {
    hints['stableId'] = control.stableId;
  }

  if (Object.keys(hints).length === 0) {
    return undefined;
  }

  return ActionTargetSchema.parse({ ...hints, role: toTargetRole(control.role) });
}

function candidateFor(
  definition: FieldSignalDefinition,
  control: AccessibleControl,
  score: number,
  evidence: FieldMappingCandidate['evidence'],
  requiresReview: boolean,
): FieldMappingCandidate | undefined {
  const target = toActionTarget(control);
  if (target === undefined) {
    return undefined;
  }

  return {
    version: '1.0',
    sourcePath: definition.sourcePath,
    target,
    evidence,
    confidence: score,
    risk: definition.risk,
    requiresReview,
  };
}

function tieSummary(candidates: readonly ScoredControl[]): string {
  return candidates.map((candidate) => describeControl(candidate.control)).join(', ');
}

/**
 * Field metadata for the sanitized request, derived from the dictionary. Carries
 * vocabulary and risk only — never a quote value.
 */
export function toFieldMetadata(
  definitions: readonly FieldSignalDefinition[] = fieldDictionary,
): SanitizedMappingRequest['fields'] {
  return definitions.map((definition) => ({
    sourcePath: definition.sourcePath,
    displayName: definition.displayName,
    description: definition.description,
    dataType: definition.dataType,
    risk: definition.risk,
  }));
}

/*
 * A no-AI mapping provider.
 *
 * ADR 0003 keeps "no AI ever" as a supported operating mode; this is that mode made
 * real. It sits behind the same AiMapperProvider boundary as any model-backed provider,
 * so the executor, policy gate and review path are identical either way — the only
 * difference is that this one reaches its answer from weighted page signals rather than
 * from a model, offline and with no API key.
 *
 * Outcomes map onto the contract as follows:
 *
 *   matched         candidate at the signal's own weight; evaluateMappingGate allows it
 *   low confidence  candidate flagged requiresReview, so a human sees the evidence
 *   ambiguous       NOT a candidate. A tie means the signals genuinely cannot separate
 *                   two controls, so there is no sound pick to offer; it is reported as
 *                   unresolved with the tied controls named in the notes.
 *   not found       unresolved
 */
export class DeterministicSemanticMatcher implements AiMapperProvider {
  public readonly providerId = 'deterministic-semantic-matcher';

  public constructor(
    private readonly definitions: readonly FieldSignalDefinition[] = fieldDictionary,
  ) {}

  private definitionFor(sourcePath: string): FieldSignalDefinition | undefined {
    return this.definitions.find((definition) => definition.sourcePath === sourcePath);
  }

  public proposeMappings(request: SanitizedMappingRequest): Promise<MappingProposal> {
    const parsed = SanitizedMappingRequestSchema.parse(request);

    const candidates: FieldMappingCandidate[] = [];
    const unresolvedSourcePaths: string[] = [];
    const notes: string[] = [
      'Deterministic signal matching. No model was consulted and no network call was made.',
    ];

    /*
     * An adapter hint is a reviewed, carrier-specific rule. It outranks anything inferred
     * from page signals, so those fields are settled before matching runs and their
     * controls never enter the contest.
     */
    const hinted = new Set<string>();
    for (const field of parsed.fields) {
      const hint = parsed.adapterHints.find((entry) => entry.sourcePath === field.sourcePath);
      if (hint === undefined) {
        continue;
      }

      hinted.add(field.sourcePath);
      candidates.push({
        version: '1.0',
        sourcePath: field.sourcePath,
        target: hint.target,
        evidence: [{ kind: 'adapter_rule', detail: 'Reviewed adapter mapping', weight: 1 }],
        confidence: 0.99,
        risk: field.risk,
        requiresReview: field.risk === 'high',
      });
    }

    const requested = parsed.fields
      .filter((field) => !hinted.has(field.sourcePath))
      .map((field) => this.definitionFor(field.sourcePath))
      .filter((definition): definition is FieldSignalDefinition => definition !== undefined);

    for (const field of parsed.fields) {
      if (hinted.has(field.sourcePath) || this.definitionFor(field.sourcePath) !== undefined) {
        continue;
      }
      unresolvedSourcePaths.push(field.sourcePath);
      notes.push(field.sourcePath + ': no dictionary entry, so no signals to match on.');
    }

    for (const match of matchAll(requested, parsed.page.controls)) {
      this.collect(match, candidates, unresolvedSourcePaths, notes);
    }

    return Promise.resolve(
      MappingProposalSchema.parse({
        version: '1.0',
        provider: this.providerId,
        candidates,
        unresolvedSourcePaths,
        notes,
      }),
    );
  }

  private collect(
    match: FieldMatch,
    candidates: FieldMappingCandidate[],
    unresolvedSourcePaths: string[],
    notes: string[],
  ): void {
    const { definition } = match;

    if (match.outcome === 'notFound') {
      unresolvedSourcePaths.push(definition.sourcePath);
      return;
    }

    if (match.outcome === 'ambiguous') {
      unresolvedSourcePaths.push(definition.sourcePath);
      notes.push(
        definition.sourcePath +
          ': ' +
          String(match.candidates.length) +
          ' controls tied within the ambiguity margin (' +
          tieSummary(match.candidates) +
          '). Left for a human rather than guessed.',
      );
      return;
    }

    const requiresReview = match.outcome === 'lowConfidence' || definition.risk === 'high';
    const candidate = candidateFor(
      definition,
      match.control,
      match.score,
      [...match.evidence],
      requiresReview,
    );

    if (candidate === undefined) {
      unresolvedSourcePaths.push(definition.sourcePath);
      notes.push(
        definition.sourcePath + ': matched a control with no stable target hint; not actionable.',
      );
      return;
    }

    if (match.outcome === 'lowConfidence') {
      notes.push(
        definition.sourcePath +
          ': strongest signal was ' +
          (match.evidence[0]?.detail ?? 'unknown') +
          ', below the fill threshold. Flagged for review.',
      );
    }

    candidates.push(candidate);
  }
}
