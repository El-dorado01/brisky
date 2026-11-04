// Protocol fixture only: never loads a model or uses the network.
const readline = require('readline');
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const request = JSON.parse(line);
  if (request.texts.includes('__crash__')) process.exit(2);
  if (request.texts.includes('__hang__')) return;
  const vectors = request.texts.map((text) => [text.length, ...Array(383).fill(0)]);
  process.stdout.write(JSON.stringify({ id: request.id, model: 'all-MiniLM-L6-v2',
    dimensions: 384, duration_ms: 1,
    vectors: request.texts.includes('__bad__') ? [[1]] : vectors }) + '\n');
});
