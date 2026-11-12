import { ReadPageDataSchema, type ReadPageData } from '@smartmapper/contracts';
import { readPageFields } from '@smartmapper/automation-core/page-reader';

export async function readActivePage(boundTabId: number): Promise<ReadPageData> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!Number.isInteger(boundTabId) || boundTabId < 0 || tab?.id !== boundTabId)
    throw new Error('Open SmartMapper from the toolbar on the page you want to read.');
  if (!tab.url || !/^https?:/.test(tab.url))
    throw new Error('Open a website page, then open SmartMapper from its toolbar icon.');
  let scanned: chrome.scripting.InjectionResult<ReadPageData>[];
  try {
    scanned = await chrome.scripting.executeScript({
      target: { tabId: boundTabId, frameIds: [0] },
      world: 'ISOLATED',
      func: readPageFields,
      args: [true],
    });
  } catch {
    throw new Error(
      'Chrome could not read this page. Click the SmartMapper toolbar icon on this tab and try again.',
    );
  }
  const [current] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (current?.id !== boundTabId || current.url !== tab.url)
    throw new Error('The active page changed while reading. Return to the page and read it again.');
  const data = ReadPageDataSchema.safeParse(scanned.find((item) => item.frameId === 0)?.result);
  if (!data.success) throw new Error('The page could not be read completely. Read the page again.');
  return data.data;
}
