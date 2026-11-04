import {ConfigService} from '@nestjs/config';
import {BadRequestException,NotFoundException} from '@nestjs/common';
import {ConversationService} from './conversation.service';
import {MetaAiProvider} from '../pipeline/providers/meta-ai.provider';
import {GoogleAiProvider} from '../pipeline/providers/google-ai.provider';

const config={get:(key:string,fallback?:unknown)=>key==='SPACE_REPLIES_ENABLED'?'true':fallback} as ConfigService;
const document={title:'Brief',summary:'Summary',sections:[{heading:'Details',body:'Supported detail',evidenceIds:['e1']}],suggestions:[]};
const input={format:'brief',goal:'Explain',selection:[{assetId:'asset',startS:1,endS:5}]};
describe('Studio engine orchestration',()=>{
  function fixture(){
    const db={query:jest.fn().mockResolvedValueOnce({rowCount:1,rows:[{id:'asset'}]}).mockResolvedValue({rows:[{asset_id:'asset',start_time:0,end_time:20,evidence_start:1,evidence_end:5,title:'Indexed title',original_filename:'test.mp4',range_transcript:'Indexed words',description:'Indexed description'}]})};
    const ai={isConfigured:()=>true,studioDocument:jest.fn().mockResolvedValue({document})};
    return {db,ai,service:new ConversationService(db as any,{} as any,ai as any,config)};
  }
  it('reads owned indexed evidence instead of trusting client titles',async()=>{
    const f=fixture(),result=await f.service.studio('owner',input);
    expect(f.db.query.mock.calls.every(call=>call[1][0]==='owner')).toBe(true);
    expect(result.evidence[0]).toMatchObject({id:'e1',startS:1,endS:5,title:'Indexed title',transcript:'Indexed words'});
    expect(f.ai.studioDocument.mock.calls[0][0].evidence).toEqual(result.evidence);
  });
  it('rejects missing or foreign sources before calling the model',async()=>{
    const f=fixture();f.db.query.mockReset().mockResolvedValue({rowCount:0,rows:[]});
    await expect(f.service.studio('owner',input)).rejects.toThrow(NotFoundException);expect(f.ai.studioDocument).not.toHaveBeenCalled();
  });
  it('rejects unsupported formats and injected evidence',async()=>{
    const f=fixture();for(const raw of [{...input,format:'reel'},{...input,evidence:['forged']}])await expect(f.service.studio('owner',raw)).rejects.toThrow(BadRequestException);
    expect(f.ai.studioDocument).not.toHaveBeenCalled();
  });
  it('Meta uses the existing metered transport and validates evidence IDs',async()=>{
    const provider=new MetaAiProvider(config,{} as any,{} as any),context={format:'brief' as const,goal:'',evidence:[{id:'e1'}] as any};
    const complete=jest.spyOn((provider as any).transport,'complete').mockImplementation(async(...args:any[])=>({value:args[4](document)}));
    expect((await provider.studioDocument(context)).document).toEqual(document);expect(complete.mock.calls[0][0]).toBe('studio_document');
  });
  it('Gemini uses its existing metered generation boundary',async()=>{
    const provider=new GoogleAiProvider(config,{} as any),context={format:'brief' as const,goal:'',evidence:[{id:'e1'}] as any};
    const generate=jest.spyOn(provider as any,'generateContent').mockResolvedValue({text:JSON.stringify(document)});
    jest.spyOn(provider as any,'usageFromGenerate').mockReturnValue({});
    expect((await provider.studioDocument(context)).document).toEqual(document);expect(generate.mock.calls[0][0]).toBe('studio_document');
  });
});
