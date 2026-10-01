import {
  RedeemedGrantSchema,
  SourceAnswersSchema,
  QuoteSheetSchema,
  type QuoteSheet,
  type RedeemedGrant,
  type SourceAnswers,
  type StartJob,
} from '@smartmapper/contracts';

export interface ActiveTabSourceProvider {
  redeem(input: StartJob): Promise<RedeemedGrant>;
  read(origin: string, token: string, format?: 'pdf'): Promise<SourceAnswers>;
  document?(origin: string, token: string): Promise<QuoteSheet>;
  revoke(origin: string, token: string): Promise<void>;
}

export class MiaActiveTabSourceProvider implements ActiveTabSourceProvider {
  public constructor(
    private readonly origins: ReadonlySet<string>,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async request(origin: string, path: string, init: RequestInit): Promise<unknown> {
    if (!this.origins.has(origin)) throw new Error('mia_origin_not_allowed');
    const response = await this.fetcher(new URL('/api/extension/smartmapper/v2/' + path, origin), {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(path === 'quote-sheet' ? 90_000 : 20_000),
      cache: 'no-store',
      credentials: 'omit',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...init.headers },
    });
    if (!response.ok) throw new Error('mia_authorization_failed');
    const limit = path === 'quote-sheet' ? 21_000_000 : 2_000_000;
    if (Number(response.headers.get('content-length')) > limit) throw new Error('source_too_large');
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > limit) {
          await reader.cancel();
          throw new Error('source_too_large');
        }
        chunks.push(chunk.value);
      }
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const content = new TextDecoder().decode(bytes);
    return content ? (JSON.parse(content) as unknown) : null;
  }

  public async redeem(input: StartJob): Promise<RedeemedGrant> {
    return RedeemedGrantSchema.parse(
      await this.request(input.miaOrigin, 'redeem', {
        method: 'POST',
        body: JSON.stringify({
          code: input.code,
          verifier: input.verifier,
          carrierOrigin: input.carrierOrigin,
          tabId: input.tabId,
          ...(input.sourceFormat ? { sourceFormat: input.sourceFormat } : {}),
        }),
      }),
    );
  }

  public async read(origin: string, token: string, format?: 'pdf'): Promise<SourceAnswers> {
    return SourceAnswersSchema.parse(
      await this.request(origin, format === 'pdf' ? 'quote-sheet/metadata' : 'source', {
        method: 'GET',
        headers: { authorization: 'Bearer ' + token },
      }),
    );
  }

  public async document(origin: string, token: string): Promise<QuoteSheet> {
    const document = QuoteSheetSchema.parse(
      await this.request(origin, 'quote-sheet', {
        method: 'GET',
        headers: { authorization: 'Bearer ' + token },
      }),
    );
    const bytes = Uint8Array.from(atob(document.data), (c) => c.charCodeAt(0));
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      (byte) => byte.toString(16).padStart(2, '0'),
    ).join('');
    if (digest !== document.digest || new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-')
      throw new Error('invalid_quote_sheet');
    return document;
  }

  public async revoke(origin: string, token: string): Promise<void> {
    await this.request(origin, 'source', {
      method: 'DELETE',
      headers: { authorization: 'Bearer ' + token },
    });
  }
}
