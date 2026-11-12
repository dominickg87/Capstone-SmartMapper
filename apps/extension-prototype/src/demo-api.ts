import { z } from 'zod';
import { demoConfig } from './demo-config.js';
import { demoSession } from './demo-auth.js';
export const demoQuoteSummarySchema = z.object({
  id: z.union([z.string().min(1), z.number().int().positive()]),
  quote_number: z.string(),
  form_type: z.string(),
  client_name: z.string(),
});
export type DemoQuoteSummary = z.infer<typeof demoQuoteSummarySchema>;
async function request(path: string): Promise<unknown> {
  const connection = await demoSession();
  if (!connection) throw new Error('Sign in to M.I.A. to select a quote.');
  const response = await fetch(demoConfig.miaOrigin + path, {
    headers: { Authorization: 'Bearer ' + connection.token, Accept: 'application/json' },
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 401 || response.status === 403) {
    await chrome.storage.session.remove('homeDemoConnection');
    throw new Error('Your M.I.A. connection expired. Sign in again.');
  }
  if (!response.ok) throw new Error('M.I.A. could not load the quote. Try again.');
  const current = await demoSession();
  if (!current || current.token !== connection.token || current.principal !== connection.principal)
    throw new Error('The M.I.A. account changed. Select the quote again.');
  return response.json() as Promise<unknown>;
}
export async function searchDemoQuotes(query: string): Promise<DemoQuoteSummary[]> {
  const result = z
    .object({ success: z.literal(true), results: z.array(demoQuoteSummarySchema).max(25) })
    .parse(
      await request(
        '/api/extension/quotes/search?limit=25&query=' + encodeURIComponent(query.slice(0, 200)),
      ),
    );
  return result.results.filter((quote) => quote.form_type === 'home');
}
export async function loadDemoQuote(id: string | number): Promise<Record<string, unknown>> {
  const result = z
    .object({
      success: z.literal(true),
      quote: demoQuoteSummarySchema.extend({ form_data: z.record(z.string(), z.unknown()) }),
    })
    .parse(await request('/api/extension/quotes/' + encodeURIComponent(String(id))));
  if (String(result.quote.id) !== String(id) || result.quote.form_type !== 'home')
    throw new Error('Select a Homeowners quote.');
  return result.quote.form_data;
}
