import { MiaQuotePayloadSchema, type MiaQuotePayload } from '@smartmapper/contracts';

export interface QuoteSearchCriteria {
  syntheticQuery: string;
}

export interface QuoteSummary {
  quoteReference: string;
  displayLabel: string;
  lineOfBusiness: string;
}

export interface MiaQuoteProvider {
  searchQuotes(criteria: QuoteSearchCriteria): Promise<QuoteSummary[]>;
  retrieveQuote(quoteReference: string): Promise<MiaQuotePayload>;
}

export type MiaProviderErrorCode =
  'quote_not_found' | 'invalid_payload' | 'provider_unavailable' | 'authentication_not_configured';

export class MiaProviderError extends Error {
  public constructor(
    public readonly code: MiaProviderErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'MiaProviderError';
  }
}

export class InMemoryMiaQuoteProvider implements MiaQuoteProvider {
  private readonly quotes: Map<string, MiaQuotePayload>;

  public constructor(quotes: readonly MiaQuotePayload[]) {
    this.quotes = new Map(
      quotes.map((quote) => [
        quote.metadata.quoteId,
        MiaQuotePayloadSchema.parse(structuredClone(quote)),
      ]),
    );
  }

  public searchQuotes(criteria: QuoteSearchCriteria): Promise<QuoteSummary[]> {
    const query = criteria.syntheticQuery.toLocaleLowerCase();
    return Promise.resolve(
      [...this.quotes.values()]
        .filter((quote) => quote.metadata.quoteId.toLocaleLowerCase().includes(query))
        .map((quote) => ({
          quoteReference: quote.metadata.quoteId,
          displayLabel: 'Synthetic quote ' + quote.metadata.quoteId,
          lineOfBusiness: quote.requestedCoverage.lineOfBusiness,
        })),
    );
  }

  public retrieveQuote(quoteReference: string): Promise<MiaQuotePayload> {
    const quote = this.quotes.get(quoteReference);
    if (!quote) {
      return Promise.reject(
        new MiaProviderError('quote_not_found', 'The requested synthetic quote was not found.'),
      );
    }

    return Promise.resolve(structuredClone(quote));
  }
}

export interface FutureMiaApiConfiguration {
  developmentBaseUrl: string;
  authenticationSecretName: string;
}

export class FutureMiaApiProvider implements MiaQuoteProvider {
  public constructor(public readonly configuration: FutureMiaApiConfiguration) {}

  public searchQuotes(_criteria: QuoteSearchCriteria): Promise<QuoteSummary[]> {
    return Promise.reject(
      new MiaProviderError(
        'authentication_not_configured',
        'Future M.I.A. development API authentication requires Dom-approved configuration.',
      ),
    );
  }

  public retrieveQuote(_quoteReference: string): Promise<MiaQuotePayload> {
    return Promise.reject(
      new MiaProviderError(
        'authentication_not_configured',
        'Future M.I.A. development API endpoints and authentication are not defined.',
      ),
    );
  }
}
