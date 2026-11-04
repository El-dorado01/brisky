const readline = require('node:readline');
const path = require('node:path');
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const request = JSON.parse(line);
  const name = path.basename(request.audio);
  if (name.includes('hang')) return;
  if (name.includes('bad')) { process.stdout.write('{}\n'); return; }
  process.stdout.write(JSON.stringify({ id: request.id, ok: true, result: { model: String(process.pid), language: 'en',
    cues: [{ start_time: 0, end_time: 1, text: name }] } }) + '\n');
});
