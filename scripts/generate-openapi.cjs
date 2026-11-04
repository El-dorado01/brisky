const fs = require('fs');
const path = require('path');
const api = path.resolve(__dirname, '../apps/api');
require(require.resolve('ts-node', { paths: [api] })).register({ project: path.join(api, 'tsconfig.json'), transpileOnly: true });
const { apiContract } = require(path.join(api, 'src/common/api-contract'));
fs.writeFileSync(path.resolve(__dirname, '../docs/openapi.json'), JSON.stringify(apiContract, null, 2) + '\n');
console.log('Generated docs/openapi.json from the served API contract.');
