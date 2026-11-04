import { canonical, KnownPerson, resolveReferences, searchInput } from './people-search';
import { PeopleSearchService } from './people-search.service';
import { MediaService } from '../media/media.service';

const owner = '11111111-1111-4111-8111-111111111111';
const me = '22222222-2222-4222-8222-222222222222';
const uncle = '33333333-3333-4333-8333-333333333333';
const another = '44444444-4444-4444-8444-444444444444';
const people: KnownPerson[] = [
  { id: me, name: 'Amara', aliases: [], isMe: true },
  { id: uncle, name: 'Uncle Dave', aliases: ['my uncle','Dave'], isMe: false },
];
describe('personal reference resolution', () => {
  it('resolves contextual self and user-supplied relationships', () => {
    const refs = resolveReferences('Find where I was talking to my uncle', people);
    expect(new Set(refs.map(r => r.personId))).toEqual(new Set([me,uncle]));
  });
  it('does not interpret request phrasing find me as self', () => {
    expect(resolveReferences('Find me moments with Dave', people).map(r => r.personId)).toEqual([uncle]);
    expect(resolveReferences('Find me a red car', people)).toEqual([]);
  });
  it('keeps an unknown relative or self unresolved', () => {
    const refs = resolveReferences('me with my uncle', []);
    expect(refs).toHaveLength(2);
    expect(refs.every(r => !r.personId && !r.candidates.length)).toBe(true);
  });
  it('does not match names inside other words', () => {
    expect(resolveReferences('Joanne walks', [{ ...people[0], name: 'Ann', isMe: false }])).toEqual([]);
  });
  it('prefers full names over nested aliases', () => {
    const directory = [...people, { id: another, name: 'Dave', aliases: [], isMe: false }];
    const refs = resolveReferences('my Uncle Dave', directory);
    expect(refs).toHaveLength(1);
    expect(refs[0].personId).toBe(uncle);
  });
  it('accepts a relationship stored without the possessive prefix', () => {
    expect(resolveReferences('my uncle', [{ ...people[1], aliases: ['uncle'] }], ['my uncle'])[0].personId).toBe(uncle);
  });
  it('exposes all ambiguous candidates and validates the selected candidate', () => {
    const directory = [...people, { ...people[1], id: another }];
    expect(resolveReferences('my uncle', directory)[0].personId).toBeUndefined();
    expect(resolveReferences('my uncle', directory)[0].candidates).toHaveLength(2);
    expect(resolveReferences('my uncle', directory, undefined, [{ reference: 'MY UNCLE', personId: another }])[0].personId).toBe(another);
    expect(() => resolveReferences('my uncle', people, undefined, [{ reference: 'my uncle', personId: another }])).toThrow();
    expect(() => resolveReferences('Dave', people, undefined, [{ reference: 'Sarah', personId: uncle }])).toThrow();
  });
  it('reserves self pronouns rather than trusting aliases of another person', () => {
    expect(resolveReferences('me', [{ ...people[1], aliases: ['me'] }])[0].personId).toBeUndefined();
  });
  it('normalizes Unicode and punctuation without dropping accents', () => {
    expect(canonical('  ÉLODIE—Ａnn ')).toBe('élodie ann');
  });
  it.each([null, {query:'x', references:[]}, {query:'x',references:['!!!']}, {query:'x',limit:101},
    {query:'x',userId:owner}, {query:'x',selections:[{reference:'a',personId:'bad'}]},
    {query:'x',selections:[{reference:'a',personId:me},{reference:'A',personId:uncle}]}])('rejects malformed or forged input %j', body => {
    expect(() => searchInput(body)).toThrow();
  });
});

describe('confirmed appearance search', () => {
  const make = (directory = people) => {
    const db = { query: jest.fn().mockResolvedValue({rows: []}).mockResolvedValueOnce({rows: directory}) };
    return { db, service: new PeopleSearchService(db as any) };
  };
  it('bypasses ordinary search when no identity reference exists', async () => {
    const { service, db } = make();
    expect(await service.search(owner, {query:'a red car'}, true)).toBeNull();
    expect(db.query).toHaveBeenCalledTimes(1);
  });
  it('does not retrieve appearances until every reference is resolved', async () => {
    const { service, db } = make([]);
    const result = await service.search(owner, {query:'me with my uncle'});
    expect(result?.identitySearch?.status).toBe('needs_clarification');
    expect(result?.hasExactMatch).toBe(false);
    expect(db.query).toHaveBeenCalledTimes(1);
  });
  it.each(['Dave without Amara','Dave or Amara','Dave before Amara','Dave mentioned Amara'])('does not claim unsupported semantics: %s', async query => {
    const { service, db } = make();
    expect((await service.search(owner, {query}))?.identitySearch?.status).toBe('needs_clarification');
    expect(db.query).toHaveBeenCalledTimes(1);
  });
  it('fails visibly when the bounded directory is exceeded', async () => {
    const { service, db } = make(Array(1001).fill(people[0]));
    expect((await service.search(owner,{query:'Dave'}))?.identitySearch?.status).toBe('needs_clarification');
    expect(db.query).toHaveBeenCalledTimes(1);
  });
  it('returns manual evidence without claiming a verified conversation', async () => {
    const { service, db } = make();
    db.query.mockResolvedValueOnce({rows:[{asset_id:'clip',start_s:12.25,end_s:13.75,original_filename:'fixture.mp4'},
      {asset_id:'clip2',start_s:2,end_s:3}]});
    const response = await service.search(owner,{query:'where I was talking to my uncle',assetId:'clip',limit:1});
    expect(db.query.mock.calls[1][1]).toEqual([owner,[uncle,me],'clip',2,2]);
    expect(response?.identitySearch).toMatchObject({status:'resolved',queryConditionsVerified:false,hasMore:true});
    expect(response?.results[0]).toMatchObject({startTime:12.25,endTime:13.75,stage2Verified:false,
      verificationStatus:'insufficient_evidence',matchType:'identity',playbackUrl:'/api/v1/media/clip/stream#t=12.25,13.75'});
    expect(response?.hasExactMatch).toBe(false);
    expect(response?.canContinue).toBe(false);
  });
  it('requires an authenticated owner before querying', async () => {
    const { service, db } = make();
    await expect(service.search(undefined as any,{query:'Dave'})).rejects.toThrow();
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('existing search entry point', () => {
  const make = () => {
    const service = Object.create(MediaService.prototype) as any;
    service.configService = {get: (_k: string, fallback: unknown) => fallback};
    service.peopleSearchService = {search: jest.fn()};
    service.searchWithinDeadline = jest.fn().mockResolvedValue({results:[],hasExactMatch:false,queryIntent:'mixed'});
    return service;
  };
  it.each(['retrieve','verify'])('returns identity clarification without model fallback in %s phase', async phase => {
    const service = make();
    const response = {results:[],hasExactMatch:false,queryIntent:'visual',canContinue:false,
      identitySearch:{status:'needs_clarification',references:[],evidenceScope:'manual_appearance_overlap',queryConditionsVerified:false,hasMore:false}};
    service.peopleSearchService.search.mockResolvedValue(response);
    expect(await service.searchDetailed('my uncle',undefined,15,owner,phase)).toBe(response);
    expect(service.searchWithinDeadline).not.toHaveBeenCalled();
  });
  it('preserves existing search when identity resolution does not apply', async () => {
    const service = make();
    service.peopleSearchService.search.mockResolvedValue(null);
    await service.searchDetailed('red car',undefined,15,owner);
    expect(service.searchWithinDeadline).toHaveBeenCalledTimes(1);
  });
});
