import { ConnectorsService } from './connectors.service';
import { SaasConnectorsController } from './saas-connectors.controller';
describe('sync boundaries and combined save',()=>{
  function make(folders=[{id:'selected',name:'Videos'}]){
    const connector={getChanges:jest.fn(async()=>({added:[],modified:[],deleted:[],newCursor:'next'})),getStartCursor:jest.fn(async()=> 'start'),listAssets:jest.fn(async()=>({assets:[],nextCursor:undefined as string|undefined}))};
    const db={query:jest.fn(async(sql:string)=>({rows:sql.includes('SELECT provider')?[{provider:'google_drive',selected_folders:folders,sync_cursor:'cursor'}]:[]}))},indexing={enqueueAsset:jest.fn()};
    const service=new ConnectorsService(db as any,{} as any,{} as any,{get:()=>connector} as any,indexing as any);jest.spyOn(service,'getAuthContext').mockResolvedValue({});return {service,connector,db,indexing};
  }
  it('rejects empty selection before consuming account-wide changes',async()=>{
    const {service,connector}=make([]);await expect(service.syncAccountChanges('account','owner')).rejects.toThrow('Select at least');expect(connector.getChanges).not.toHaveBeenCalled();
  });
  it('does not import a new change with unknown or outside parent',async()=>{
    const {service,connector,indexing}=make();connector.getChanges.mockResolvedValueOnce({added:[{remoteId:'unknown'},{remoteId:'outside',path:'elsewhere'}],modified:[],deleted:[],newCursor:'next'} as any);
    const result=await service.syncAccountChanges('account','owner');expect(result.addedCount).toBe(0);expect(indexing.enqueueAsset).not.toHaveBeenCalled();
  });
  it('hides a moved-out source without reindexing it',async()=>{
    const {service,connector,db,indexing}=make();connector.getChanges.mockResolvedValueOnce({added:[],modified:[{remoteId:'moved',path:'elsewhere'}],deleted:[],newCursor:'next'} as any);
    await service.syncAccountChanges('account','owner');expect(indexing.enqueueAsset).not.toHaveBeenCalled();expect(db.query).toHaveBeenCalledWith(expect.stringContaining("availability='offline'"),['moved','owner','account']);
  });
  it('captures the cursor before listing and refuses incomplete discovery before archiving',async()=>{
    const {service,connector,db}=make();connector.listAssets.mockResolvedValueOnce({assets:[],nextCursor:'more'});
    await expect(service.syncAccount('account','owner')).rejects.toThrow('incomplete');expect(connector.getStartCursor.mock.invocationCallOrder[0]).toBeLessThan(connector.listAssets.mock.invocationCallOrder[0]);expect(db.query.mock.calls.some(([sql])=>sql.includes('UPDATE media_assets'))).toBe(false);
  });
  it('rejects overlapping sync requests for the same account',async()=>{
    const {service,connector}=make();let release!:()=>void;connector.getChanges.mockImplementationOnce(async()=>{await new Promise<void>(resolve=>{release=resolve;});return {added:[],modified:[],deleted:[],newCursor:'next'};});
    const first=service.syncAccountChanges('account','owner');while(!release)await Promise.resolve();await expect(service.syncAccountChanges('account','owner')).rejects.toThrow('already syncing');release();await first;
  });
  it.each(['paused','failed','complete'])('preserves saved folders when combined sync is %s',async(status)=>{
    const service={setSelectedFolders:jest.fn(),syncAccount:status==='failed'?jest.fn().mockRejectedValue(Error('provider detail')):jest.fn().mockResolvedValue({discovered:1,queued:0})};
    const controller=new SaasConnectorsController(service as any,{} as any,{} as any,{get:(key:string)=>key==='SAAS_DRIVE_SYNC_ACCOUNT_IDS'?'account':status==='paused'?'false':'true'} as any);
    const result=await controller.select('account',{folders:[{id:'selected',name:'Videos'}],sync:true},{user:{id:'owner'}});
    expect(result).toMatchObject({saved:true,syncStatus:status});expect(service.setSelectedFolders).toHaveBeenCalled();if(status==='paused')expect(service.syncAccount).not.toHaveBeenCalled();expect(JSON.stringify(result)).not.toContain('provider detail');
  });
});
