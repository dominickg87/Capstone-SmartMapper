import { describe, expect, it } from 'vitest';

import { InMemoryMiaQuoteProvider, syntheticQuotes } from './index.js';

describe('in-memory M.I.A. quote provider', () => {
  it('searches and retrieves only synthetic normalized payloads', async () => {
    const provider = new InMemoryMiaQuoteProvider(syntheticQuotes);
    const summaries = await provider.searchQuotes({ syntheticQuery: 'complete' });
    expect(summaries).toHaveLength(1);

    const quote = await provider.retrieveQuote(summaries[0]!.quoteReference);
    expect(quote.metadata.sourceSystem).toBe('mock-mia');
  });

  it('returns a typed not-found error', async () => {
    const provider = new InMemoryMiaQuoteProvider(syntheticQuotes);
    await expect(provider.retrieveQuote('missing')).rejects.toMatchObject({
      code: 'quote_not_found',
    });
  });
});
