import { PeopleService } from './people.service';
import { PeopleController } from './people.controller';
import { appearanceInput, listInput, personInput } from './people.validation';

const owner = '11111111-1111-4111-8111-111111111111';
const person = '22222222-2222-4222-8222-222222222222';
const appearance = { assetId: 'source', start_s: 2, end_s: 5, frame_s: 3, box: [0.1, 0.1, 0.2, 0.2] };
describe('manual people grounding', () => {
  const make = () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    return { db, service: new PeopleService(db as any) };
  };
  it('normalizes names and aliases without treating relationships as unique identities', () => {
    expect(personInput({ name: ' Dave ', aliases: [' uncle ', 'uncle'] })).toEqual({ name: 'Dave', aliases: ['uncle'], isMe: false });
  });
  it.each([null, [], { name: ' ' }, { name: 'Dave', isMe: 'false' }, { name: 'Dave', aliases: [null] },
    { name: 'Dave', aliases: Array(21).fill('uncle') }, { name: 'Dave', user_id: owner }])('rejects malformed person input %j', body => {
    expect(() => personInput(body)).toThrow();
  });
  it.each([{ start_s: -1 }, { end_s: NaN }, { end_s: Infinity }, { end_s: 2 }, { frame_s: 5 },
    { box: [] }, { box: [0, 0, 0, 1] }, { box: [0.9, 0, 0.2, 1] }, { box: [0, 0, NaN, 1] }, { status: 'suggested' }])(
    'rejects invalid or client-invented appearance evidence %j', patch => {
      expect(() => appearanceInput({ ...appearance, ...patch })).toThrow();
    });
  it('accepts a bounded source range and normalized selection', () => {
    expect(appearanceInput(appearance)).toEqual(appearance);
  });
  it.each(['0', '101', '1.5', '-1', '1e2'])('rejects invalid page limit %s', limit => {
    expect(() => listInput(limit)).toThrow();
  });
  it('rejects unauthenticated and malformed identifiers before querying', async () => {
    const { db, service } = make();
    await expect(service.list(undefined as any)).rejects.toThrow();
    await expect(service.remove(owner, 'invalid')).rejects.toThrow();
    expect(db.query).not.toHaveBeenCalled();
  });
  it('does not reveal absent or other-owner identities through update/delete', async () => {
    const { db, service } = make();
    await expect(service.save(owner, { name: 'Dave' }, person)).rejects.toThrow('Person not found');
    expect(db.query.mock.calls[0][1]).toEqual([owner, person, 'Dave', [], false]);
    await expect(service.remove(owner, person)).rejects.toThrow('Person not found');
    expect(db.query.mock.calls[1][1]).toEqual([owner, person]);
  });
  it('returns a recoverable conflict for a second self identity', async () => {
    const { db, service } = make();
    db.query.mockRejectedValueOnce(Object.assign(new Error(), { code: '23505' }));
    await expect(service.save(owner, { name: 'Me', isMe: true })).rejects.toThrow('Only one person');
  });
  it('does not create an appearance if its owned source/person or valid duration is missing', async () => {
    const { db, service } = make();
    await expect(service.addAppearance(owner, person, appearance)).rejects.toThrow('Person or source not found');
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('duration >= $5');
    expect(sql).toContain('WHERE p.user_id=$1 AND p.id=$2');
    expect(params).toEqual([owner, person, 'source', 2, 5, 3, appearance.box]);
  });
  it('paginates without silently truncating the directory', async () => {
    const { db, service } = make();
    db.query.mockResolvedValueOnce({ rows: [{ id: person }, { id: owner }] });
    expect(await service.list(owner, '1')).toEqual({ items: [{ id: person }], count: 1, hasMore: true, nextAfter: person });
  });
  it('allows rejection and confirmation, but rejects invented review states', async () => {
    const { service } = make();
    const controller = new PeopleController(service, {} as any);
    const spy = jest.spyOn(service, 'review').mockResolvedValue({ status: 'rejected' });
    await controller.review({ user: { id: owner } }, person, { status: 'rejected' });
    expect(spy).toHaveBeenCalledWith(owner, person, 'rejected');
    expect(() => controller.review({ user: { id: owner } }, person, { status: 'suggested' })).toThrow();
    expect(() => controller.review({ user: { id: owner } }, person, { status: 'confirmed', user_id: owner })).toThrow();
  });
});
