import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeQuotes } from '../pricing.js';

test('never invent missing prices', () => {
  const result = summarizeQuotes({travelers:2,budget:1000});
  assert.equal(result.knownTotal,0);
  assert.equal(result.complete,false);
  assert.deepEqual(result.missing.slice(0,2),['flight','stay']);
});
test('calculate available provider-shaped subtotal and remaining budget', () => {
  const result = summarizeQuotes({
    travelers:2,budget:1000,
    flights:{provider:'Duffel',offers:[{amount:'300',currency:'EUR',expiresAt:new Date(Date.now()+3600000).toISOString()}]},
    stays:{provider:'Booking.com',currency:'EUR',offers:[{amount:250,url:'https://www.booking.com/hotel/es/test.html',name:'Test'}]}
  });
  assert.equal(result.knownTotal,550);
  assert.equal(result.remainingBeforeLocalCosts,450);
  assert.equal(result.perPersonKnown,275);
  assert.equal(result.complete,true);
});
test('reject expired flights and invalid budgets', () => {
  const result = summarizeQuotes({travelers:1,flights:{provider:'Duffel',offers:[{amount:'50',currency:'EUR',expiresAt:'2020-01-01T00:00:00Z'}]}});
  assert.equal(result.flight,null);
  assert.throws(()=>summarizeQuotes({travelers:0}),/Invalid/);
});
