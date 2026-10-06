import {
  RedeemedTrainingGrantSchema,
  type RedeemedTrainingGrant,
  type StartTrainingSession,
} from '@smartmapper/contracts';

export interface TrainingGrantProvider {
  redeem(input: StartTrainingSession, signal?: AbortSignal): Promise<RedeemedTrainingGrant>;
}

export class MiaTrainingGrantProvider implements TrainingGrantProvider {
  public constructor(
    private readonly origins: ReadonlySet<string>,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  public async redeem(
    input: StartTrainingSession,
    signal?: AbortSignal,
  ): Promise<RedeemedTrainingGrant> {
    if (!this.origins.has(input.miaOrigin)) throw new Error('mia_origin_not_allowed');
    const response = await this.fetcher(
      new URL('/api/extension/smartmapper/v2/training/redeem', input.miaOrigin),
      {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.any([AbortSignal.timeout(20_000), ...(signal ? [signal] : [])]),
        cache: 'no-store',
        credentials: 'omit',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          code: input.code,
          verifier: input.verifier,
          carrierOrigin: input.carrierOrigin,
          tabId: input.tabId,
          formType: input.formType,
        }),
      },
    );
    if (!response.ok)
      throw Object.assign(new Error('mia_training_authorization_failed'), {
        status: response.status,
      });
    if (Number(response.headers.get('content-length')) > 4_000_000)
      throw new Error('catalog_too_large');
    const json: unknown = await response.json();
    return RedeemedTrainingGrantSchema.parse(json);
  }
}
