import { describe, expect, it } from 'vitest';
import type {
  MappingField,
  MappingProfile,
  PageControl,
  PageObservation,
  SourceAnswer,
  SourceAnswers,
} from '@smartmapper/contracts';
import {
  compileRegistryPage,
  recognizedOperationalTarget,
  semanticTextDigest,
  stableLocator,
  stablePageSignature,
  stableTargetSignature,
} from './registry.js';

const now = new Date().toISOString();

describe('operational identifier recognition', () => {
  it.each([
    ['Agency Code', 'Policy', [], 'agency_operational'],
    ['Carrier Number', 'Policy', [], 'carrier_operational'],
    ['Code', 'Agent', [], 'agency_operational'],
    ['Identifier', 'Policy', ['Carrier'], 'carrier_operational'],
    ['Demo Agent Code:*', 'Policy', [], null],
    ['Applicant', 'Agency Code', [], null],
    ['Agent Name', 'Policy', [], null],
    ['Agent', 'Policy', [], null],
    ['Date of birth', 'Applicant', ['Agency Code'], null],
  ] as const)(
    'classifies %s identically before and after hashing',
    async (label, section, context, expected) => {
      const live = { label, section, context: [...context] };
      const semantic = async (value: string) =>
        value ? `sha256:${await semanticTextDigest(value)}` : '';
      const persisted = {
        label: await semantic(label),
        section: await semantic(section),
        context: await Promise.all(context.map(semantic)),
      };
      expect(await recognizedOperationalTarget(live)).toBe(expected);
      expect(await recognizedOperationalTarget(persisted)).toBe(expected);
    },
  );
});
const control = (overrides: Partial<PageControl> = {}): PageControl => ({
  elementId: crypto.randomUUID(),
  key: crypto.randomUUID(),
  tag: 'input',
  inputType: 'text',
  role: 'textbox',
  label: 'Field',
  section: 'Section',
  context: [],
  value: '',
  checked: false,
  required: false,
  requiredSatisfied: true,
  disabled: false,
  humanOnly: false,
  ordinaryNext: false,
  choiceGroup: null,
  options: [],
  errors: [],
  rect: { x: 0, y: 0, width: 100, height: 20 },
  ...overrides,
});
const page = (controls: PageControl[]): PageObservation => ({
  version: '2.0',
  tabId: 1,
  origin: 'https://carrier.test',
  pageStateId: crypto.randomUUID(),
  documentId: crypto.randomUUID(),
  routeId: 'route',
  fingerprint: 'a'.repeat(64),
  title: 'Quote',
  headings: ['Applicant'],
  controls,
  errors: [],
  authenticationRequired: false,
  unsupportedFrames: 0,
  omittedControls: 0,
  capturedAt: now,
});
const answer = (
  sourcePath: string,
  value: SourceAnswer['value'],
  status: SourceAnswer['status'] = value === null ? 'missing' : 'answered',
): SourceAnswer => ({
  answerId: `answer:${sourcePath}`,
  questionId: `question:${sourcePath}`,
  sourcePath,
  question: sourcePath,
  section: 'Synthetic',
  entity: '',
  context: [],
  options: [],
  value,
  status,
  dataType: 'text',
});
const source = (answers: SourceAnswer[], formType: 'home' | 'auto' = 'auto'): SourceAnswers => ({
  version: '2.0',
  tenantId: 'tenant',
  userId: 'user',
  quoteId: 'quote',
  revision: 'r1',
  formType,
  answers,
  unavailablePaths: [],
});

async function profile(
  observation: PageObservation,
  fields: MappingField[],
): Promise<MappingProfile> {
  return {
    version: '2.0',
    mappingId: crypto.randomUUID(),
    mappingVersion: 1,
    status: 'active',
    tenantId: 'tenant',
    createdByUserId: 'user',
    workflow: {
      carrierOrigin: observation.origin,
      carrierBaseUrl: observation.origin,
      workflowName: 'Synthetic',
      lineOfBusiness: 'auto',
    },
    catalogRevision: 'catalog-1',
    entityLimits: [
      {
        key: 'applicants',
        entityType: 'applicant',
        sourcePattern: 'applicant*',
        minimumCount: 1,
        maximumCount: 2,
        sourceIndexBase: 1,
      },
      {
        key: 'additionalDrivers',
        entityType: 'additionalDriver',
        sourcePattern: 'additionalDrivers.*',
        minimumCount: 0,
        maximumCount: 5,
        sourceIndexBase: 0,
      },
      {
        key: 'vehicles',
        entityType: 'vehicle',
        sourcePattern: 'vehicles.*',
        minimumCount: 0,
        maximumCount: 8,
        sourceIndexBase: 0,
      },
    ],
    pages: [
      {
        pageId: crypto.randomUUID(),
        sequence: 1,
        scenarioLabel: 'Main',
        routeId: observation.routeId,
        signature: await stablePageSignature(observation),
        fields,
        workflowControls: [],
      },
    ],
    verification: {
      coveredPageIds: [],
      coveredFieldIds: [],
      coveredWorkflowControlIds: [],
      evidenceDigests: [],
      lastVerifiedAt: null,
    },
    createdAt: now,
    publishedAt: now,
  };
}

describe('deterministic mapping registry compiler', () => {
  it('uses semantic target identity instead of ephemeral element IDs, keys or values', async () => {
    const first = control({ elementId: 'e1', key: 'key-one', value: 'customer one' });
    const second = control({ elementId: 'e99', key: 'key-two', value: 'customer two' });
    await expect(stableTargetSignature(first)).resolves.toBe(await stableTargetSignature(second));
  });

  it('ignores an ephemeral radio name while retaining the group label and context', async () => {
    const trained = control({
      inputType: 'radio',
      role: 'radio',
      label: 'Yes',
      section: 'Prior insurance',
      context: ['Current coverage'],
      choiceGroup: { key: 'generated-name-render-one', label: 'Currently insured?' },
    });
    const rerendered = {
      ...trained,
      elementId: 'new-radio-element',
      key: 'new-control-key',
      choiceGroup: { key: 'generated-name-render-two', label: 'Currently insured?' },
    };

    await expect(stableTargetSignature(rerendered)).resolves.toBe(
      await stableTargetSignature(trained),
    );
    rerendered.choiceGroup.label = 'Different underwriting question';
    await expect(stableTargetSignature(rerendered)).resolves.not.toBe(
      await stableTargetSignature(trained),
    );
  });

  it('matches digested semantics and canonicalized attributes to the live carrier control', async () => {
    const live = control({
      label: 'Taylor Example household',
      section: 'Applicant Taylor Example',
      context: ['Taylor Example owns a blue sedan'],
      role: 'Taylor Example',
      inputType: 'First Last',
    });
    const persisted = {
      ...live,
      label: `sha256:${await semanticTextDigest(live.label)}`,
      section: `sha256:${await semanticTextDigest(live.section)}`,
      context: await Promise.all(
        live.context.map(async (item) => `sha256:${await semanticTextDigest(item)}`),
      ),
      role: '',
      inputType: '',
    };

    await expect(stableTargetSignature(persisted)).resolves.toBe(await stableTargetSignature(live));
    await expect(stablePageSignature(page([persisted]))).resolves.toBe(
      await stablePageSignature(page([live])),
    );
  });

  it('gives a value-free training observation the same page signature as the live page', async () => {
    const live = control({
      value: 'CUSTOMER-VALUE',
      checked: true,
      errors: ['Customer validation text'],
      label: 'First name',
    });
    const structure = {
      elementId: live.elementId,
      key: live.key,
      tag: live.tag,
      inputType: live.inputType,
      role: live.role,
      label: live.label,
      section: live.section,
      context: live.context,
      required: live.required,
      disabled: live.disabled,
      humanOnly: live.humanOnly,
      ordinaryNext: live.ordinaryNext,
      choiceGroup: live.choiceGroup,
      choiceValue: null,
      addEntityType: null,
      operationalTarget: null,
      repeatHint: null,
      options: live.options,
      rect: live.rect,
    };
    await expect(
      stablePageSignature({
        controls: [
          {
            ...structure,
            label: '',
            section: '',
            context: [],
            options: [],
            choiceGroup: null,
            humanOnly: true,
          },
        ],
      }),
    ).resolves.toBe(await stablePageSignature(page([live])));
  });

  it('does not reuse a same-shaped page mapping on a different normalized route', async () => {
    const trainedControl = control({ label: 'First name', section: 'Applicant' });
    const trainedPage = page([trainedControl]);
    const mapping = await profile(trainedPage, [
      {
        fieldId: crypto.randomUUID(),
        sequence: 1,
        target: await stableLocator(trainedControl, 0, null, null),
        disposition: {
          kind: 'source',
          references: [
            {
              binding: 'fixed',
              sourcePath: 'applicant.firstName',
              sourcePathPattern: 'applicant.firstName',
            },
          ],
          transform: { kind: 'identity' },
        },
      },
    ]);
    const otherRoute = page([
      control({ label: 'First name', section: 'Applicant', elementId: 'other-first-name' }),
    ]);
    otherRoute.routeId = 'different-route';
    const compiled = await compileRegistryPage(
      mapping,
      otherRoute,
      source([answer('applicant.firstName', 'Synthetic')]),
    );
    expect(compiled.mappingPage).toBeNull();
    expect(compiled.actions).toEqual([]);
    expect(compiled.reviews).toContainEqual(expect.objectContaining({ reason: 'changed_target' }));
  });

  it('treats a native Yes/No radio group as one logical target and selects one option', async () => {
    const no = control({
      elementId: 'no',
      inputType: 'radio',
      role: 'radio',
      label: 'No',
      value: 'N',
      choiceGroup: { key: 'currentlyInsured', label: 'Currently insured?' },
    });
    const yes = control({
      elementId: 'yes',
      inputType: 'radio',
      role: 'radio',
      label: 'Yes',
      value: 'Y',
      choiceGroup: { key: 'currentlyInsured', label: 'Currently insured?' },
    });
    const observation = page([no, yes]);
    const logical = {
      ...no,
      label: 'Currently insured?',
      options: [
        { value: 'N', label: 'No' },
        { value: 'Y', label: 'Yes' },
      ],
    };
    const target = await stableLocator(logical, 0, null, null);
    target.label = `sha256:${await semanticTextDigest(target.label)}`;
    target.section = `sha256:${await semanticTextDigest(target.section)}`;
    target.choiceGroup = target.choiceGroup
      ? {
          key: `sha256:${await semanticTextDigest(target.choiceGroup.key)}`,
          label: `sha256:${await semanticTextDigest(target.choiceGroup.label)}`,
        }
      : null;
    target.options = await Promise.all(
      target.options.map(async (option) => ({
        value: `sha256:${await semanticTextDigest(option.value)}`,
        label: `sha256:${await semanticTextDigest(option.label)}`,
      })),
    );
    const fieldId = crypto.randomUUID();
    const mapping = await profile(observation, [
      {
        fieldId,
        sequence: 1,
        target,
        disposition: {
          kind: 'source',
          references: [
            {
              binding: 'fixed',
              sourcePath: 'priorInsurance.currentlyInsured',
              sourcePathPattern: 'priorInsurance.currentlyInsured',
            },
          ],
          transform: {
            kind: 'boolean',
            trueValue: target.options[1]!.value,
            falseValue: target.options[0]!.value,
          },
        },
      },
    ]);
    const compiled = await compileRegistryPage(
      mapping,
      observation,
      source([answer('priorInsurance.currentlyInsured', true)]),
    );
    expect(compiled.reviews).toEqual([]);
    expect(compiled.actions).toHaveLength(1);
    expect(compiled.actions[0]?.action).toMatchObject({
      type: 'check',
      elementId: 'yes',
      checked: true,
    });
  });

  it('supports an ARIA radio group as one logical target', async () => {
    const no = control({
      elementId: 'aria-no',
      tag: 'custom',
      inputType: '',
      role: 'radio',
      label: 'No',
      value: 'N',
      choiceGroup: { key: 'aria-insured', label: 'Currently insured?' },
    });
    const yes = { ...no, elementId: 'aria-yes', label: 'Yes', value: 'Y' };
    const observation = page([no, yes]);
    const mapping = await profile(observation, [
      {
        fieldId: crypto.randomUUID(),
        sequence: 1,
        target: await stableLocator(
          {
            ...no,
            label: 'Currently insured?',
            options: [
              { value: 'N', label: 'No' },
              { value: 'Y', label: 'Yes' },
            ],
          },
          0,
          null,
          null,
        ),
        disposition: {
          kind: 'source',
          references: [
            {
              binding: 'fixed',
              sourcePath: 'priorInsurance.currentlyInsured',
              sourcePathPattern: 'priorInsurance.currentlyInsured',
            },
          ],
          transform: {
            kind: 'boolean',
            trueValue: `sha256:${await semanticTextDigest('Y')}`,
            falseValue: `sha256:${await semanticTextDigest('N')}`,
          },
        },
      },
    ]);
    const compiled = await compileRegistryPage(
      mapping,
      observation,
      source([answer('priorInsurance.currentlyInsured', true)]),
    );
    expect(compiled.reviews).toEqual([]);
    expect(compiled.actions[0]?.action).toMatchObject({
      type: 'check',
      elementId: 'aria-yes',
      checked: true,
    });
  });

  it('resolves a hashed carrier option from a value-free enum crosswalk', async () => {
    const residence = control({
      elementId: 'residence',
      tag: 'select',
      inputType: 'select-one',
      role: 'combobox',
      label: 'Residence type',
      options: [
        { value: 'primary', label: 'Primary residence' },
        { value: 'secondary', label: 'Secondary residence' },
      ],
    });
    const observation = page([residence]);
    const target = await stableLocator(residence, 0, null, null);
    target.label = `sha256:${await semanticTextDigest(target.label)}`;
    target.section = `sha256:${await semanticTextDigest(target.section)}`;
    target.options = await Promise.all(
      target.options.map(async (option) => ({
        value: `sha256:${await semanticTextDigest(option.value)}`,
        label: `sha256:${await semanticTextDigest(option.label)}`,
      })),
    );
    const secondary = target.options[1]!.value;
    const mapping = await profile(observation, [
      {
        fieldId: crypto.randomUUID(),
        sequence: 1,
        target,
        disposition: {
          kind: 'source',
          references: [
            {
              binding: 'fixed',
              sourcePath: 'property.residenceType',
              sourcePathPattern: 'property.residenceType',
            },
          ],
          transform: {
            kind: 'enum',
            cases: [{ source: 'secondary', target: secondary }],
          },
        },
      },
    ]);

    const compiled = await compileRegistryPage(
      mapping,
      observation,
      source([answer('property.residenceType', 'secondary')]),
    );
    expect(compiled.reviews).toEqual([]);
    expect(compiled.actions[0]?.action).toMatchObject({ type: 'select', value: 'secondary' });
    expect(JSON.stringify(mapping)).not.toContain('Primary residence');
    expect(JSON.stringify(mapping)).not.toContain('Secondary residence');
  });

  it('applies the catalog source index base for Home applicants and zero-based Auto arrays', async () => {
    const controls = [
      control({ label: 'Applicant first name', section: 'Applicant 1' }),
      control({ label: 'Driver first name', section: 'Additional Driver 1' }),
      control({ label: 'VIN', section: 'Vehicle 1' }),
    ];
    const observation = page(controls);
    const patterns = [
      ['applicant*.firstName', 1],
      ['additionalDrivers.*.firstName', 0],
      ['vehicles.*.vin', 0],
    ] as const;
    const fields = await Promise.all(
      controls.map(async (item, index) => ({
        fieldId: crypto.randomUUID(),
        sequence: index + 1,
        target: await stableLocator(item, 0, 0, `group-${index}`),
        disposition: {
          kind: 'source' as const,
          references: [
            {
              binding: 'same_position' as const,
              sourcePathPattern: patterns[index]![0],
              sourceIndexBase: patterns[index]![1],
            },
          ],
          transform: { kind: 'identity' as const },
        },
      })),
    );
    const compiled = await compileRegistryPage(
      await profile(observation, fields),
      observation,
      source([
        answer('applicant1.firstName', 'Alex'),
        answer('additionalDrivers.0.firstName', 'Blair'),
        answer('vehicles.0.vin', 'VIN0001'),
      ]),
    );
    expect(compiled.actions.map((item) => item.sources[0]?.sourcePath)).toEqual([
      'applicant1.firstName',
      'additionalDrivers.0.firstName',
      'vehicles.0.vin',
    ]);
  });

  it('maps bounded multiselect membership to an individual carrier checkbox', async () => {
    const checkbox = control({
      elementId: 'pool-checkbox',
      inputType: 'checkbox',
      role: 'checkbox',
      label: 'Swimming pool',
    });
    const observation = page([checkbox]);
    const mapping = await profile(observation, [
      {
        fieldId: crypto.randomUUID(),
        sequence: 1,
        target: await stableLocator(checkbox, 0, null, null),
        disposition: {
          kind: 'source',
          references: [
            {
              binding: 'fixed',
              sourcePath: 'property.features',
              sourcePathPattern: 'property.features',
            },
          ],
          transform: { kind: 'multiselect_membership', member: 'Swimming Pool' },
        },
      },
    ]);
    const features = answer('property.features', ['Detached Garage', 'Swimming Pool']);
    features.dataType = 'multiselect';
    const compiled = await compileRegistryPage(mapping, observation, source([features], 'home'));
    expect(compiled.reviews).toEqual([]);
    expect(compiled.actions[0]?.action).toMatchObject({
      type: 'check',
      elementId: 'pool-checkbox',
      checked: true,
    });
    expect(compiled.actions[0]?.sources[0]?.answerId).toBe(features.answerId);
  });

  it('ignores unneeded trained rows while preserving missing facts inside existing entities', async () => {
    const vehicleControls = Array.from({ length: 2 }, (_, index) =>
      control({ label: 'VIN', section: `Vehicle ${index + 1}` }),
    );
    const observation = page(vehicleControls);
    const fields = await Promise.all(
      Array.from({ length: 8 }, async (_, index) => {
        const item =
          vehicleControls[index] ?? control({ label: 'VIN', section: `Vehicle ${index + 1}` });
        return {
          fieldId: crypto.randomUUID(),
          sequence: index + 1,
          target: await stableLocator(item, 0, index, 'vehicles-vin'),
          disposition: {
            kind: 'source' as const,
            references: [
              {
                binding: 'same_position' as const,
                sourcePathPattern: 'vehicles.*.vin',
                sourceIndexBase: 0,
              },
            ],
            transform: { kind: 'identity' as const },
          },
        };
      }),
    );
    const mapping = await profile(observation, fields);
    const twoVehicles = await compileRegistryPage(
      mapping,
      observation,
      source([answer('vehicles.0.vin', 'VIN0'), answer('vehicles.1.vin', 'VIN1')]),
    );
    expect(twoVehicles.actions).toHaveLength(2);
    expect(twoVehicles.reviews).toEqual([]);
    expect(twoVehicles.missingTargets).toEqual([]);

    const missingVin = await compileRegistryPage(
      mapping,
      observation,
      source([
        answer('vehicles.0.make', 'Example'),
        answer('vehicles.0.vin', null),
        answer('vehicles.1.vin', 'VIN1'),
      ]),
    );
    expect(missingVin.reviews.some((item) => item.reason === 'missing_source')).toBe(true);
  });

  it('does not silently treat an ordinary numbered label as an expandable entity row', async () => {
    const trained = control({ label: 'Address Line 2', section: 'Mailing address' });
    const anchor = control({ label: 'Policy type', section: 'Policy' });
    const trainedPage = page([anchor, trained]);
    const fieldId = crypto.randomUUID();
    const target = await stableLocator(trained, 0, 1, 'address-lines');
    const mapping = await profile(trainedPage, [
      {
        fieldId: crypto.randomUUID(),
        sequence: 1,
        target: await stableLocator(anchor, 0, null, null),
        disposition: { kind: 'ignore' },
      },
      {
        fieldId,
        sequence: 2,
        target,
        disposition: {
          kind: 'source',
          references: [
            {
              binding: 'fixed',
              sourcePath: 'mailingAddress.line2',
              sourcePathPattern: 'mailingAddress.line2',
            },
          ],
          transform: { kind: 'identity' },
        },
      },
    ]);
    const compiled = await compileRegistryPage(
      mapping,
      page([anchor]),
      source([answer('mailingAddress.line2', 'Unit 2')]),
    );
    expect(compiled.missingTargets).toEqual([]);
    expect(compiled.reviews).toContainEqual(expect.objectContaining({ reason: 'changed_target' }));
  });

  it('treats all five absent additional-driver rows as not applicable when the quote has none', async () => {
    const trained = control({ label: 'First name', section: 'Additional Driver 1' });
    const anchor = control({ label: 'Policy type', section: 'Policy' });
    const trainedPage = page([anchor]);
    const repeatedFields = await Promise.all(
      Array.from({ length: 5 }, async (_, index) => ({
        fieldId: crypto.randomUUID(),
        sequence: index + 1,
        target: await stableLocator(
          { ...trained, section: `Additional Driver ${index + 1}` },
          0,
          index,
          'additional-driver-first-name',
          'additionalDriver',
        ),
        disposition: {
          kind: 'source' as const,
          references: [
            {
              binding: 'same_position' as const,
              sourcePathPattern: 'additionalDrivers.*.firstName',
              sourceIndexBase: 0,
            },
          ],
          transform: { kind: 'identity' as const },
        },
      })),
    );
    const fields: MappingField[] = [
      {
        fieldId: crypto.randomUUID(),
        sequence: 1,
        target: await stableLocator(anchor, 0, null, null),
        disposition: { kind: 'ignore' },
      },
      ...repeatedFields.map((item, index) => ({ ...item, sequence: index + 2 })),
    ];
    const compiled = await compileRegistryPage(
      await profile(trainedPage, fields),
      page([anchor]),
      source([]),
    );
    expect(compiled.actions).toEqual([]);
    expect(compiled.missingTargets).toEqual([]);
    expect(compiled.reviews).toEqual([]);
  });

  it('requires a live nonblank carrier default and emits local read-back evidence', async () => {
    const agencyCode = control({
      elementId: 'agency-code',
      key: 'agency-code-key',
      label: 'Agency code',
      section: 'Agency',
      required: false,
      value: '',
    });
    const producerConfirmed = control({
      elementId: 'producer-confirmed',
      key: 'producer-confirmed-key',
      inputType: 'checkbox',
      role: 'checkbox',
      label: 'Use producer default',
      section: 'Agency',
      checked: false,
    });
    const observation = page([agencyCode, producerConfirmed]);
    const fields: MappingField[] = await Promise.all(
      [agencyCode, producerConfirmed].map(async (item, index) => ({
        fieldId: crypto.randomUUID(),
        sequence: index + 1,
        target: await stableLocator(
          {
            ...item,
            choiceValue: null,
            addEntityType: null,
            operationalTarget: 'agency_operational',
            repeatHint: null,
          },
          0,
          null,
          null,
        ),
        disposition: { kind: 'carrier_default' as const },
      })),
    );
    const mapping = await profile(observation, fields);

    const blank = await compileRegistryPage(mapping, observation, source([]));
    expect(blank.actions).toEqual([]);
    expect(blank.locallyVerifiedFields).toEqual([]);
    expect(blank.reviews).toEqual([
      expect.objectContaining({ elementId: 'agency-code', reason: 'validation_error' }),
      expect.objectContaining({ elementId: 'producer-confirmed', reason: 'validation_error' }),
    ]);

    const populated = page([
      { ...agencyCode, value: 'AGENCY-001' },
      { ...producerConfirmed, checked: true },
    ]);
    populated.documentId = observation.documentId;
    populated.routeId = observation.routeId;
    const verified = await compileRegistryPage(mapping, populated, source([]));
    expect(verified.reviews).toEqual([]);
    expect(verified.locallyVerifiedFields).toEqual([
      {
        mappingFieldId: fields[0]!.fieldId,
        elementId: 'agency-code',
        kind: 'carrier_default',
      },
      {
        mappingFieldId: fields[1]!.fieldId,
        elementId: 'producer-confirmed',
        kind: 'carrier_default',
      },
    ]);
  });
});
