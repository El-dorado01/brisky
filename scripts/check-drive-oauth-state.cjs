// Pure local state checks: no Google calls, credentials or database writes.
const path=require('path'),assert=require('assert/strict');
const api=path.resolve(__dirname,'../apps/api');
require(require.resolve('ts-node',{paths:[api]})).register({project:path.join(api,'tsconfig.json'),transpileOnly:true});
const {createDriveState,validDriveState}=require('../apps/web/server/drive-oauth-state');
const secret='fixture-secret-'.repeat(4),now=1000000,{state,cookie}=createDriveState('session-one',secret,now);
assert(validDriveState(cookie,state,'session-one',secret,now));
assert(!validDriveState(cookie,state,'session-two',secret,now));
assert(!validDriveState(cookie,state,'session-one',secret,now+600001));
assert(!validDriveState(cookie,'x'.repeat(43),'session-one',secret,now));
assert(!validDriveState(cookie+'tampered',state,'session-one',secret,now));
assert(!validDriveState(cookie,state,'session-one','wrong-secret',now));
assert.throws(()=>createDriveState('session','short',now));
console.log('PASS: signed browser/session binding, nonce mismatch, expiry, tampering and missing-secret rejection. No external calls.');
