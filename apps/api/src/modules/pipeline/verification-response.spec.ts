import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GoogleAiProvider } from './providers/google-ai.provider';

describe('verification response validation', () => {
  let root: string;
  let service: any;
  let frames: any[];
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'brisky-response-'));
    const file = path.join(root, 'frame.jpg');
    fs.writeFileSync(file, 'test frame');
    frames = [{ timestamp: 5, path: file }];
    service = Object.create(GoogleAiProvider.prototype);
    service.isConfigured = () => true;
    service.logger = { warn: jest.fn() };
    service.usageFromGenerate = () => ({});
    service.generateContent = jest.fn();
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
  it.each([
    { matched: 'false', confidence: 0.9, explanation: 'Invalid boolean' },
    { matched: true, confidence: 2, explanation: 'Invalid confidence' },
    { matched: true, confidence: 0.9, explanation: 'Invented timestamp', matchedTimestamp: 7 },
    { matched: true, confidence: 0.9 },
  ])('rejects malformed output: %j', async (response) => {
    service.generateContent.mockResolvedValue({ text: JSON.stringify(response) });
    expect(await service.verifyCandidate(frames, 'bottle')).toMatchObject({ status: 'error', matched: false });
  });
  it('accepts a typed match grounded at a supplied frame', async () => {
    service.generateContent.mockResolvedValue({ text: JSON.stringify({ matched: true, confidence: 0.9, explanation: 'Bottle visible', matchedTimestamp: 5 }) });
    expect(await service.verifyCandidate(frames, 'bottle')).toMatchObject({ status: 'evaluated', matched: true, matchedTimestamp: 5 });
  });
  it('separates missing evidence from a completed negative observation', async () => {
    expect(await service.verifyCandidate([], 'bottle')).toMatchObject({ status: 'insufficient_evidence' });
    expect(service.generateContent).not.toHaveBeenCalled();
  });
  it('converts clip-relative timestamps to source coordinates', async () => {
    service.withUploadedFile = jest.fn().mockResolvedValue({ text: JSON.stringify({
      matched: true, confidence: 0.9, explanation: 'Correct action order', matchedTimestamp: 4,
    }), usage: {} });
    expect(await service.verifyClip(frames[0].path, 'before', 100, 110)).toMatchObject({
      status: 'evaluated', matchedTimestamp: 104,
    });
  });
  it('rejects clip timestamps outside the actual inspected interval', async () => {
    service.withUploadedFile = jest.fn().mockResolvedValue({ text: JSON.stringify({
      matched: true, confidence: 0.9, explanation: 'Invalid timestamp', matchedTimestamp: 15,
    }), usage: {} });
    expect(await service.verifyClip(frames[0].path, 'before', 100, 110)).toMatchObject({ status: 'error' });
  });
});
