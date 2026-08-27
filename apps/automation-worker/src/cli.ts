import { syntheticQuote } from '@smartmapper/mia-client';
import { JsonLineSafeLogger } from '@smartmapper/observability';

import { runSyntheticRemoteJob } from './index.js';

const logger = new JsonLineSafeLogger();
const flowArgument = process.argv.find((argument) => argument.startsWith('--flow='));
const flow = flowArgument?.split('=')[1];

if (flow !== 'modern' && flow !== 'classic') {
  console.error(
    'Usage: pnpm dev:worker -- --flow=modern|classic. Start pnpm dev:mock-carriers first.',
  );
  process.exitCode = 1;
} else {
  void runSyntheticRemoteJob({
    baseUrl: process.env.SMARTMAPPER_MOCK_CARRIER_URL ?? 'http://127.0.0.1:4173',
    flow,
    quote: syntheticQuote,
  })
    .then((result) => {
      logger.write({
        level: 'info',
        event: 'synthetic_worker_completed',
        fields: {
          state: result.state,
          executedActionCount: result.actionResults.length,
          reviewItemCount: result.reviewItems.length,
          finalSubmitClicked: result.finalSubmitClicked,
        },
      });
    })
    .catch((error: unknown) => {
      logger.write({
        level: 'error',
        event: 'synthetic_worker_failed',
        fields: { message: error instanceof Error ? error.message : 'unknown_error' },
      });
      process.exitCode = 1;
    });
}
