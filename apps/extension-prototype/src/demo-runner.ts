import {
  ActionReceiptSchema,
  PageObservationSchema,
  type PageObservation,
} from '@smartmapper/contracts';
import {
  homeDemoProfile,
  homeDemoRules,
  homeDemoDisposition,
  homeDemoTitle,
  findHomeDemoControls,
  planHomeDemoField,
} from '@smartmapper/carrier-adapters';
import { demoConfig } from './demo-config.js';
import { demoSession } from './demo-auth.js';
export interface DemoFieldResult {
  number: number;
  title: string;
  status: 'verified' | 'review';
  reason: string;
  sourcePaths: string[];
}
export interface DemoProgress {
  finished: number;
  total: number;
  results: DemoFieldResult[];
}
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function runHomeDemo(
  tabId: number,
  data: Record<string, unknown>,
  signal: AbortSignal,
  progress: (state: DemoProgress) => void,
): Promise<DemoFieldResult[]> {
  const [start] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (start?.id !== tabId || !start.url)
    throw new Error('Open SmartMapper on the quote page you want to fill.');
  const bound = new URL(start.url);
  if (
    bound.origin !== demoConfig.carrierOrigin ||
    bound.pathname.toLowerCase() !== homeDemoProfile.pathname.toLowerCase()
  )
    throw new Error('Open the supported Home quote page before mapping.');
  const connection = await demoSession();
  if (!connection) throw new Error('Sign in to M.I.A. before mapping.');
  const guard = async () => {
    if (signal.aborted) throw new Error('Mapping stopped. You can run it again to continue.');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id !== tabId || tab.url !== start.url)
      throw new Error(
        'The active page changed. Return to the quote page and run Smart Mapper again.',
      );
    const current = await demoSession();
    if (
      !current ||
      current.token !== connection.token ||
      current.principal !== connection.principal
    )
      throw new Error('The M.I.A. connection changed. Select the quote again.');
    return tab;
  };
  const observe = async (): Promise<PageObservation> => {
    let tab = await guard();
    for (let i = 0; tab.status === 'loading' && i < 100; i++) {
      await delay(150);
      tab = await guard();
    }
    if (tab.status === 'loading')
      throw new Error('The quote page is still loading. Try again after it finishes.');
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      files: ['content.js'],
      world: 'ISOLATED',
    });
    await guard();
    const page = PageObservationSchema.parse(
      await chrome.tabs.sendMessage(tabId, { type: 'training-observe', tabId }, { frameId: 0 }),
    );
    if (page.origin !== bound.origin || page.tabId !== tabId || page.authenticationRequired)
      throw new Error('The quote page is unavailable or requires sign-in.');
    return page;
  };
  const initial = await observe();
  for (const number of [19, 21, 74, 75]) {
    const field = homeDemoProfile.fields.find((item) => item.number === number)!;
    if ((await findHomeDemoControls(initial, field)).length !== 1)
      throw new Error('The page layout does not match this demo mapping. No fields were changed.');
  }
  for (const [number, expected] of [
    [16, 'LA'],
    [17, 'HO3LA'],
  ] as const) {
    const matches = await findHomeDemoControls(
      initial,
      homeDemoProfile.fields.find((field) => field.number === number)!,
    );
    const control = matches.length === 1 ? matches[0] : undefined;
    const selected =
      control?.options.find((option) => option.value === control.value)?.label ?? control?.value;
    if (selected?.trim().toUpperCase() !== expected)
      throw new Error('This demo requires the Louisiana HO3 quote page. No fields were changed.');
  }
  const results: DemoFieldResult[] = [];
  for (const rule of homeDemoRules) {
    let outcome: DemoFieldResult = {
      number: rule.number,
      title: rule.title,
      status: 'review',
      reason: 'Entry interrupted; review this field.',
      sourcePaths: rule.paths,
    };
    for (let attempt = 0; attempt < 3; attempt++) {
      const page = await observe();
      const plan = await planHomeDemoField(rule, page, data);
      if (!plan.batch) {
        outcome.reason = plan.reason;
        break;
      }
      await guard();
      try {
        const receipt = ActionReceiptSchema.parse(
          await chrome.tabs.sendMessage(
            tabId,
            { type: 'execute', batch: plan.batch },
            { frameId: 0 },
          ),
        );
        if (['verified', 'already_correct'].includes(receipt.status)) {
          outcome = {
            ...outcome,
            status: 'verified',
            reason: 'Entered value verified on the page.',
          };
          break;
        }
        outcome.reason =
          receipt.reason === 'read_back_mismatch'
            ? 'Page read-back did not match; review this field.'
            : receipt.reason.replaceAll('_', ' ');
        if (!['page_changed', 'interrupted'].includes(receipt.reason)) break;
      } catch {
        // A native ASP.NET postback may destroy the reply channel. Reobserve and retry the
        // same field on the same bound URL; the shared executor checks for already-correct values.
        outcome.reason = 'The page refreshed during entry; this field needs review.';
      }
      await delay(400);
    }
    results.push(outcome);
    progress({ finished: results.length, total: homeDemoRules.length, results: [...results] });
  }
  const final = await observe();
  // Recheck every success after dependent controls have settled; no stale success claims.
  for (const item of results.filter((item) => item.status === 'verified')) {
    const rule = homeDemoRules.find((rule) => rule.number === item.number)!;
    const plan = await planHomeDemoField(rule, final, data);
    const control = plan.batch
      ? final.controls.find((control) => control.elementId === plan.batch.action.elementId)
      : undefined;
    if (
      !plan.batch ||
      !control ||
      control.value !== plan.batch.action.value ||
      control.errors.length
    ) {
      item.status = 'review';
      item.reason = 'The page changed this value after entry. Review or run again.';
    }
  }
  for (const field of homeDemoProfile.fields.filter(
    (field) => homeDemoDisposition(field) === 'review',
  )) {
    if ((await findHomeDemoControls(final, field)).length)
      results.push({
        number: field.number,
        title: homeDemoTitle(field),
        status: 'review',
        reason: 'No equivalent M.I.A. fact or approved default. Leave for manual review.',
        sourcePaths: [],
      });
  }
  return results;
}
