import {
  UnresolvedFieldCollector,
  evaluateSafeStop,
  type ExecutionContext,
} from '@smartmapper/automation-core';
import { mockClassicAdapter, mockModernAdapter } from '@smartmapper/carrier-adapters';
import type {
  AutomationAction,
  AutomationActionResult,
  MiaQuotePayload,
  QuoteJobState,
  ReviewItem,
} from '@smartmapper/contracts';
import { chromium } from 'playwright';

import { PlaywrightRemoteBrowserExecutor } from './browser-executor.js';

export interface SyntheticWorkerRequest {
  baseUrl: string;
  flow: 'modern' | 'classic';
  quote: MiaQuotePayload;
  changedLayout?: boolean;
}

export interface SyntheticWorkerResult {
  state: QuoteJobState;
  actionResults: AutomationActionResult[];
  reviewItems: ReviewItem[];
  finalSubmitClicked: boolean;
  browserContextClosed: boolean;
}

function action(
  actionId: string,
  type: 'fillText' | 'selectOption',
  sourcePath: string,
  label: string,
): AutomationAction {
  return {
    version: '1.0',
    actionId,
    type,
    sourcePath,
    target: { label },
    risk: /dateOfBirth|yearBuilt/.test(sourcePath) ? 'medium' : 'low',
    rationale: 'Approved deterministic mock adapter mapping.',
  };
}

function click(actionId: string, accessibleName: string): AutomationAction {
  return {
    version: '1.0',
    actionId,
    type: 'clickContinue',
    target: { accessibleName, role: 'button' },
    risk: 'low',
    rationale: 'Advance within the synthetic flow before the safe stop page.',
  };
}

function modernFirstPage(changed: boolean): AutomationAction[] {
  return [
    click('modern-close-notice', 'Close announcement'),
    action(
      'modern-first-name',
      'fillText',
      'applicant.firstName',
      changed ? 'Given name' : 'First name',
    ),
    action(
      'modern-birth-date',
      'fillText',
      'applicant.dateOfBirth',
      changed ? 'Birth date' : 'Date of birth',
    ),
    action(
      'modern-state',
      'selectOption',
      'applicant.address.stateCode',
      changed ? 'Residence state' : 'State',
    ),
    {
      version: '1.0',
      actionId: 'modern-property-occupancy',
      type: 'setRadio',
      sourcePath: 'properties[0].occupancy',
      target: { accessibleName: 'Primary residence', role: 'radio' },
      option: 'Primary residence',
      risk: 'low',
      rationale: 'Synthetic primary occupancy maps deterministically to the mock primary option.',
    },
    {
      version: '1.0',
      actionId: 'modern-insured',
      type: 'setCheckbox',
      sourcePath: 'priorInsurance.currentlyInsured',
      target: { label: 'Currently insured', role: 'checkbox' },
      checkedWhen: 'truthy',
      risk: 'low',
      rationale: 'Boolean source controls the synthetic conditional field.',
    },
    click('modern-continue-applicant', 'Continue'),
  ];
}

function modernSecondPage(changed: boolean): AutomationAction[] {
  return [
    action(
      'modern-driver-dob',
      'fillText',
      'drivers[0].dateOfBirth',
      changed ? 'Driver birth date' : 'Driver date of birth',
    ),
    {
      version: '1.0',
      actionId: 'modern-license',
      type: 'setRadio',
      sourcePath: 'drivers[0].licenseStatus',
      target: { accessibleName: 'Valid license', role: 'radio' },
      option: 'Valid license',
      risk: 'low',
      rationale: 'Synthetic valid status maps to the mock valid option.',
    },
    action(
      'modern-vehicle-year',
      'fillText',
      'vehicles[0].year',
      changed ? 'Model year' : 'Vehicle year',
    ),
    action('modern-vehicle-make', 'fillText', 'vehicles[0].make', 'Vehicle make'),
    click('modern-continue-household', 'Continue'),
  ];
}

function classicFirstPage(changed: boolean): AutomationAction[] {
  return [
    action(
      'classic-first-name',
      'fillText',
      'applicant.firstName',
      changed ? 'Named applicant given name' : 'Applicant first name',
    ),
    action(
      'classic-last-name',
      'fillText',
      'applicant.lastName',
      changed ? 'Named applicant surname' : 'Applicant last name',
    ),
    action('classic-phone', 'fillText', 'applicant.phone', changed ? 'Telephone' : 'Contact phone'),
    action(
      'classic-year-built',
      'fillText',
      'properties[0].yearBuilt',
      changed ? 'Construction year' : 'Year built',
    ),
    {
      version: '1.0',
      actionId: 'classic-current-insurance',
      type: 'setRadio',
      sourcePath: 'priorInsurance.currentlyInsured',
      target: { accessibleName: 'Yes, currently insured', role: 'radio' },
      option: 'Yes, currently insured',
      risk: 'medium',
      rationale: 'Synthetic current-insurance source selects the explicit positive mock option.',
    },
    click('classic-next-risk', 'Next page'),
  ];
}

function classicSecondPage(changed: boolean): AutomationAction[] {
  return [
    action(
      'classic-driver-name',
      'fillText',
      'drivers[0].firstName',
      changed ? 'Listed driver first name' : 'Driver given name',
    ),
    action(
      'classic-auto-make',
      'fillText',
      'vehicles[0].make',
      changed ? 'Vehicle manufacturer' : 'Auto make',
    ),
    click('classic-next-items', 'Next page'),
  ];
}

export async function runSyntheticRemoteJob(
  request: SyntheticWorkerRequest,
): Promise<SyntheticWorkerResult> {
  const origin = new URL(request.baseUrl).origin;
  if (!['http://127.0.0.1:4173', 'http://localhost:4173'].includes(origin)) {
    throw new Error('The bootstrap worker is restricted to the localhost mock carrier.');
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const executor = new PlaywrightRemoteBrowserExecutor(context, page);
  const results: AutomationActionResult[] = [];
  const reviews = new UnresolvedFieldCollector();
  let state: QuoteJobState = 'running';
  let finalSubmitClicked = false;
  let browserContextClosed: boolean;
  const jobId = 'job-synthetic-worker';
  const controller = new AbortController();
  const executionContext = {
    job: {
      version: '1.0',
      jobId,
      tenantReference: 'tenant-synthetic',
      userReference: 'user-synthetic',
      quoteReference: request.quote.metadata.quoteId,
      adapterId: request.flow === 'modern' ? 'mock-modern' : 'mock-classic',
      adapterVersion: '1.0.0',
      executionMode: 'remote_browser',
      state: 'running',
      reviewItems: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    },
    quote: request.quote,
    signal: controller.signal,
  } satisfies ExecutionContext;

  try {
    const suffix = request.changedLayout ? '&layout=changed' : '';
    if (request.flow === 'modern') {
      await page.goto(
        request.baseUrl + '/modern' + (request.changedLayout ? '?layout=changed' : ''),
      );
      await page
        .getByRole('heading', { name: /Applicant details|Tell us about the applicant/ })
        .waitFor();
      for (const currentAction of modernFirstPage(Boolean(request.changedLayout))) {
        const currentResult = await executor.execute(currentAction, executionContext);
        results.push(currentResult);
        if (
          currentResult.status === 'requires_review' &&
          currentResult.reasonCode === 'missing_source'
        ) {
          reviews.add({
            jobId,
            fieldPath: 'sourcePath' in currentAction ? currentAction.sourcePath : undefined,
            reasonCode: 'missing_source',
            summary: 'A required synthetic source value is missing.',
            risk: 'high',
            blocking: true,
          });
          state = 'waiting_for_user';
          break;
        }
      }
      if (state === 'running') {
        await page.getByRole('heading', { name: 'Drivers and vehicles' }).waitFor();
        const snapshot = await executor.captureSnapshot();
        for (const requirement of mockModernAdapter.reviewRequirements(snapshot)) {
          reviews.add({ jobId, ...requirement });
        }
        for (const currentAction of modernSecondPage(Boolean(request.changedLayout))) {
          results.push(await executor.execute(currentAction, executionContext));
        }
      }
    } else {
      await page.goto(request.baseUrl + '/classic?step=1' + suffix);
      await page.getByRole('heading', { name: /Risk worksheet|Property and contact/ }).waitFor();
      for (const currentAction of classicFirstPage(Boolean(request.changedLayout))) {
        const currentResult = await executor.execute(currentAction, executionContext);
        results.push(currentResult);
        if (
          currentResult.status === 'requires_review' &&
          currentResult.reasonCode === 'missing_source'
        ) {
          reviews.add({
            jobId,
            fieldPath: 'sourcePath' in currentAction ? currentAction.sourcePath : undefined,
            reasonCode: 'missing_source',
            summary: 'A required synthetic source value is missing.',
            risk: 'high',
            blocking: true,
          });
          state = 'waiting_for_user';
          break;
        }
      }
      if (state === 'running') {
        await page.getByRole('heading', { name: 'Listed drivers and autos' }).waitFor();
        const snapshot = await executor.captureSnapshot();
        for (const requirement of mockClassicAdapter.reviewRequirements(snapshot)) {
          reviews.add({ jobId, ...requirement });
        }
        if (reviews.all().some((item) => item.blocking)) {
          state = 'waiting_for_user';
        } else {
          for (const currentAction of classicSecondPage(Boolean(request.changedLayout))) {
            results.push(await executor.execute(currentAction, executionContext));
          }
        }
      }
    }

    if (state === 'running') {
      await page.getByRole('heading', { name: /Mock quote review|Review worksheet/ }).waitFor();
      const pageText = await page.locator('body').innerText();
      const stop = evaluateSafeStop({
        pageText,
        authenticationRequired: false,
        missingRequiredFields: false,
      });
      if (!stop.shouldStop) {
        throw new Error('Expected the mock final review safe stop.');
      }
      state = 'ready_for_review';
      finalSubmitClicked =
        (await page.locator('#mock-final-submit').getAttribute('data-clicked')) === 'true';
    }
  } finally {
    await context.close();
    browserContextClosed = true;
    await browser.close();
  }

  return {
    state,
    actionResults: results,
    reviewItems: reviews.all(),
    finalSubmitClicked,
    browserContextClosed,
  };
}

export { PlaywrightRemoteBrowserExecutor } from './browser-executor.js';
