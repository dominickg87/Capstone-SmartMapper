import type { CarrierAdapter } from './contract.js';
import { proposeFromMappings, recognizeFromDefinitions } from './contract.js';

export const mockClassicAdapter: CarrierAdapter = {
  version: '1.0',
  identity: {
    adapterId: 'mock-classic',
    adapterVersion: '1.0.0',
    displayName: 'Mock Classic Flow',
    carrierKey: 'mock-classic',
    linesOfBusiness: ['synthetic-personal'],
    allowedOrigins: ['http://localhost:4173', 'http://127.0.0.1:4173'],
  },
  pages: [
    {
      pageId: 'risk',
      signals: [
        { kind: 'url_path', value: '/classic', required: true, weight: 0.4 },
        { kind: 'heading', value: 'Risk worksheet', required: false, weight: 0.6 },
        { kind: 'heading', value: 'Property and contact', required: false, weight: 0.6 },
      ],
      expectedValidationErrors: ['This field is required'],
      nextPageIds: ['listed-items'],
      stopPoint: false,
    },
    {
      pageId: 'listed-items',
      signals: [
        { kind: 'heading', value: 'Listed drivers and autos', required: false, weight: 0.8 },
        { kind: 'label', value: 'Auto make', required: false, weight: 0.2 },
      ],
      expectedValidationErrors: [],
      nextPageIds: ['review'],
      stopPoint: false,
    },
    {
      pageId: 'review',
      signals: [
        { kind: 'heading', value: 'Review worksheet', required: true, weight: 1 },
        { kind: 'accessible_name', value: 'Mock submit', required: false, weight: 0.5 },
      ],
      expectedValidationErrors: [],
      nextPageIds: [],
      stopPoint: true,
    },
  ],
  mappings: [
    {
      mappingId: 'classic-first-name',
      pageId: 'risk',
      sourcePathPattern: 'applicant.firstName',
      target: { label: 'Applicant first name', role: 'textbox' },
      aliases: ['Named applicant given name'],
      transformation: 'identity',
      readBackNormalization: 'text',
      confidence: 0.99,
      risk: 'low',
      required: true,
    },
    {
      mappingId: 'classic-last-name',
      pageId: 'risk',
      sourcePathPattern: 'applicant.lastName',
      target: { label: 'Applicant last name', role: 'textbox' },
      aliases: ['Named applicant surname'],
      transformation: 'identity',
      readBackNormalization: 'text',
      confidence: 0.99,
      risk: 'low',
      required: true,
    },
    {
      mappingId: 'classic-phone',
      pageId: 'risk',
      sourcePathPattern: 'applicant.phone',
      target: { label: 'Contact phone', role: 'textbox' },
      aliases: ['Telephone'],
      transformation: 'digits_only',
      readBackNormalization: 'digits',
      confidence: 0.98,
      risk: 'low',
      required: true,
    },
    {
      mappingId: 'classic-year-built',
      pageId: 'risk',
      sourcePathPattern: 'properties[*].yearBuilt',
      target: { label: 'Year built', role: 'spinbutton' },
      aliases: ['Construction year'],
      transformation: 'identity',
      readBackNormalization: 'digits',
      confidence: 0.96,
      risk: 'medium',
      required: true,
      dynamicCollection: 'properties',
    },
    {
      mappingId: 'classic-driver-name',
      pageId: 'listed-items',
      sourcePathPattern: 'drivers[*].firstName',
      target: { label: 'Driver given name', role: 'textbox' },
      aliases: ['Listed driver first name'],
      transformation: 'identity',
      readBackNormalization: 'text',
      confidence: 0.98,
      risk: 'low',
      required: true,
      dynamicCollection: 'drivers',
    },
    {
      mappingId: 'classic-auto-make',
      pageId: 'listed-items',
      sourcePathPattern: 'vehicles[*].make',
      target: { label: 'Auto make', role: 'textbox' },
      aliases: ['Vehicle manufacturer'],
      transformation: 'identity',
      readBackNormalization: 'case_insensitive',
      confidence: 0.98,
      risk: 'low',
      required: true,
      dynamicCollection: 'vehicles',
    },
  ],
  conditionalRules: [
    {
      ruleId: 'classic-prior-loss-detail',
      whenSourcePath: 'priorInsurance.lapseInCoverage',
      operator: 'truthy',
      revealMappingIds: [],
      missingBehavior: 'review',
    },
  ],
  recognizePage(snapshot) {
    return recognizeFromDefinitions(this, snapshot);
  },
  proposeMappings(snapshot) {
    const pageId = snapshot.headings.some((heading) => /review worksheet/i.test(heading))
      ? 'review'
      : snapshot.labels.some((label) => /auto make|vehicle manufacturer/i.test(label))
        ? 'listed-items'
        : 'risk';
    return proposeFromMappings(this.mappings, pageId);
  },
  reviewRequirements(snapshot) {
    const isAmbiguous = snapshot.labels.some((label) => /classification code/i.test(label));
    return isAmbiguous
      ? [
          {
            version: '1.0',
            fieldPath: 'vehicles[0].usage',
            reasonCode: 'ambiguous_target',
            summary: 'Classification code needs an approved business rule or user answer.',
            risk: 'high',
            blocking: true,
          },
        ]
      : [];
  },
  validateAfterFill(snapshot) {
    return snapshot.validationMessages;
  },
};
