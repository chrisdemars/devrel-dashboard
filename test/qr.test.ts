import { describe, expect, test } from 'vitest';
import { qrSvg } from '../src/lib/qr';

const LINK = 'https://example.com/cli?utm_source=devconf-2026&utm_medium=conference&utm_campaign=devconf-2026&utm_content=qr';

describe('qrSvg', () => {
  test('returns an SVG document', async () => {
    const svg = await qrSvg(LINK);
    expect(svg.trimStart().startsWith('<svg')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('<path');
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
  });

  test('is the same for the same link and different for another', async () => {
    expect(await qrSvg(LINK)).toBe(await qrSvg(LINK));
    expect(await qrSvg(LINK)).not.toBe(await qrSvg(LINK.replace('devconf-2026', 'devconf-2027')));
  });

  test('a higher error correction level changes the code', async () => {
    expect(await qrSvg(LINK, { errorCorrection: 'H' })).not.toBe(await qrSvg(LINK));
  });

  test('the margin adds blank modules around the code', async () => {
    const size = (svg: string) => Number(/viewBox="0 0 (\d+)/.exec(svg)?.[1]);
    expect(size(await qrSvg(LINK, { margin: 6 })) - size(await qrSvg(LINK))).toBe(4);
  });

  test('empty text is an error', async () => {
    await expect(qrSvg('')).rejects.toThrow('A QR code needs some text to encode.');
  });
});
