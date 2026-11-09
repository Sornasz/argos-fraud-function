import { readServiceConfig } from './bootstrap/config.js';
import { createHealthCheckFeature } from './features/health-check/index.js';
import { createScoreTransactionFeature } from './features/score-transaction/index.js';

const config = readServiceConfig(process.env);

const scoring = createScoreTransactionFeature({ ...config, env: process.env });
const healthCheck = createHealthCheckFeature({ referenceIndexStatus: scoring.referenceIndexStatus });

scoring.registerFunctions();
healthCheck.registerFunctions();

// O carregamento roda em segundo plano; até terminar, /ready e /fraud-score respondem 503.
void scoring.loadReferenceIndex().then((status) => {
  const log = status.state === 'ready' ? console.info : console.error;
  log(JSON.stringify({ event: 'reference_index_loaded', ...status }));
});
