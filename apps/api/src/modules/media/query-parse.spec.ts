import {parseSearchQuery} from './query-parse';
describe('spoken quote recall',()=>{
 it('preserves quoted words through the cleaned fallback and provides partial lexical recall',()=>{
  const query='a moment that says "i look at my exam questions, and they look back at me. i know nothing"';
  const parsed=parseSearchQuery(query);expect(parsed.intent).toBe('spoken');expect(parsed.phrases).toHaveLength(1);expect(parsed.contentTerms).toEqual(expect.arrayContaining(['exam','questions','know','nothing']));
  expect(parseSearchQuery(parsed.cleaned).contentTerms).toEqual(expect.arrayContaining(['questions','know','nothing']));
 });
 it('does not treat quoted text as proof of accompanying visual constraints',()=>{expect(parseSearchQuery('Find the man wearing a red shirt saying "hello there"').intent).toBe('mixed');});
});
