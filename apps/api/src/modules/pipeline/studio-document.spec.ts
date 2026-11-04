import { parseStudioDocument, StudioInput } from './studio-document';

describe('source-grounded Studio document',()=>{
  const input={format:'brief',goal:'Explain the sequence',evidence:[{id:'e1'}]} as StudioInput;
  const document={title:'A sequence',summary:'A supported summary.',sections:[{heading:'What happened',body:'A supported detail.',evidenceIds:['e1']}],suggestions:[]};
  it('accepts a document with attached evidence',()=>expect(parseStudioDocument(document,input)).toEqual(document));
  it.each([{ids:[]},{ids:['invented']},{ids:['e1','e1']}])('rejects unsupported or missing section citations $ids',({ids})=>{
    expect(()=>parseStudioDocument({...document,sections:[{...document.sections[0],evidenceIds:ids}]},input)).toThrow();
  });
  it('rejects extra executable-looking fields',()=>expect(()=>parseStudioDocument({...document,html:'<script>run()</script>'},input)).toThrow());
  it('bounds generated content',()=>expect(()=>parseStudioDocument({...document,summary:'x'.repeat(1801)},input)).toThrow());
});
