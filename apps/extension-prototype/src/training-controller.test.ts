import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PageObservation, TrainingPage } from '@smartmapper/contracts';
import { stablePageSignature } from '@smartmapper/automation-core/registry';
import { TrainingController, trainingMarkersFor } from './training-controller.js';
import { structuralTrainingObservation } from './training-observation.js';

vi.mock('./config.js', () => ({
  config: {
    miaOrigin: 'https://mia.test',
    backendOrigin: 'https://backend.test',
    carrierOrigins: ['https://carrier.test'],
    allowAnyCarrier: false,
  },
}));
vi.mock('./session.js', () => ({
  miaToken: () => Promise.resolve('synthetic-token'),
  trustedStorage: () => Promise.resolve(),
}));

afterEach(() => vi.unstubAllGlobals());

describe('training API errors', () => {
  it.each([
    ['revision_conflict', /draft changed/],
    ['training_conflict', /draft changed/],
    ['unsafe_training_structure', /field metadata did not pass validation/],
    ['duplicate_control', /duplicate field identifiers/],
    ['duplicate_training_page', /already captured/],
    ['observation_expired', /capture expired/],
    ['binding_mismatch', /carrier tab where this training draft started/],
    ['authentication_required', /Sign back into the carrier/],
    ['training_expired', /training session expired/],
    ['training_not_draft', /already left draft mode/],
    ['unknown_conflict', /service rejected this step/],
  ])('explains %s without treating every 409 as a stale draft', async (code, message) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: code }), { status: 409 }))),
    );
    await expect(new TrainingController().catalog('home')).rejects.toThrow(message);
    if (code !== 'revision_conflict' && code !== 'training_conflict')
      await expect(new TrainingController().catalog('home')).rejects.not.toThrow(/draft changed/);
  });

  it('does not display untrusted server message text for an unknown conflict', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              error: 'unknown_conflict',
              message: 'Customer-private server text',
            }),
            { status: 409 },
          ),
        ),
      ),
    );
    await expect(new TrainingController().catalog('home')).rejects.not.toThrow(/Customer-private/);
  });
});

const catalog = {
  version: '2.0',
  schemaRevision: 'home-1',
  formType: 'home',
  entityLimits: [],
  templates: [],
  fields: [],
} as const;

async function savedPage() {
  const observation: PageObservation = {
    version: '2.0',
    tabId: 7,
    origin: 'https://carrier.test',
    pageStateId: crypto.randomUUID(),
    documentId: crypto.randomUUID(),
    routeId: 'a'.repeat(64),
    fingerprint: 'b'.repeat(64),
    title: '',
    headings: [],
    errors: [],
    authenticationRequired: false,
    unsupportedFrames: 0,
    omittedControls: 0,
    capturedAt: new Date().toISOString(),
    controls: [
      {
        elementId: 'e1',
        key: 'c'.repeat(64),
        tag: 'input',
        inputType: 'text',
        role: 'textbox',
        label: 'First name',
        section: 'Applicant',
        context: [],
        value: '',
        checked: false,
        required: false,
        requiredSatisfied: true,
        disabled: false,
        humanOnly: false,
        choiceGroup: null,
        options: [],
        errors: [],
        rect: { x: 20, y: 30, width: 100, height: 20 },
      },
    ],
  };
  const structure = await structuralTrainingObservation(observation);
  const page: TrainingPage = {
    pageId: crypto.randomUUID(),
    sequence: 1,
    scenarioLabel: 'Page 1',
    routeId: structure.routeId,
    fingerprint: structure.fingerprint,
    signature: await stablePageSignature(structure),
    fields: [
      {
        fieldId: crypto.randomUUID(),
        sequence: 123,
        occurrence: 0,
        repeatIndex: null,
        repeatEntityType: null,
        groupKey: null,
        control: structure.controls[0]!,
        disposition: { kind: 'ignore' },
      },
    ],
    workflowControls: [],
  };
  return { observation, page };
}

describe('training restored on a reopened carrier tab', () => {
  it('returns saved metadata even when overlays cannot access the original tab', async () => {
    const { page } = await savedPage();
    const training = {
      version: '2.0',
      trainingId: crypto.randomUUID(),
      revision: 3,
      status: 'draft',
      binding: {
        tenantId: 'tenant',
        userId: 'user',
        carrierOrigin: 'https://carrier.test',
        tabId: 7,
        formType: 'home',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      workflow: {
        carrierOrigin: 'https://carrier.test',
        carrierBaseUrl: 'https://carrier.test',
        workflowName: 'Home workflow',
        lineOfBusiness: 'home',
      },
      catalogRevision: 'home-1',
      pages: [page],
      mappingId: null,
    };
    const local = { training, catalog, token: 'synthetic-capability', windowId: 1 };
    const set = vi.fn();
    const send = vi.fn();
    vi.stubGlobal('location', { search: '?tabId=19' });
    vi.stubGlobal('chrome', {
      storage: { session: { get: () => Promise.resolve({ training: local }), set } },
      tabs: {
        query: () => Promise.resolve([{ id: 19, windowId: 1, url: 'https://carrier.test/quote' }]),
        sendMessage: send,
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ training })))),
    );
    const controller = new TrainingController();
    const restored = await controller.restore();
    expect(restored?.training).toEqual(training);
    expect(await controller.boundToCurrentTab(restored!)).toBe(false);
    expect(set).toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('resolves marker numbers onto fresh element IDs and rectangles after reopening', async () => {
    const { observation, page } = await savedPage();
    const fresh = structuredClone(observation);
    fresh.tabId = 19;
    fresh.documentId = crypto.randomUUID();
    fresh.controls[0]!.elementId = 'e25';
    fresh.controls[0]!.rect.y = 250;
    const markers = await trainingMarkersFor(page, fresh);
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({
      fieldId: page.fields[0]!.fieldId,
      number: 123,
      control: { elementId: 'e25', rect: { y: 250 } },
    });
    fresh.controls[0]!.label = 'Different question';
    expect(await trainingMarkersFor(page, fresh)).toEqual([]);
    fresh.routeId = 'f'.repeat(64);
    expect(await trainingMarkersFor(page, fresh)).toEqual([]);
  });
});
