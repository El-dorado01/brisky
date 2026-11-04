import { GoogleAiProvider } from './google-ai.provider';

describe('Google billing and authentication admission failures',()=>{
  it.each([400,401,402,403])('does not retry or rotate keys on HTTP %s even with RESOURCE_EXHAUSTED in the message',async status=>{
    const provider:any=Object.create(GoogleAiProvider.prototype);
    const error=Object.assign(new Error('RESOURCE_EXHAUSTED sensitive-provider-detail'),{status});
    const generateContent=jest.fn().mockRejectedValue(error),release=jest.fn();
    provider.isConfigured=()=>true;
    provider.logger={log:jest.fn(),warn:jest.fn()};
    provider.semaphore={acquire:async()=>release};
    provider.getModelCascade=()=>['primary','fallback'];
    provider.getClient=()=>({models:{generateContent}});
    provider.meterAttempt=async(_stage:unknown,_model:unknown,_id:unknown,work:()=>Promise<unknown>)=>work();
    provider.requestTimeoutMs=()=>1000;provider.maxOutputTokens=()=>128;
    provider.rotateKey=jest.fn();provider.aiClients=[{},{}];
    await expect(provider.generateContent('space_conversation_plan',[])).rejects.toBe(error);
    expect(generateContent).toHaveBeenCalledTimes(1);expect(provider.rotateKey).not.toHaveBeenCalled();expect(release).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(provider.logger.warn.mock.calls)).not.toContain('sensitive-provider-detail');
  });
  it('also recognizes SDK errors exposing a numeric code instead of status',async()=>{
    const provider:any=Object.create(GoogleAiProvider.prototype),error=Object.assign(new Error('RESOURCE_EXHAUSTED'),{code:402});
    const generateContent=jest.fn().mockRejectedValue(error);
    provider.isConfigured=()=>true;provider.logger={log:jest.fn(),warn:jest.fn()};provider.semaphore={acquire:async()=>()=>undefined};provider.getModelCascade=()=>['primary'];
    provider.getClient=()=>({models:{generateContent}});provider.meterAttempt=async(_s:unknown,_m:unknown,_i:unknown,work:()=>Promise<unknown>)=>work();provider.requestTimeoutMs=()=>1000;provider.maxOutputTokens=()=>128;
    await expect(provider.generateContent('test',[])).rejects.toBe(error);expect(generateContent).toHaveBeenCalledTimes(1);
  });
});
