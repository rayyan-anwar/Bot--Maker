'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { evaluateRetrieval } = require('../server/retrieval');

const datasetPath = process.env.BOTFORGE_RETRIEVAL_DATASET || path.join(__dirname, '..', 'tests', 'fixtures', 'retrieval-golden.json');
const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
if (!dataset || !Array.isArray(dataset.documents) || !Array.isArray(dataset.cases) ||
    !Number.isInteger(dataset.k) || dataset.k < 1) {
  throw new TypeError('Retrieval dataset must define documents, cases and a positive k.');
}
const metrics = evaluateRetrieval(dataset.documents, dataset.cases, dataset.k);
const result = {
  dataset: path.basename(datasetPath),
  version: dataset.version || null,
  k: dataset.k,
  thresholds: { recallAtK: dataset.minimumRecallAtK, meanReciprocalRank: dataset.minimumMeanReciprocalRank },
  metrics,
  passed: metrics.recallAtK >= dataset.minimumRecallAtK && metrics.meanReciprocalRank >= dataset.minimumMeanReciprocalRank
};
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
if (!result.passed) process.exitCode = 1;
