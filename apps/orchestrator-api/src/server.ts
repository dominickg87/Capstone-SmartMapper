import { MiaActiveTabSourceProvider, MiaTrainingGrantProvider } from '@smartmapper/mia-client';
import insights from 'applicationinsights';
import { ActiveTabJobService } from './active-tab-service.js';
import { AzureCheckpointStore, MemoryCheckpointStore } from './checkpoints.js';
import { configuration } from './config.js';
import { JobDiagnostics } from './diagnostics.js';
import { createApi } from './http.js';
import { AzureMappingRegistryStore, MemoryMappingRegistryStore } from './mapping-registry.js';
import {
  AzureTrainingSessionStore,
  MemoryTrainingSessionStore,
  TrainingService,
} from './training-service.js';

const config = configuration(process.env);
if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  insights
    .setup()
    .setAutoCollectRequests(false)
    .setAutoCollectDependencies(false)
    .setAutoCollectExceptions(false)
    .setAutoCollectConsole(false)
    .setAutoCollectPerformance(false, false)
    .setSendLiveMetrics(false)
    .start();
}
const diagnostics = new JobDiagnostics((event) => {
  console.info(JSON.stringify({ event: 'smartmapper.stage', ...event }));
  insights.defaultClient?.trackEvent({
    name: 'smartmapper.stage',
    properties: { ...event, counts: JSON.stringify(event.counts ?? {}) },
  });
});
const persistence =
  config.checkpoints.kind === 'memory'
    ? {
        jobs: new MemoryCheckpointStore(),
        registry: new MemoryMappingRegistryStore(),
        trainingDrafts: new MemoryTrainingSessionStore(),
      }
    : {
        jobs: new AzureCheckpointStore(config.checkpoints.endpoint, config.checkpoints.table),
        registry: new AzureMappingRegistryStore(
          config.checkpoints.endpoint,
          config.checkpoints.mappingsTable,
        ),
        trainingDrafts: new AzureTrainingSessionStore(
          config.checkpoints.endpoint,
          config.checkpoints.table,
        ),
      };
const { jobs, registry, trainingDrafts } = persistence;
const sourceProvider = new MiaActiveTabSourceProvider(config.access.miaOrigins);
const service = new ActiveTabJobService(jobs, sourceProvider, registry, config.access, diagnostics);
const training = new TrainingService(
  trainingDrafts,
  new MiaTrainingGrantProvider(config.access.miaOrigins),
  registry,
  config.access,
  jobs,
);
const server = createApi(
  service,
  config.extensionOrigins,
  (status) => {
    insights.defaultClient?.trackMetric({
      name: 'smartmapper.request',
      value: 1,
      properties: { status: String(status) },
    });
  },
  150_000,
  training,
);
const cleanup = setInterval(() => {
  void jobs.purgeExpired(new Date().toISOString()).catch(() => {
    insights.defaultClient?.trackEvent({ name: 'smartmapper.cleanup_failed' });
  });
}, 5 * 60_000);
cleanup.unref();
server.listen(config.port, config.listenHost, () => {
  console.info('SmartMapper API ready');
});
process.on('SIGTERM', () => {
  clearInterval(cleanup);
  server.close();
});
