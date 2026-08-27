import {
  ActionTargetSchema,
  FieldMappingCandidateSchema,
  MappingEvidenceSchema,
  SourcePathSchema,
  type CarrierPageSnapshot,
  type FieldMappingCandidate,
} from '@smartmapper/contracts';
import { z } from 'zod';

export const FieldSchemaMetadataSchema = z
  .object({
    sourcePath: SourcePathSchema,
    displayName: z.string().min(1),
    description: z.string().min(1),
    dataType: z.enum(['text', 'date', 'number', 'boolean', 'enum']),
    risk: z.enum(['low', 'medium', 'high']),
  })
  .strict();

export const SanitizedMappingRequestSchema = z
  .object({
    version: z.literal('1.0'),
    page: z.custom<CarrierPageSnapshot>(),
    fields: z.array(FieldSchemaMetadataSchema),
    adapterHints: z.array(
      z
        .object({
          sourcePath: SourcePathSchema,
          target: ActionTargetSchema,
        })
        .strict(),
    ),
    priorApprovedMappings: z.array(FieldMappingCandidateSchema),
  })
  .strict();
export type SanitizedMappingRequest = z.infer<typeof SanitizedMappingRequestSchema>;

export const MappingProposalSchema = z
  .object({
    version: z.literal('1.0'),
    provider: z.string().min(1),
    candidates: z.array(FieldMappingCandidateSchema),
    unresolvedSourcePaths: z.array(SourcePathSchema),
    notes: z.array(z.string()),
  })
  .strict();
export type MappingProposal = z.infer<typeof MappingProposalSchema>;

export interface AiMapperProvider {
  readonly providerId: string;
  proposeMappings(request: SanitizedMappingRequest): Promise<MappingProposal>;
}

function normalizedTokens(value: string): string[] {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

export class DeterministicMockAiMapper implements AiMapperProvider {
  public readonly providerId = 'deterministic-mock';

  public proposeMappings(request: SanitizedMappingRequest): Promise<MappingProposal> {
    const parsed = SanitizedMappingRequestSchema.parse(request);
    const candidates: FieldMappingCandidate[] = [];
    const unresolvedSourcePaths: string[] = [];

    for (const field of parsed.fields) {
      const adapterHint = parsed.adapterHints.find((hint) => hint.sourcePath === field.sourcePath);
      if (adapterHint) {
        candidates.push({
          version: '1.0',
          sourcePath: field.sourcePath,
          target: adapterHint.target,
          evidence: [
            MappingEvidenceSchema.parse({
              kind: 'adapter_rule',
              detail: 'Deterministic adapter hint',
              weight: 1,
            }),
          ],
          confidence: 0.99,
          risk: field.risk,
          requiresReview: field.risk === 'high',
        });
        continue;
      }

      const fieldTokens = normalizedTokens(field.displayName + ' ' + field.description);
      const matchingControl = parsed.page.controls.find((control) => {
        const controlTokens = normalizedTokens(
          [control.label, control.accessibleName, ...control.nearbyText].filter(Boolean).join(' '),
        );
        return fieldTokens.some((token) => controlTokens.includes(token));
      });

      if (!matchingControl) {
        unresolvedSourcePaths.push(field.sourcePath);
        continue;
      }

      candidates.push({
        version: '1.0',
        sourcePath: field.sourcePath,
        target: {
          accessibleName:
            matchingControl.accessibleName ?? matchingControl.label ?? 'Unknown control',
          role:
            matchingControl.role === 'select'
              ? 'combobox'
              : matchingControl.role === 'input'
                ? 'textbox'
                : 'textbox',
        },
        evidence: [
          {
            kind: 'semantic_similarity',
            detail: 'Deterministic token overlap in sanitized metadata',
            weight: 0.7,
          },
        ],
        confidence: 0.7,
        risk: field.risk,
        requiresReview: true,
      });
    }

    return Promise.resolve(
      MappingProposalSchema.parse({
        version: '1.0',
        provider: this.providerId,
        candidates,
        unresolvedSourcePaths,
        notes: [
          'Mock mapping is deterministic and offline.',
          'Model-style output is treated as untrusted and schema validated.',
        ],
      }),
    );
  }
}
