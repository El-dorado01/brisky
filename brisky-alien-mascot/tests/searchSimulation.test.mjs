import test from 'node:test';
import assert from 'node:assert/strict';
import {initialSearch,searchSimulationReducer as reduce} from '../src/searchSimulation.ts';

test('a superseded completion cannot replace the latest query or result',()=>{
  const first=reduce(initialSearch,{type:'start',requestId:1,query:'old memory'});
  const latest=reduce(first,{type:'start',requestId:2,query:'new memory'});
  assert.equal(reduce(latest,{type:'complete',requestId:1,outcome:'success'}),latest);
  const done=reduce(latest,{type:'complete',requestId:2,outcome:'empty'});
  assert.equal(done.status,'empty');assert.equal(done.query,'new memory');
  assert.equal(reduce(done,{type:'complete',requestId:2,outcome:'error'}),done);
});

test('cancellation ignores late completions, including after another search starts',()=>{
  const pending=reduce(initialSearch,{type:'start',requestId:3,query:'cancel me'});
  const cancelled=reduce(pending,{type:'reset'});
  assert.equal(reduce(cancelled,{type:'complete',requestId:3,outcome:'success'}),cancelled);
  const next=reduce(cancelled,{type:'start',requestId:4,query:'keep me'});
  assert.equal(reduce(next,{type:'complete',requestId:3,outcome:'error'}),next);
  assert.equal(reduce(next,{type:'complete',requestId:4,outcome:'success'}).status,'success');
});
