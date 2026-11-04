// Local synthetic footage only. No Docker, network, media uploads or model calls.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { Readable } = require('node:stream');
const api = path.resolve(__dirname, '../apps/api');
const load = (name) => require(require.resolve(name, { paths: [api] }));
load('ts-node').register({ project: path.join(api, 'tsconfig.json'), transpileOnly: true });
load('reflect-metadata');
const { ConfigService } = load('@nestjs/config');
const { FfmpegService } = require(path.join(api, 'src/modules/ffmpeg/ffmpeg.service'));
const { FfmpegPipelineService } = require(path.join(api, 'src/modules/pipeline/ffmpeg-pipeline.service'));
const { openSeekableMediaSource } = require(path.join(api, 'src/modules/pipeline/seekable-media-source'));
const binary = load('@ffmpeg-installer/ffmpeg').path;
const probe = load('@ffprobe-installer/ffprobe').path;
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'brisky-clip-timing-'));
const run = (args) => execFileSync(binary, ['-hide_banner', '-loglevel', 'error', ...args],
  { timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
async function main() {
  try {
    const config = new ConfigService();
    const pipeline = new FfmpegPipelineService(new FfmpegService(config), config);
    for (const faststart of [false, true]) {
      const source = path.join(directory, `source-${faststart}.mp4`);
      const clip = path.join(directory, `clip-${faststart}.mp4`);
      // VBR encoding and a GOP longer than the requested clip; blue occupies seconds 2–4.
      run(['-f', 'lavfi', '-i', 'color=red:s=160x90:r=10:d=2',
        '-f', 'lavfi', '-i', 'color=blue:s=160x90:r=10:d=2',
        '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=10:duration=120',
        '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000:duration=124',
        '-filter_complex', '[2:v]scale=160:90[v2];[0:v][1:v][v2]concat=n=3:v=1:a=0,format=yuv420p[v]',
        '-map', '[v]', '-map', '3:a', '-c:a', 'aac', '-c:v', 'libx264', '-crf', '23', '-g', '60', '-sc_threshold', '0',
        ...(faststart ? ['-movflags', '+faststart'] : []), source]);
      await pipeline.extractClip(source, clip, 2.2, 3.2);
      const pixels = run(['-i', clip, '-vf', 'scale=1:1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1']);
      assert.equal(pixels.length, 30, 'one-second clip must have ten decoded frames');
      for (let i = 0; i < pixels.length; i += 3) {
        assert.ok(pixels[i + 2] > 150 && pixels[i] < 50 && pixels[i + 1] < 50,
          `requested blue interval contains a wrong-color frame (faststart=${faststart})`);
      }
      const metadata = JSON.parse(execFileSync(probe, ['-v', 'error', '-show_format', '-of', 'json', clip], { timeout: 10000 }));
      assert.ok(Math.abs(Number(metadata.format.duration) - 1) < 0.15);
      const size = fs.statSync(source).size;
      let readCount = 0;
      const reader = await openSeekableMediaSource({ size, version: 'synthetic-v1',
        read: async (start, length) => {
          readCount++;
          await new Promise((resolve) => setTimeout(resolve, 5));
          return { status: 206, contentRange: `bytes ${start}-${start + length - 1}/${size}`,
            stream: fs.createReadStream(source, { start, end: start + length - 1 }) };
        }, validate: async () => { assert.equal(fs.statSync(source).size, size); },
      }, { maxBytes: size * 8, blockBytes: 4096, maxReads: 1024 });
      try {
        const streamedClip = path.join(directory, `range-clip-${faststart}.mp4`);
        await pipeline.extractClip(reader.url, streamedClip, 2.2, 3.2);
        await reader.validate();
        const streamedPixels = run(['-i', streamedClip, '-vf', 'scale=1:1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1']);
        assert.deepEqual(streamedPixels, pixels, 'range-decoded interval must match local-original decoding');
        assert.ok(readCount > 0);
        assert.ok(reader.bytesRead < size, 'selected-interval decoding must finish before the entire large fixture is transferred');
        console.log(`Range fixture faststart=${faststart}: ${reader.bytesRead} transferred bytes, ${size} source bytes, ${readCount} bounded reads.`);
        const streamedAudio = path.join(directory, `range-audio-${faststart}.wav`);
        assert.equal(await pipeline.extractAudio(reader.url, streamedAudio), true);
        await reader.validate();
        const audioMeta = JSON.parse(execFileSync(probe, ['-v', 'error', '-show_format', '-of', 'json', streamedAudio], { timeout: 10000 }));
        assert.ok(Math.abs(Number(audioMeta.format.duration) - 124) < 0.5, 'streamed audio must cover the original timeline');
        const windowAudio = path.join(directory, `audio-window-${faststart}.wav`);
        await pipeline.extractAudioWindow(reader.url, windowAudio, 2.2, 3.2);
        const windowMeta = JSON.parse(execFileSync(probe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', windowAudio], { timeout: 10000 }));
        assert.ok(Math.abs(Number(windowMeta.format.duration) - 1) < 0.02);
        assert.equal(windowMeta.streams[0].codec_name, 'pcm_s16le');
        assert.equal(Number(windowMeta.streams[0].sample_rate), 16000);
      } finally { await reader.close(); }
    }
    const shortSource = path.join(directory, 'scene-source.mp4');
    run(['-i', path.join(directory, 'source-false.mp4'), '-t', '6', '-c', 'copy', shortSource]);
    const shortSize = fs.statSync(shortSource).size;
    const sceneReader = await openSeekableMediaSource({ size: shortSize, version: 'scene-v1',
      read: async (start, length) => ({ status: 206, contentRange: `bytes ${start}-${start + length - 1}/${shortSize}`,
        stream: fs.createReadStream(shortSource, { start, end: start + length - 1 }) }), validate: async () => {},
    }, { maxBytes: 32 * 1024 * 1024, blockBytes: 4096, maxReads: 4096 });
    try {
      const localScenes = await pipeline.detectScenesAndExtractFrames(shortSource, 6, path.join(directory, 'local-scenes'));
      const streamedScenes = await pipeline.detectScenesAndExtractFrames(sceneReader.url, 6, path.join(directory, 'range-scenes'));
      await sceneReader.validate();
      const timeline = (scenes) => scenes.map((scene) => [scene.startTime, scene.endTime, scene.keyframes.map((frame) => frame.timestamp)]);
      assert.deepEqual(timeline(streamedScenes), timeline(localScenes), 'streamed scene boundaries/timestamps must match local decoding');
      assert.ok(streamedScenes.length > 0);
      const localWindow = await pipeline.detectScenesAndExtractFrames(shortSource, 3, path.join(directory, 'local-window'), undefined, 2);
      const remoteWindow = await pipeline.detectScenesAndExtractFrames(sceneReader.url, 3, path.join(directory, 'range-window'), undefined, 2);
      assert.deepEqual(timeline(remoteWindow), timeline(localWindow), 'bounded decoding must retain original source timestamps');
      assert.ok(remoteWindow.every((scene) => scene.startTime >= 2 && scene.endTime <= 5));
      for (const scene of remoteWindow) for (const frame of scene.keyframes) {
        const originalFrame = path.join(directory, `original-${frame.timestamp}.jpg`);
        await pipeline.extractFrame(shortSource, originalFrame, frame.timestamp, '640x?');
        assert.deepEqual(fs.readFileSync(frame.path), fs.readFileSync(originalFrame), 'window frame must match that timestamp in the original');
      }
      const bridge = await pipeline.extractSceneContext(sceneReader.url, 1, 3, path.join(directory, 'bridge'), 9999);
      assert.ok(bridge.keyframes.some((frame) => frame.timestamp < 2) && bridge.keyframes.some((frame) => frame.timestamp > 2));
      for (let i = 0; i < localScenes.length; i++) for (let j = 0; j < localScenes[i].keyframes.length; j++) {
        assert.deepEqual(fs.readFileSync(streamedScenes[i].keyframes[j].path), fs.readFileSync(localScenes[i].keyframes[j].path));
      }
    } finally { await sceneReader.close(); }
    const invalid = Buffer.from('this is not a video container');
    const invalidReader = await openSeekableMediaSource({ size: invalid.length, version: 'invalid-fixture',
      read: async (start, length) => ({ status: 206, contentRange: `bytes ${start}-${start + length - 1}/${invalid.length}`,
        stream: Readable.from([invalid.subarray(start, start + length)]) }), validate: async () => {},
    }, { maxBytes: 1024 * 1024 });
    try {
      await assert.rejects(pipeline.detectScenesAndExtractFrames(invalidReader.url, 6, path.join(directory, 'invalid-scenes')),
        /Streamed scene detection did not complete/);
    } finally { await invalidReader.close(); }
    console.log('PASS: local/range-backed video extraction agrees; streamed audio covers the source timeline, for both MP4 metadata placements.');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
