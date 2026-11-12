import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, expect, test } from '@playwright/test';
import { readPageFields } from '@smartmapper/automation-core/page-reader';
import { ReadPageDataSchema } from '@smartmapper/contracts';
import { activateToolbar, clickPanelButton, panelText } from './helpers/side-panel.js';

const fixture = readFileSync(resolve('tests/e2e/fixtures/page-reader.html'), 'utf8');
const extensionPath = resolve('apps/extension-prototype/dist');
const origin = 'http://127.0.0.1:4173';

test('the installed reader numbers controls and downloads Home mapping notes without services or page actions', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium');
  const manifest = JSON.parse(readFileSync(resolve(extensionPath, 'manifest.json'), 'utf8')) as {
    permissions: string[];
    host_permissions?: string[];
    content_scripts?: unknown[];
  };
  expect(manifest.permissions).toEqual(['activeTab', 'scripting', 'sidePanel', 'storage']);
  expect(manifest.host_permissions).toEqual(['https://demo.mia.agency/*']);
  expect(manifest.content_scripts).toHaveLength(1);
  for (const retired of ['reference.html'])
    expect(readdirSync(extensionPath)).not.toContain(retired);
  const context = await chromium.launchPersistentContext(testInfo.outputPath('reader-profile'), {
    headless: true,
    channel: 'chromium',
    args: [
      '--enable-unsafe-extension-debugging',
      '--disable-extensions-except=' + extensionPath,
      '--load-extension=' + extensionPath,
    ],
  });
  try {
    const unexpectedRequests: string[] = [];
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === origin && url.pathname === '/reader')
        await route.fulfill({ contentType: 'text/html', body: fixture });
      else if (url.origin === origin && url.pathname === '/reader-frame')
        await route.fulfill({
          contentType: 'text/html',
          body: '<label>Frame question<input name="frameQuestion"></label>',
        });
      else if (url.origin === origin && url.pathname === '/empty')
        await route.fulfill({ contentType: 'text/html', body: '<h1>Empty page</h1>' });
      else {
        unexpectedRequests.push(url.origin);
        await route.abort();
      }
    });
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extensionId = new URL(worker.url()).hostname;
    const page = await context.newPage();
    await page.goto(origin + '/reader');
    await expect(page.frameLocator('iframe').first().getByLabel('Frame question')).toBeVisible();
    const client = await context.browser()!.newBrowserCDPSession();
    await activateToolbar(client, extensionId, page);
    const tabId = await worker.evaluate(
      async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]!.id!,
    );
    const panelUrl = `chrome-extension://${extensionId}/sidepanel.html?tabId=${tabId}`;
    const text = () => panelText(client, panelUrl);
    await expect.poll(text).toContain('Page reference');
    expect(await clickPanelButton(client, panelUrl, 'Page reference')).toBe('clicked');
    await expect.poll(text).toContain('Read page data');
    expect(
      await panelText(client, panelUrl, "String(document.querySelectorAll('button').length)"),
    ).toBe('3');
    expect(await clickPanelButton(client, panelUrl, 'Read page data')).toBe('clicked');
    await expect.poll(text).toContain('fields found');
    const displayed = await text();
    for (const label of [
      'Applicant name',
      'Roof material',
      'Metal',
      'Tile (disabled)',
      'Currently insured?',
      'Has a pool',
      'Additional notes',
      'Hidden detail',
      'Hidden',
      'Read only',
      'Disabled',
      'Features',
      'Alarm',
      'City suggestions',
      'Sample Town',
      'Occupancy',
      'Owner',
      'Tenant',
      'Construction',
      'Masonry (disabled)',
      'Shadow question',
      'Frame question',
      'Second applicant insured?',
    ])
      expect(displayed).toContain(label);
    expect(displayed).toContain('embedded frame(s) could not be read');
    expect(displayed).toContain('Some choices are unavailable');
    expect(displayed).not.toContain('SYNTHETIC-');
    expect(displayed).not.toContain('sessionSecret');
    expect(displayed).not.toContain('Protected field');
    await expect(page.getByLabel('Applicant name')).toHaveValue('SYNTHETIC-SECRET-ANSWER');
    await expect(page.locator('body')).toHaveAttribute('data-input-events', '0');
    await expect(page.locator('body')).toHaveAttribute('data-click-events', '0');
    await expect(page.locator('#mock-final-submit')).toHaveAttribute('data-clicked', 'false');
    const fields = await page.evaluate(readPageFields, false);
    expect(ReadPageDataSchema.safeParse(fields).success).toBe(true);
    expect(fields.fields.filter((field) => field.type === 'radio group')).toHaveLength(3);
    expect(
      fields.fields
        .find((field) => field.label === 'Currently insured?')
        ?.choices.map((choice) => choice.label),
    ).toEqual(['Yes', 'No']);
    expect(fields.fields.filter((field) => field.type === 'listbox')).toHaveLength(0);
    const applicant = fields.fields.find((field) => field.label === 'Applicant name')!;
    const roof = fields.fields.find((field) => field.label === 'Roof material')!;
    const insured = fields.fields.find((field) => field.label === 'Currently insured?')!;
    const hidden = fields.fields.find((field) => field.label === 'Hidden detail')!;
    const markers = page.locator('[data-smartmapper-reader-markers]');
    await expect(markers.locator(`[data-field-number="${applicant.number}"]`)).toBeVisible();
    await expect(markers.locator(`[data-field-number="${insured.number}"]`)).toHaveCount(2);
    await expect(markers.locator(`[data-field-number="${hidden.number}"]`)).toBeHidden();
    const frameField = fields.fields.find((field) => field.label === 'Frame question')!;
    await expect(
      page.frameLocator('iframe').first().locator(`[data-field-number="${frameField.number}"]`),
    ).toBeVisible();
    const select = async (number: number, source: string) =>
      panelText(
        client,
        panelUrl,
        `(() => {
      const control = document.getElementById('mapping-${number}');
      control.value = ${JSON.stringify(source)};
      control.dispatchEvent(new Event('change', { bubbles: true }));
      return control.value;
    })()`,
      );
    expect(
      await panelText(
        client,
        panelUrl,
        `String(document.querySelectorAll('#mapping-${roof.number} optgroup option').length)`,
      ),
    ).toBe('144');
    expect(await select(applicant.number, 'applicant1.firstName')).toBe('applicant1.firstName');
    expect(await select(roof.number, 'roofType')).toBe('roofType');
    // Scroll and layout changes reposition badges without changing carrier values or events.
    await page.evaluate(() => {
      document.body.style.paddingTop = '400px';
      window.scrollTo(0, 180);
    });
    await expect
      .poll(async () => {
        const input = await page.getByLabel('Applicant name').boundingBox();
        const badge = await markers
          .locator(`[data-field-number="${applicant.number}"]`)
          .boundingBox();
        return input && badge ? Math.abs(badge.y - (input.y - 16)) : 999;
      })
      .toBeLessThan(2);
    await page.evaluate(() => {
      const label = document.createElement('label');
      label.textContent = 'New conditional question';
      label.append(document.createElement('input'));
      document.body.append(label);
    });
    expect(await text()).not.toContain('New conditional question');
    expect(await clickPanelButton(client, panelUrl, 'Read page data')).toBe('clicked');
    await expect.poll(text).toContain('New conditional question');
    expect(
      await panelText(client, panelUrl, `document.getElementById('mapping-${roof.number}').value`),
    ).toBe('roofType');
    expect(
      await panelText(
        client,
        panelUrl,
        `document.getElementById('mapping-${applicant.number}').value`,
      ),
    ).toBe('applicant1.firstName');
    await expect(markers).toHaveCount(1);
    const downloadDirectory = testInfo.outputPath('mapping-downloads');
    mkdirSync(downloadDirectory, { recursive: true });
    await client.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDirectory,
    });
    expect(await clickPanelButton(client, panelUrl, 'Download mapping notes (.txt)')).toBe(
      'clicked',
    );
    await expect
      .poll(() => readdirSync(downloadDirectory).filter((name) => name.endsWith('.txt')).length)
      .toBe(1);
    const file = readdirSync(downloadDirectory).find((name) => name.endsWith('.txt'))!;
    expect(file).toMatch(/^smartmapper-homeowners-mapping-.*\.txt$/);
    const notes = readFileSync(resolve(downloadDirectory, file), 'utf8');
    expect(notes).toContain(
      `${applicant.number}. Applicant name = Applicant 1 / First Name [applicant1.firstName]`,
    );
    expect(notes).toContain(
      `${roof.number}. Roof material = Home Quote Form / Roof Type [roofType]`,
    );
    expect(notes).toContain('New conditional question = UNMAPPED');
    expect(notes).not.toContain('SYNTHETIC-');
    expect(notes).not.toContain('sessionSecret');
    await expect(page.locator('body')).toHaveAttribute('data-input-events', '0');
    await expect(page.locator('body')).toHaveAttribute('data-click-events', '0');
    await expect(page.locator('#mock-final-submit')).toHaveAttribute('data-clicked', 'false');
    await page.goto(origin + '/empty');
    await expect.poll(text).not.toContain('Applicant name');
    expect(await clickPanelButton(client, panelUrl, 'Read page data')).toBe('clicked');
    await expect.poll(text).toContain('0 fields found');
    await expect(page.locator('[data-smartmapper-reader-markers]')).toHaveCount(0);
    expect(unexpectedRequests).toEqual([]);
  } finally {
    await context.close();
  }
});

test('reader keys survive renumbering, reset for replaced controls, and never collect its own badges', async ({
  page,
}) => {
  await page.setContent(
    '<label>Original<input name="original"></label><button id="final" data-clicked="false">Submit</button>',
  );
  const first = await page.evaluate(readPageFields, true);
  await page.evaluate(() => {
    const label = document.createElement('label');
    label.textContent = 'Inserted';
    label.append(document.createElement('input'));
    document.body.prepend(label);
    document.getElementById('final')!.onclick = (event) => {
      (event.currentTarget as HTMLElement).dataset.clicked = 'true';
    };
  });
  const second = await page.evaluate(readPageFields, true);
  expect(second.fields).toHaveLength(3);
  expect(second.fields[1]?.key).toBe(first.fields[0]?.key);
  expect(second.fields[1]?.number).toBe(2);
  await expect(page.locator('[data-smartmapper-reader-markers]')).toHaveCount(1);
  await page
    .locator('input[name="original"]')
    .evaluate((element) => element.replaceWith(element.cloneNode()));
  const third = await page.evaluate(readPageFields, true);
  expect(third.fields[1]?.key).not.toBe(second.fields[1]?.key);
  await expect(page.locator('#final')).toHaveAttribute('data-clicked', 'false');
});

test('reader bounds large pages and reports incomplete choice lists', async ({ page }) => {
  await page.setContent(
    '<select aria-label="Large choices"></select><button id="final" data-clicked="false">Final submit</button>',
  );
  await page.evaluate(() => {
    const select = document.querySelector('select')!;
    for (let i = 0; i < 510; i++) select.add(new Option(`Choice ${i}`));
    for (let i = 0; i < 1510; i++) {
      const input = document.createElement('input');
      input.setAttribute('aria-label', `Field ${i}`);
      document.body.append(input);
    }
    document.getElementById('final')!.onclick = (event) => {
      (event.currentTarget as HTMLElement).dataset.clicked = 'true';
    };
  });
  const data = await page.evaluate(readPageFields, false);
  expect(data.fields).toHaveLength(1500);
  expect(data.truncated).toBe(true);
  expect(data.fields[0]?.choices).toHaveLength(500);
  expect(data.fields[0]?.choicesIncomplete).toBe(true);
  await expect(page.locator('#final')).toHaveAttribute('data-clicked', 'false');
});
