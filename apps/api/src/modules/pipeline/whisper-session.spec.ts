import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { WhisperTranscriptionService, WhisperSession } from './whisper-transcription.service';

describe('persistent local Whisper protocol', () => {
  let root: string;
  let session: WhisperSession;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'brisky-whisper-protocol-'));
    for (const file of ['first.wav', 'second.wav', 'hang.wav', 'bad.wav']) fs.writeFileSync(path.join(root, file), 'protocol fixture');
    const service = new WhisperTranscriptionService(new ConfigService());
    jest.spyOn(service, 'getPythonBinary').mockReturnValue(process.execPath);
    jest.spyOn(service, 'getScriptPath').mockReturnValue(path.join(__dirname, 'fixtures', 'whisper-session.cjs'));
    session = service.createSession();
  });
  afterEach(async () => { await session.close(); fs.rmSync(root, { recursive: true, force: true }); });
  it('reuses one actual child process for multiple window requests', async () => {
    const first = await session.transcribeAudio(path.join(root, 'first.wav'));
    const second = await session.transcribeAudio(path.join(root, 'second.wav'));
    expect(first.usage.model).toBe(second.usage.model);
    expect(first.transcript[0].text).toBe('first.wav');
    expect(second.transcript[0].text).toBe('second.wav');
  });
  it('terminates an aborted window and prevents silent replay', async () => {
    const controller = new AbortController();
    const request = session.transcribeAudio(path.join(root, 'hang.wav'), controller.signal);
    controller.abort();
    await expect(request).rejects.toThrow('cancelled');
    await expect(session.transcribeAudio(path.join(root, 'first.wav'))).rejects.toThrow('closed');
  });
  it('rejects unexpected protocol output instead of creating empty successful transcripts', async () => {
    await expect(session.transcribeAudio(path.join(root, 'bad.wav'))).rejects.toThrow('invalid response');
  });
});
