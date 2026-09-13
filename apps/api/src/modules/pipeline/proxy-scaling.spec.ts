import { computeAdaptiveProxyTarget } from './proxy-scaling';

describe('computeAdaptiveProxyTarget (03-media-storage-brief.md Section 3)', () => {
  it('scales 4K (2160p) and 1080p down to 720p', () => {
    expect(computeAdaptiveProxyTarget(2160)).toBe(720);
    expect(computeAdaptiveProxyTarget(1080)).toBe(720);
  });

  it('scales 720p down to 480p to achieve meaningful size savings', () => {
    expect(computeAdaptiveProxyTarget(720)).toBe(480);
  });

  it('scales 480p down to 360p', () => {
    expect(computeAdaptiveProxyTarget(480)).toBe(360);
  });

  it('never upscales 360p or 240p to 720p', () => {
    expect(computeAdaptiveProxyTarget(360)).toBe(360);
    expect(computeAdaptiveProxyTarget(240)).toBe(240);
  });

  it('defaults gracefully to 720p if height is unknown or 0', () => {
    expect(computeAdaptiveProxyTarget(undefined)).toBe(720);
    expect(computeAdaptiveProxyTarget(0)).toBe(720);
  });
});
