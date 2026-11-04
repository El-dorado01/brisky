// Content evidence only: does not establish authorship or event eligibility.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const baseline = '05caf9af22173b5235cef4795ab19b2660761b8f';
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 32 * 1024 * 1024 });
const names = (...args) => git(...args).toString('utf8').split('\0').filter(Boolean);
const allowed = (file) => (file === 'README.md' || /^(apps\/(api|web)\/src\/|docs\/|scripts\/|services\/whisper-transcriber\/)/.test(file))
  && !/(^|\/)(node_modules|__pycache__|fixtures\/media|hackathon-evidence)(\/|$)/.test(file)
  && /\.(ts|tsx|js|cjs|mjs|py|md|sql)$/.test(file);
const candidates = new Set([...names('diff', '--name-only', '-z', baseline), ...names('ls-files', '--others', '--exclude-standard', '-z')]);
const files = [...candidates].filter(allowed).sort().map((file) => {
  const absolute = path.resolve(root, file);
  if (!absolute.startsWith(root + path.sep)) throw new Error('Snapshot path outside repository');
  return fs.existsSync(absolute)
    ? { path: file, sha256: createHash('sha256').update(fs.readFileSync(absolute)).digest('hex') }
    : { path: file, deleted: true };
});
const directory = path.join(root, 'docs', 'hackathon-evidence');
fs.mkdirSync(directory, { recursive: true });
const destination = path.join(directory, 'working-tree-2026-10-27.json');
if (fs.existsSync(destination)) throw new Error('Snapshot already exists; preserve it and create a separately dated snapshot for later work.');
fs.writeFileSync(destination, JSON.stringify({ recordedAt: new Date().toISOString(),
  comparisonCommit: baseline, headAtCapture: git('rev-parse', 'HEAD').toString().trim(),
  ownerConfirmation: { recordedOn: '2026-10-27', eventStartDate: '2026-10-26', eventEndDate: '2026-11-04',
    preEventUncommittedChanges: false, exactOpeningTime: 'not supplied' },
  limitation: 'Current content hashes only; event dates and clean pre-event working tree are owner-attested, not independently proven by this snapshot.', files }, null, 2) + '\n');
console.log(`Recorded ${files.length} source/document hashes in docs/hackathon-evidence/working-tree-2026-10-27.json`);
