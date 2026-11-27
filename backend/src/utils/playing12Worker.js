// Worker thread: searches the chunks of line-ups sent by playing12Search.js.
const { parentPort, workerData } = require('worker_threads');
const { createScorer, searchChunk } = require('./playing12Search');

const { features, mode, size } = workerData;
const scorer = createScorer(features, mode);

parentPort.on('message', ({ id, chunk }) => {
  parentPort.postMessage({ id, result: searchChunk(features, scorer, size, chunk) });
});
