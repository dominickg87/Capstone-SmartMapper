import { z } from 'zod';

import { PageControlSchema, PageObservationSchema } from './smartmapper.js';

const id = z.string().min(1).max(256);
const shortText = z.string().trim().max(2000);
const scalar = z.union([z.string().max(8000), z.number().finite(), z.boolean()]);
const origin = z
  .string()
  .url()
  .refine((value) => new URL(value).origin === value, 'Expected an origin');

export const MappingLineOfBusinessSchema = z.enum(['home', 'auto']);
export type MappingLineOfBusiness = z.infer<typeof MappingLineOfBusinessSchema>;

export const CatalogOptionSchema = z.object({ value: scalar, label: shortText }).strict();

export const CatalogConditionSchema = z
  .object({
    path: id,
    op: z.enum(['eq', 'ne', 'truthy', 'falsy']),
    value: scalar.optional(),
  })
  .strict()
  .superRefine((condition, context) => {
    if (['eq', 'ne'].includes(condition.op) && condition.value === undefined)
      context.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'Comparison value is required',
      });
  });

export const CatalogEntityTypeSchema = z.enum(['applicant', 'additionalDriver', 'vehicle']);

export const CatalogEntityLimitSchema = z
  .object({
    key: id,
    entityType: CatalogEntityTypeSchema,
    sourcePattern: id,
    minimumCount: z.number().int().nonnegative(),
    maximumCount: z.number().int().positive(),
    sourceIndexBase: z.number().int().nonnegative(),
  })
  .strict()
  .refine((limit) => limit.minimumCount <= limit.maximumCount, 'Invalid entity limits');

export const CatalogEntitySchema = z
  .object({
    key: id,
    type: CatalogEntityTypeSchema,
    index: z.number().int().nonnegative(),
    position: z.number().int().positive(),
    label: shortText,
  })
  .strict();

export const MiaCatalogFieldSchema = z
  .object({
    fieldId: id,
    sourcePath: id,
    sourcePattern: id,
    question: z.string().trim().min(1).max(4000),
    section: shortText,
    context: z.array(shortText).max(30),
    options: z.array(CatalogOptionSchema).max(300),
    conditions: z.array(CatalogConditionSchema).max(30),
    conditionalReview: z.boolean(),
    dataType: z.enum(['text', 'date', 'number', 'boolean', 'enum', 'multiselect']),
    entity: CatalogEntitySchema.nullable(),
  })
  .strict();
export type MiaCatalogField = z.infer<typeof MiaCatalogFieldSchema>;

export const MiaCatalogTemplateSchema = MiaCatalogFieldSchema.omit({
  fieldId: true,
  sourcePath: true,
  entity: true,
})
  .extend({
    templateId: id,
  })
  .strict();

export const MiaFieldCatalogSchema = z
  .object({
    version: z.literal('2.0'),
    schemaRevision: id,
    formType: MappingLineOfBusinessSchema,
    entityLimits: z.array(CatalogEntityLimitSchema).max(20),
    templates: z.array(MiaCatalogTemplateSchema).max(500),
    fields: z.array(MiaCatalogFieldSchema).max(3000),
  })
  .strict()
  .refine(
    (catalog) =>
      new Set(catalog.fields.map((field) => field.fieldId)).size === catalog.fields.length,
    'Duplicate catalog field IDs',
  );
export type MiaFieldCatalog = z.infer<typeof MiaFieldCatalogSchema>;

export const TrainingBindingSchema = z
  .object({
    tenantId: id,
    userId: id,
    carrierOrigin: origin,
    tabId: z.number().int().nonnegative(),
    formType: MappingLineOfBusinessSchema,
    expiresAt: z.iso.datetime(),
  })
  .strict();
export type TrainingBinding = z.infer<typeof TrainingBindingSchema>;

export const RedeemedTrainingGrantSchema = z
  .object({
    version: z.literal('2.0'),
    binding: TrainingBindingSchema,
    catalog: MiaFieldCatalogSchema,
  })
  .strict();
export type RedeemedTrainingGrant = z.infer<typeof RedeemedTrainingGrantSchema>;

export const CarrierWorkflowIdentitySchema = z
  .object({
    carrierOrigin: origin,
    carrierBaseUrl: z
      .string()
      .url()
      .max(2000)
      .refine((value) => {
        const url = new URL(value);
        return !url.username && !url.password && !url.search && !url.hash;
      }, 'Carrier base URL may not contain credentials, a query, or a fragment'),
    workflowName: z.string().trim().min(1).max(120),
    lineOfBusiness: MappingLineOfBusinessSchema,
    stateCode: z
      .string()
      .trim()
      .regex(/^[A-Z]{2}$/)
      .nullable()
      .optional(),
    productCode: z.string().trim().min(1).max(120).nullable().optional(),
    programCode: z.string().trim().min(1).max(120).nullable().optional(),
  })
  .strict()
  .refine(
    (workflow) => new URL(workflow.carrierBaseUrl).origin === workflow.carrierOrigin,
    'Carrier base URL must use the carrier origin',
  );
export type CarrierWorkflowIdentity = z.infer<typeof CarrierWorkflowIdentitySchema>;

export const MappingSourceReferenceSchema = z
  .object({
    sourcePathPattern: id,
    binding: z.enum(['fixed', 'same_position']),
    sourcePath: id.optional(),
    sourceIndexBase: z.number().int().nonnegative().max(100).optional(),
  })
  .strict()
  .superRefine((reference, context) => {
    if (reference.binding === 'fixed' && !reference.sourcePath)
      context.addIssue({
        code: 'custom',
        path: ['sourcePath'],
        message: 'A fixed source binding requires a concrete source path',
      });
    if (reference.binding === 'same_position' && !reference.sourcePathPattern.includes('*'))
      context.addIssue({
        code: 'custom',
        path: ['sourcePathPattern'],
        message: 'A same-position binding requires a wildcard source pattern',
      });
    if (reference.binding === 'same_position' && reference.sourceIndexBase === undefined)
      context.addIssue({
        code: 'custom',
        path: ['sourceIndexBase'],
        message: 'A same-position binding requires the catalog source index base',
      });
    if (reference.binding === 'fixed' && reference.sourceIndexBase !== undefined)
      context.addIssue({
        code: 'custom',
        path: ['sourceIndexBase'],
        message: 'A fixed binding cannot define a source index base',
      });
  });
export type MappingSourceReference = z.infer<typeof MappingSourceReferenceSchema>;

const IdentityTransformSchema = z.object({ kind: z.literal('identity') }).strict();
const DateTransformSchema = z
  .object({
    kind: z.literal('date'),
    format: z.enum(['MM/DD/YYYY', 'M/D/YYYY', 'YYYY-MM-DD', 'MM-DD-YYYY']),
  })
  .strict();
const DatePartTransformSchema = z
  .object({
    kind: z.literal('date_part'),
    part: z.enum(['month', 'day', 'year']),
    pad: z.boolean().default(true),
  })
  .strict();
const PhoneTransformSchema = z
  .object({
    kind: z.literal('phone'),
    format: z.enum(['digits', 'dashes', 'parentheses']),
  })
  .strict();
const EnumTransformSchema = z
  .object({
    kind: z.literal('enum'),
    cases: z
      .array(z.object({ source: scalar, target: scalar }).strict())
      .min(1)
      .max(300),
  })
  .strict();
const BooleanTransformSchema = z
  .object({
    kind: z.literal('boolean'),
    trueValue: scalar,
    falseValue: scalar,
  })
  .strict();
const ComposeTransformSchema = z
  .object({
    kind: z.literal('compose'),
    separator: z.enum([' ', ', ', '-', '/', ' / ']),
  })
  .strict();
const SplitTransformSchema = z
  .object({
    kind: z.literal('split'),
    delimiter: z.enum(['space', 'comma', 'hyphen', 'slash']),
    part: z.number().int().nonnegative().max(20),
  })
  .strict();
const MultiselectMembershipTransformSchema = z
  .object({
    kind: z.literal('multiselect_membership'),
    member: scalar,
  })
  .strict();
const MultiselectJoinTransformSchema = z
  .object({
    kind: z.literal('multiselect_join'),
    separator: z.enum([' ', ', ', '-', '/', ' / ']),
  })
  .strict();

export const MappingTransformSchema = z.discriminatedUnion('kind', [
  IdentityTransformSchema,
  DateTransformSchema,
  DatePartTransformSchema,
  PhoneTransformSchema,
  EnumTransformSchema,
  BooleanTransformSchema,
  ComposeTransformSchema,
  SplitTransformSchema,
  MultiselectMembershipTransformSchema,
  MultiselectJoinTransformSchema,
]);
export type MappingTransform = z.infer<typeof MappingTransformSchema>;

export const MappingDispositionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('source'),
      references: z.array(MappingSourceReferenceSchema).min(1).max(10),
      transform: MappingTransformSchema,
    })
    .strict(),
  z.object({ kind: z.literal('carrier_default') }).strict(),
  z
    .object({
      kind: z.literal('fixed_value'),
      value: scalar,
      classification: z.enum(['agency_operational', 'carrier_operational']),
      reason: z.enum(['approved_agency_identifier', 'approved_carrier_identifier']),
    })
    .strict(),
  z.object({ kind: z.literal('human_required') }).strict(),
  z.object({ kind: z.literal('ignore') }).strict(),
  z.object({ kind: z.literal('leave_blank') }).strict(),
]);
export type MappingDisposition = z.infer<typeof MappingDispositionSchema>;

// Values, checked state and validation text are intentionally excluded. Training and published
// mappings retain carrier structure, never quote/customer values.
export const TrainingControlSnapshotSchema = PageControlSchema.pick({
  locatorHints: true,
  elementId: true,
  key: true,
  tag: true,
  inputType: true,
  role: true,
  label: true,
  section: true,
  context: true,
  required: true,
  disabled: true,
  humanOnly: true,
  ordinaryNext: true,
  choiceGroup: true,
  options: true,
  rect: true,
})
  .extend({
    reference: z
      .object({
        label: z.string().max(240),
        section: z.string().max(240),
        options: z.array(z.string().max(240)).max(300),
      })
      .strict()
      .optional(),
    // Radio option identity is structural; checked state and every other current value are omitted.
    choiceValue: z.string().max(2000).nullable(),
    // These coarse classifications are derived in the extension before carrier text is hashed.
    // They let the server apply narrow workflow and fixed/default policies without retaining text.
    addEntityType: CatalogEntityTypeSchema.nullable(),
    operationalTarget: z.enum(['agency_operational', 'carrier_operational']).nullable(),
    repeatHint: z
      .object({
        entityType: CatalogEntityTypeSchema,
        index: z.number().int().nonnegative().max(99),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type TrainingControlSnapshot = z.infer<typeof TrainingControlSnapshotSchema>;

export const TrainingFieldSchema = z
  .object({
    fieldId: z.string().uuid(),
    logicalFieldId: z.string().uuid().optional(),
    sequence: z.number().int().positive(),
    occurrence: z.number().int().nonnegative(),
    repeatIndex: z.number().int().nonnegative().nullable(),
    repeatEntityType: CatalogEntityTypeSchema.nullable(),
    groupKey: id.nullable(),
    control: TrainingControlSnapshotSchema,
    disposition: MappingDispositionSchema.nullable(),
  })
  .strict();
export type TrainingField = z.infer<typeof TrainingFieldSchema>;

export const TrainingWorkflowControlSchema = z
  .object({
    workflowControlId: z.string().uuid(),
    logicalFieldId: z.string().uuid().optional(),
    sequence: z.number().int().positive(),
    kind: z.enum(['ordinary_next', 'add_entity']),
    entityType: z.enum(['applicant', 'additionalDriver', 'vehicle']).nullable(),
    decision: z.enum(['use', 'ignore']).nullable(),
    control: TrainingControlSnapshotSchema,
  })
  .strict();

export const TrainingPageSchema = z
  .object({
    pageId: z.string().uuid(),
    sequence: z.number().int().positive(),
    scenarioLabel: z.string().trim().min(1).max(120),
    routeId: id,
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    signature: z.string().regex(/^[a-f0-9]{64}$/),
    fields: z.array(TrainingFieldSchema).max(400),
    workflowControls: z.array(TrainingWorkflowControlSchema).max(50),
  })
  .strict();
export type TrainingPage = z.infer<typeof TrainingPageSchema>;

// Training observations deliberately omit customer-entered values, checked state, validation
// messages, page text and images. Only structural carrier metadata crosses the extension boundary.
export const TrainingPageObservationSchema = z
  .object({
    version: PageObservationSchema.shape.version,
    tabId: PageObservationSchema.shape.tabId,
    origin: PageObservationSchema.shape.origin,
    pageStateId: PageObservationSchema.shape.pageStateId,
    documentId: PageObservationSchema.shape.documentId,
    routeId: PageObservationSchema.shape.routeId,
    fingerprint: PageObservationSchema.shape.fingerprint,
    title: PageObservationSchema.shape.title,
    headings: PageObservationSchema.shape.headings,
    controls: z.array(TrainingControlSnapshotSchema).max(400),
    authenticationRequired: PageObservationSchema.shape.authenticationRequired,
    unsupportedFrames: PageObservationSchema.shape.unsupportedFrames,
    omittedControls: PageObservationSchema.shape.omittedControls,
    capturedAt: PageObservationSchema.shape.capturedAt,
  })
  .strict();
export type TrainingPageObservation = z.infer<typeof TrainingPageObservationSchema>;

export const TrainingSessionViewSchema = z
  .object({
    version: z.literal('2.0'),
    trainingId: z.string().uuid(),
    revision: z.number().int().nonnegative(),
    status: z.enum(['draft', 'testable', 'verified', 'cancelled']),
    binding: TrainingBindingSchema,
    workflow: CarrierWorkflowIdentitySchema,
    catalogRevision: id,
    pages: z.array(TrainingPageSchema).max(100),
    mappingId: z.string().uuid().nullable(),
    previewResults: z
      .array(
        z
          .object({
            mappingId: z.string().uuid(),
            pageId: z.string().uuid(),
            draftRevision: z.number().int().nonnegative(),
            verified: z.number().int().nonnegative(),
            failed: z.number().int().nonnegative(),
            reviews: z.number().int().nonnegative(),
            recordedAt: z.iso.datetime(),
          })
          .strict(),
      )
      .max(100)
      .optional(),
  })
  .strict();
export type TrainingSessionView = z.infer<typeof TrainingSessionViewSchema>;

// Published mappings deliberately omit the training-time elementId and rectangle. Runtime matching
// uses the stable hashed key plus a semantic locator bundle and an occurrence disambiguator.
export const StableTargetLocatorSchema = TrainingControlSnapshotSchema.omit({
  elementId: true,
  key: true,
  rect: true,
  disabled: true,
  ordinaryNext: true,
  addEntityType: true,
  repeatHint: true,
})
  .extend({
    // Persistent identities contain only semantic carrier metadata. Content-script element IDs
    // and hashed DOM keys are session hints and may change after a framework rerender.
    signature: z.string().regex(/^[a-f0-9]{64}$/),
    occurrence: z.number().int().nonnegative(),
    repeatIndex: z.number().int().nonnegative().nullable(),
    repeatEntityType: CatalogEntityTypeSchema.nullable(),
    groupKey: id.nullable(),
  })
  .strict();
export type StableTargetLocator = z.infer<typeof StableTargetLocatorSchema>;

export const MappingFieldSchema = z
  .object({
    fieldId: z.string().uuid(),
    logicalFieldId: z.string().uuid().optional(),
    sequence: z.number().int().positive(),
    target: StableTargetLocatorSchema,
    disposition: MappingDispositionSchema,
  })
  .strict();
export type MappingField = z.infer<typeof MappingFieldSchema>;

export const MappingWorkflowControlSchema = z
  .object({
    workflowControlId: z.string().uuid(),
    logicalFieldId: z.string().uuid().optional(),
    sequence: z.number().int().positive(),
    kind: z.enum(['ordinary_next', 'add_entity']),
    entityType: z.enum(['applicant', 'additionalDriver', 'vehicle']).nullable(),
    target: StableTargetLocatorSchema,
  })
  .strict();
export type MappingWorkflowControl = z.infer<typeof MappingWorkflowControlSchema>;

export const MappingPageSchema = z
  .object({
    pageId: z.string().uuid(),
    sequence: z.number().int().positive(),
    scenarioLabel: z.string().trim().min(1).max(120),
    routeId: id,
    signature: z.string().regex(/^[a-f0-9]{64}$/),
    fields: z.array(MappingFieldSchema).max(400),
    workflowControls: z.array(MappingWorkflowControlSchema).max(50),
  })
  .strict();
export type MappingPage = z.infer<typeof MappingPageSchema>;

export const MappingProfileSchema = z
  .object({
    version: z.literal('2.0'),
    mappingId: z.string().uuid(),
    mappingVersion: z.number().int().positive(),
    status: z.enum(['preview', 'testable', 'verified', 'active', 'superseded', 'archived']),
    preview: z
      .object({
        trainingId: z.string().uuid(),
        revision: z.number().int().nonnegative(),
        pageId: z.string().uuid(),
        tabId: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
    tenantId: id,
    createdByUserId: id,
    workflow: CarrierWorkflowIdentitySchema,
    catalogRevision: id,
    entityLimits: z.array(CatalogEntityLimitSchema).max(20),
    pages: z.array(MappingPageSchema).min(1).max(100),
    verification: z
      .object({
        coveredPageIds: z.array(z.string().uuid()).max(100),
        coveredFieldIds: z.array(z.string().uuid()).max(40_000),
        coveredWorkflowControlIds: z.array(z.string().uuid()).max(5_000),
        evidenceDigests: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(500),
        lastVerifiedAt: z.iso.datetime().nullable(),
      })
      .strict()
      .default({
        coveredPageIds: [],
        coveredFieldIds: [],
        coveredWorkflowControlIds: [],
        evidenceDigests: [],
        lastVerifiedAt: null,
      }),
    createdAt: z.iso.datetime(),
    publishedAt: z.iso.datetime(),
  })
  .strict();
export type MappingProfile = z.infer<typeof MappingProfileSchema>;

export const StartTrainingSessionSchema = z
  .object({
    miaOrigin: origin,
    code: z.string().min(32).max(256),
    verifier: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
    carrierOrigin: origin,
    carrierBaseUrl: z.string().url().max(2000),
    tabId: z.number().int().nonnegative(),
    formType: MappingLineOfBusinessSchema,
    workflowName: z.string().trim().min(1).max(120),
    stateCode: z
      .string()
      .trim()
      .regex(/^[A-Z]{2}$/)
      .nullable()
      .optional(),
    productCode: z.string().trim().min(1).max(120).nullable().optional(),
    programCode: z.string().trim().min(1).max(120).nullable().optional(),
  })
  .strict();
export type StartTrainingSession = z.infer<typeof StartTrainingSessionSchema>;

export const CaptureTrainingPageRequestSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    observation: TrainingPageObservationSchema,
    discover: z.boolean().optional(),
    fromPageId: z.string().uuid().optional(),
    scenarioLabel: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const PreviewTrainingPageRequestSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    pageId: z.string().uuid(),
  })
  .strict();

export const SaveTrainingPageRequestSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    scenarioLabel: z.string().trim().min(1).max(120).optional(),
    fields: z
      .array(
        z
          .object({
            fieldId: z.string().uuid(),
            disposition: MappingDispositionSchema.nullable(),
            repeatBinding: z
              .object({
                entityType: CatalogEntityTypeSchema,
                index: z.number().int().nonnegative().max(99),
              })
              .strict()
              .nullable()
              .optional(),
          })
          .strict(),
      )
      .max(400),
    workflowControls: z
      .array(
        z
          .object({
            workflowControlId: z.string().uuid(),
            decision: z.enum(['use', 'ignore']).nullable(),
          })
          .strict(),
      )
      .max(50)
      .default([]),
  })
  .strict()
  .refine(
    (request) =>
      new Set(request.fields.map((field) => field.fieldId)).size === request.fields.length &&
      new Set(request.workflowControls.map((control) => control.workflowControlId)).size ===
        request.workflowControls.length,
    'Duplicate field IDs',
  );

export const PublishTrainingSessionRequestSchema = z
  .object({ revision: z.number().int().nonnegative() })
  .strict();

export const TrainingSessionResponseSchema = z
  .object({ training: TrainingSessionViewSchema, token: z.string().optional() })
  .strict();

export const TrainingPageResponseSchema = z
  .object({ training: TrainingSessionViewSchema, page: TrainingPageSchema })
  .strict();

export const PublishTrainingSessionResponseSchema = z
  .object({ training: TrainingSessionViewSchema, mapping: MappingProfileSchema })
  .strict();

export const ActivateMappingRequestSchema = z
  .object({ revision: z.number().int().nonnegative(), mappingVersion: z.number().int().positive() })
  .strict();

export const ActivateMappingResponseSchema = z
  .object({ training: TrainingSessionViewSchema, mapping: MappingProfileSchema })
  .strict();

export const VerifyMappingRequestSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    mappingVersion: z.number().int().positive(),
    jobId: z.string().uuid(),
    jobToken: z.string().regex(/^[a-f0-9]{64}\.[A-Za-z0-9_-]{43}$/),
  })
  .strict();

export const MappingProfileResponseSchema = z.object({ mapping: MappingProfileSchema }).strict();

export const MappingProfilesResponseSchema = z
  .object({ mappings: z.array(MappingProfileSchema).max(500) })
  .strict();

export const TrainingLibraryResponseSchema = z
  .object({
    drafts: z.array(TrainingSessionViewSchema).max(500),
    mappings: z.array(MappingProfileSchema).max(500),
  })
  .strict();

export const RecoverTrainingDraftRequestSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    trainingId: z.string().uuid(),
  })
  .strict();

export const OpenSavedMappingRequestSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    mappingId: z.string().uuid(),
    mappingVersion: z.number().int().positive(),
  })
  .strict();
