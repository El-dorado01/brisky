import { SaasConnectorsController } from './saas-connectors.controller';
import { ConnectorsService } from './connectors.service';

describe('SaaS Drive integration',()=>{
  const owner='owner';
  it('pins the configured callback and never accepts a caller-supplied owner',()=>{
    const drive={isConfigured:()=>true,getAuthUrl:jest.fn(()=> 'url')};
    const controller=new SaasConnectorsController({} as any,drive as any,{} as any,{get:()=> 'http://localhost:3000/api/connectors/google-drive/callback'} as any);
    expect(controller.start({state:'a'.repeat(43)})).toEqual({url:'url'});
    expect(drive.getAuthUrl).toHaveBeenCalledWith('a'.repeat(43),'http://localhost:3000/api/connectors/google-drive/callback');
    expect(()=>controller.start({state:'a'.repeat(43),userId:'someone'})).toThrow('Invalid OAuth state');
  });
  it('scopes callback completion to the session owner and keeps sync off by default',async()=>{
    const service={linkGoogleForUser:jest.fn().mockResolvedValue({accountId:'account'}),syncAccount:jest.fn()};
    const config={get:(key:string,fallback:string)=>key==='GOOGLE_SAAS_REDIRECT_URI'?'http://localhost:3000/api/connectors/google-drive/callback':fallback};
    const controller=new SaasConnectorsController(service as any,{} as any,{} as any,config as any);
    await controller.complete({code:'fixture-code'},{user:{id:owner}});
    expect(service.linkGoogleForUser).toHaveBeenCalledWith('fixture-code',owner,'http://localhost:3000/api/connectors/google-drive/callback');
    expect(()=>controller.complete({code:'x',userId:'other'},{user:{id:owner}})).toThrow('Invalid authorization code');
    await expect(controller.sync('account',{user:{id:owner}})).rejects.toThrow('Indexing is paused');expect(service.syncAccount).not.toHaveBeenCalled();
  });
  it('uses only owner-scoped database status, without global queue counts',async()=>{
    const db={query:jest.fn().mockResolvedValue({rows:[]})};
    const controller=new SaasConnectorsController({listAccounts:async()=>[]} as any,{} as any,db as any,{get:()=> 'false'} as any);
    await controller.indexing({user:{id:owner}});await controller.list({user:{id:owner}});
    for(const [sql,params] of db.query.mock.calls){expect(sql).toContain('user_id=$1');expect(params).toEqual([owner]);}
  });
  it('rejects forged legacy state and never falls back to the first database user',async()=>{
    const db={query:jest.fn()},drive={isConfigured:()=>true,getAuthUrl:(state:string)=>'https://accounts.google.com/?state='+state,exchangeCodeForTokens:jest.fn()};
    const service=new ConnectorsService(db as any,{} as any,drive as any,{} as any,{} as any);
    await expect(service.handleGoogleCallback('code',Buffer.from(JSON.stringify({userId:owner})).toString('base64'))).rejects.toThrow('OAuth session expired');
    await expect(service.handleGoogleCallback('code')).rejects.toThrow('OAuth session expired');
    expect(db.query).not.toHaveBeenCalled();expect(drive.exchangeCodeForTokens).not.toHaveBeenCalled();
    const state=new URL(service.getGoogleAuthUrl(owner)).searchParams.get('state')!;drive.exchangeCodeForTokens.mockRejectedValue(new Error('fixture exchange failure'));
    await expect(service.handleGoogleCallback('code',state)).rejects.toThrow('fixture exchange failure');
    await expect(service.handleGoogleCallback('code',state)).rejects.toThrow('OAuth session expired');
    expect(drive.exchangeCodeForTokens).toHaveBeenCalledTimes(1);
  });
});
