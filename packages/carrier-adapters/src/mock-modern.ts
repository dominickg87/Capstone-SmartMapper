import type { CarrierAdapter } from './contract.js';
import { proposeFromMappings, recognizeFromDefinitions } from './contract.js';

const allowedOrigins = ['http://localhost:4173', 'http://127.0.0.1:4173'];

export const mockModernAdapter: CarrierAdapter = {
  version: '1.0',
  identity: {
    adapterId: 'mock-modern',
    adapterVersion: '1.0.0',
    displayName: 'Mock Modern Flow',
    carrierKey: 'mock-modern',
    linesOfBusiness: ['synthetic-personal'],
    allowedOrigins,
  },
  pages: [
    {
      pageId: 'applicant',
      signals: [
        { kind: 'url_path', value: '/modern', required: true, weight: 0.4 },
        { kind: 'heading', value: 'Applicant details', required: false, weight: 0.6 },
        { kind: 'heading', value: 'Tell us about the applicant', required: false, weight: 0.6 },
      ],
      expectedValidationErrors: ['Complete the highlighted fields'],
      nextPageIds: ['household'],
      stopPoint: false,
    },
    {
      pageId: 'household',
      signals: [
        { kind: 'heading', value: 'Drivers and vehicles', required: false, weight: 0.7 },
        { kind: 'label', value: 'Vehicle year', required: false, weight: 0.3 },
      ],
      expectedValidationErrors: ['Add at least one driver'],
      nextPageIds: ['review'],
      stopPoint: false,
    },
    {
      pageId: 'review',
      signals: [
        { kind: 'heading', value: 'Mock quote review', required: true, weight: 1 },
        { kind: 'accessible_name', value: 'Mock submit', required: false, weight: 0.5 },
      ],
      expectedValidationErrors: [],
      nextPageIds: [],
      stopPoint: true,
    },
  ],
  mappings: [
    {
      mappingId: 'modern-applicant-first-name',
      pageId: 'applicant',
      sourcePathPattern: 'applicant.firstName',
      target: { label: 'First name', role: 'textbox' },
      aliases: ['Given name'],
      transformation: 'identity',
      readBackNormalization: 'text',
      confidence: 0.99,
      risk: 'low',
      required: true,
    },
    {
      mappingId: 'modern-applicant-dob',
      pageId: 'applicant',
      sourcePathPattern: 'applicant.dateOfBirth',
      target: { label: 'Date of birth', role: 'textbox' },
      aliases: ['Birth date'],
      transformation: 'identity',
      readBackNormalization: 'date',
      confidence: 0.99,
      risk: 'medium',
      required: true,
    },
    {
      mappingId: 'modern-state',
      pageId: 'applicant',
      sourcePathPattern: 'applicant.address.stateCode',
      target: { label: 'State', role: 'combobox' },
      aliases: ['Residence state'],
      transformation: 'uppercase',
      readBackNormalization: 'case_insensitive',
      confidence: 0.98,
      risk: 'low',
      required: true,
    },
    {
      mappingId: 'modern-currently-insured',
      pageId: 'applicant',
      sourcePathPattern: 'priorInsurance.currentlyInsured',
      target: { label: 'Currently insured', role: 'checkbox' },
      aliases: ['Active insurance'],
      transformation: 'identity',
      readBackNormalization: 'boolean',
      confidence: 0.98,
      risk: 'low',
      required: false,
    },
    {
      mappingId: 'modern-driver-dob',
      pageId: 'household',
      sourcePathPattern: 'drivers[*].dateOfBirth',
      target: { label: 'Driver date of birth', role: 'textbox' },
      aliases: ['Driver birth date'],
      transformation: 'identity',
      readBackNormalization: 'date',
      confidence: 0.97,
      risk: 'medium',
      required: true,
      dynamicCollection: 'drivers',
    },
    {
      mappingId: 'modern-vehicle-year',
      pageId: 'household',
      sourcePathPattern: 'vehicles[*].year',
      target: { label: 'Vehicle year', role: 'spinbutton' },
      aliases: ['Model year'],
      transformation: 'identity',
      readBackNormalization: 'digits',
      confidence: 0.99,
      risk: 'low',
      required: true,
      dynamicCollection: 'vehicles',
    },
  ],
  conditionalRules: [
    {
      ruleId: 'modern-prior-carrier',
      whenSourcePath: 'priorInsurance.currentlyInsured',
      operator: 'truthy',
      revealMappingIds: [],
      missingBehavior: 'review',
    },
  ],
  recognizePage(snapshot) {
    return recognizeFromDefinitions(this, snapshot);
  },
  proposeMappings(snapshot) {
    const pageId = snapshot.headings.some((heading) => /review/i.test(heading))
      ? 'review'
      : snapshot.labels.some((label) => /vehicle year|model year/i.test(label))
        ? 'household'
        : 'applicant';
    return proposeFromMappings(this.mappings, pageId);
  },
  reviewRequirements(snapshot) {
    const isAmbiguous = snapshot.labels.some((label) =>
      /usage details|classification code/i.test(label),
    );
    return isAmbiguous
      ? [
          {
            version: '1.0',
            fieldPath: 'vehicles[0].usage',
            reasonCode: 'ambiguous_target',
            summary: 'The mock field intentionally has no deterministic semantic match.',
            risk: 'high',
            blocking: false,
          },
        ]
      : [];
  },
  validateAfterFill(snapshot) {
    return snapshot.validationMessages;
  },
};
