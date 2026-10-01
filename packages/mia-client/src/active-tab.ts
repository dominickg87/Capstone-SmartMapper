import {
  RedeemedGrantSchema,
  SourceAnswersSchema,
  type RedeemedGrant,
  type SourceAnswers,
  type StartJob,
} from '@smartmapper/contracts';

export interface ActiveTabSourceProvider {
  redeem(input: StartJob): Promise<RedeemedGrant>;
  read(origin: string, token: string): Promise<SourceAnswers>;
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
      signal: AbortSignal.timeout(20_000),
      headers: { 'content-type': 'application/json', accept: 'application/json', ...init.headers },
    });
    if (!response.ok) throw new Error('mia_authorization_failed');
    const content = await response.text();
    if (content.length > 2_000_000) throw new Error('source_too_large');
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
        }),
      }),
    );
  }

  public async read(origin: string, token: string): Promise<SourceAnswers> {
    return SourceAnswersSchema.parse(
      await this.request(origin, 'source', {
        method: 'GET',
        headers: { authorization: 'Bearer ' + token },
      }),
    );
  }

  public async revoke(origin: string, token: string): Promise<void> {
    await this.request(origin, 'source', {
      method: 'DELETE',
      headers: { authorization: 'Bearer ' + token },
    });
  }
}
