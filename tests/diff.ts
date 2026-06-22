// Checks differences between reference nayuki implementation and liteqr

import type { QRPreset } from '../src/index.js';
import { formatQRCode } from '../src/format.js';
import { qrEncode } from '../src/index.js';
import { Ecc, QrCode, QrSegment } from './qr.js';

const ENCODER = new TextEncoder();

const ECL = [Ecc.LOW, Ecc.MEDIUM, Ecc.HIGH, Ecc.QUARTILE];
const ECL_TO_STR = ['L', 'M', 'H', 'Q'];

function qr(s: string, version: number, ecc: number) {
  const c = QrCode.encodeSegments(
    [QrSegment.makeEci(26), QrSegment.makeBytes(ENCODER.encode(s))],
    ECL[ecc],
    version,
    version,
    0,
    false,
  );
  const size = c.size;
  const b = new Uint8Array(size ** 2);
  let p = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      b[p++] = c.getModule(x, y) ? 1 : 0;
    }
  }
  return b;
}

const v = 5;
const ecl = 3;
const size = (v << 2) + 17; // version * 4 + 17
const a = qr('abcdef', v, ecl);
console.log(formatQRCode(a, size).join('\n'));

const preset: QRPreset = (
  await import(`${import.meta.dirname}/../src/presets/${v}-${ECL_TO_STR[ecl]}.js`)
).default;
const b = qrEncode(preset, new TextEncoder().encode('abcdef'));
console.log(formatQRCode(b, preset.gs).join('\n'));

const diff = new Uint8Array(preset.gs ** 2);
for (let x = 0; x < size; x++) {
  for (let y = 0; y < size; y++) {
    const p = y * size + x;
    if (a[p] !== (b[p] & 1)) {
      console.log(x, y, a[p], b[p]);
      diff[p] = 1;
    }
  }
}

console.log(formatQRCode(diff, preset.gs).join('\n'));
