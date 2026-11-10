// QR codes as SVG, so they stay sharp at any size on a slide or in print.

import QRCode from 'qrcode';

export interface QrOptions {
  /**
   * How much damage the code survives: M (15%), Q (25%) or H (30%). A higher
   * level makes a denser code. L is left out because it fails too easily when
   * a slide is photographed from the back of a room.
   */
  errorCorrection?: 'M' | 'Q' | 'H';
  /** Blank modules around the code. Scanners expect at least 4. */
  margin?: number;
}

/** An SVG document with a QR code for `text`: dark modules on a white background. */
export async function qrSvg(text: string, options: QrOptions = {}): Promise<string> {
  if (!text) throw new Error('A QR code needs some text to encode.');
  return QRCode.toString(text, {
    type: 'svg',
    errorCorrectionLevel: options.errorCorrection ?? 'M',
    margin: options.margin ?? 4,
  });
}
