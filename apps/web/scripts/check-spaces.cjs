/* eslint-disable @typescript-eslint/no-require-imports -- Local TypeScript integration bootstrap. */
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
require.extensions['.ts']=(module,filename)=>{
  if(!filename.startsWith(root+path.sep))throw new Error('Only project TypeScript is allowed');
  module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
};
require('./check-spaces.ts');
