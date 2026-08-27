import { expect, test } from '@playwright/test';
import { runSyntheticRemoteJob } from '@smartmapper/automation-worker';
import { syntheticQuote, syntheticQuoteMissingPhone } from '@smartmapper/mia-client';

const baseUrl = 'http://127.0.0.1:4173';

test('modern SPA flow reaches human review and never submits', async () => {
  const result = await runSyntheticRemoteJob({
    baseUrl,
    flow: 'modern',
    quote: syntheticQuote,
  });

  expect(result.state).toBe('ready_for_review');
  expect(
    result.actionResults.filter((action) => action.status === 'executed').length,
  ).toBeGreaterThan(6);
  expect(result.finalSubmitClicked).toBe(false);
  expect(result.browserContextClosed).toBe(true);
});

test('classic multi-page flow reaches human review and never submits', async () => {
  const result = await runSyntheticRemoteJob({
    baseUrl,
    flow: 'classic',
    quote: syntheticQuote,
  });

  expect(result.state).toBe('ready_for_review');
  expect(result.finalSubmitClicked).toBe(false);
});

test('missing required data pauses for a human before navigation', async () => {
  const result = await runSyntheticRemoteJob({
    baseUrl,
    flow: 'classic',
    quote: syntheticQuoteMissingPhone,
  });

  expect(result.state).toBe('waiting_for_user');
  expect(result.reviewItems).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ reasonCode: 'missing_source', blocking: true }),
    ]),
  );
  expect(result.finalSubmitClicked).toBe(false);
});

test('changed layout is resilient but deliberate ambiguity blocks for review', async () => {
  const result = await runSyntheticRemoteJob({
    baseUrl,
    flow: 'classic',
    quote: syntheticQuote,
    changedLayout: true,
  });

  expect(result.state).toBe('waiting_for_user');
  expect(result.reviewItems).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ reasonCode: 'ambiguous_target', blocking: true }),
    ]),
  );
  expect(result.finalSubmitClicked).toBe(false);
});
