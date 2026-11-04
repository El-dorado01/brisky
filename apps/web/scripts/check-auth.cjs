// Reuse the project's TypeScript compiler; no extra runtime/test-runner dependency.
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS bootstrap for the local TypeScript integration check. */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
require.extensions['.ts'] = (module, filename) => {
  if (!filename.startsWith(root + path.sep)) throw new Error('Test compiler only accepts project files');
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  module._compile(output.outputText, filename);
};
require('./check-auth.ts');
