import { expect, test } from 'bun:test';
import * as path from 'node:path';

import { type QRPreset, qrEncode } from '../src/index.js';
import { Ecc, QrCode, QrSegment } from './qr.js';

const ECL = [Ecc.LOW, Ecc.MEDIUM, Ecc.HIGH, Ecc.QUARTILE];
const ECL_TO_STR = ['L', 'M', 'H', 'Q'];
const ENCODER = new TextEncoder();

function qrEncodeRef(s: string, version: number, ecl: number) {
  const c = QrCode.encodeSegments(
    [QrSegment.makeEci(26), QrSegment.makeBytes(ENCODER.encode(s))],
    ECL[ecl],
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

const CHARS: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function genString(length: number): string {
  let result: string = '';

  for (let i = 0; i < length; i++) {
    result += CHARS[i % CHARS.length];
  }

  return result;
}

const presets = path.join(import.meta.dir, '../src/presets');
for (let version = 1; version <= 40; version++) {
  for (let ecl = 0; ecl < 4; ecl++) {
    const p = path.join(presets, `${version}-${ECL_TO_STR[ecl]}.js`);
    const preset: QRPreset = (await import(p)).default;

    test(`${version}-${ECL_TO_STR[ecl]} (1)`, () => {
      const payload = genString(1);
      const a = qrEncode(preset, ENCODER.encode(payload)).map((v) => v & 1);
      const b = qrEncodeRef(payload, version, ecl);
      expect(a).toEqual(b);
    });

    test(`${version}-${ECL_TO_STR[ecl]} (2)`, () => {
      const payload = genString(1);
      const a = qrEncode(preset, ENCODER.encode(payload)).map((v) => v & 1);
      const b = qrEncodeRef(payload, version, ecl);
      expect(a).toEqual(b);
    });

    const payloadSize = preset.s;
    test(`${version}-${ECL_TO_STR[ecl]} (${payloadSize})`, () => {
      const payload = genString(payloadSize - 1);
      const a = qrEncode(preset, ENCODER.encode(payload)).map((v) => v & 1);
      const b = qrEncodeRef(payload, version, ecl);
      expect(a).toEqual(b);
    });
  }
}
