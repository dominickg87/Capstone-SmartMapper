import {
  RedeemedGrantSchema,
  SourceAnswersSchema,
  type RedeemedGrant,
  type SourceAnswers,
  type StartJob,
} from '@smartmapper/contracts';

export interface ActiveTabSourceProvider {
  redeem(input: StartJob, signal?: AbortSignal): Promise<RedeemedGrant>;
  read(origin: string, token: string, signal?: AbortSignal): Promise<SourceAnswers>;
  revoke(origin: string, token: string): Promise<void>;
}

export class MiaActiveTabSourceProvider implements ActiveTabSourceProvider {
  public constructor(
    private readonly origins: ReadonlySet<string>,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async request(
    origin: string,
    path: string,
    init: RequestInit,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (!this.origins.has(origin)) throw new Error('mia_origin_not_allowed');
    const response = await this.fetcher(new URL('/api/extension/smartmapper/v2/' + path, origin), {
      ...init,
      redirect: 'error',
      signal: AbortSignal.any([AbortSignal.timeout(20_000), ...(signal ? [signal] : [])]),
      cache: 'no-store',
      credentials: 'omit',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...init.headers },
    });
    if (!response.ok)
      throw Object.assign(new Error('mia_authorization_failed'), { status: response.status });
    const limit = 4_000_000;
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

  public async redeem(input: StartJob, signal?: AbortSignal): Promise<RedeemedGrant> {
    return RedeemedGrantSchema.parse(
      await this.request(
        input.miaOrigin,
        'redeem',
        {
          method: 'POST',
          body: JSON.stringify({
            code: input.code,
            verifier: input.verifier,
            carrierOrigin: input.carrierOrigin,
            tabId: input.tabId,
          }),
        },
        signal,
      ),
    );
  }

  public async read(origin: string, token: string, signal?: AbortSignal): Promise<SourceAnswers> {
    return SourceAnswersSchema.parse(
      await this.request(
        origin,
        'source',
        {
          method: 'GET',
          headers: { authorization: 'Bearer ' + token },
        },
        signal,
      ),
    );
  }

  public async revoke(origin: string, token: string): Promise<void> {
    await this.request(origin, 'source', {
      method: 'DELETE',
      headers: { authorization: 'Bearer ' + token },
    });
  }
}
