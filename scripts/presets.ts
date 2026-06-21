import * as fs from 'node:fs/promises';
import path from 'node:path';

// GF(256) logarithm and antilogarithm tables for Reed-Solomon error correction
// LOG[x+255] = log(x), LOG[antilog] = exponent
const LOG_TABLES = new Uint8Array(512);
// Build GF(256) logarithm and antilogarithm tables
for (let i = 0, v = 1; i < 255; i++) {
  LOG_TABLES[(LOG_TABLES[v + 255] = i)] = v;
  v <<= 1;
  if (v & 0x100) {
    v ^= 0x11d;
  }
}

export const exp = (x: number) => LOG_TABLES[x % 255];
export const log = (x: number) => LOG_TABLES[x + 255];

const GENERATORS = [new Uint8Array([0]), new Uint8Array([0, 0])];

// Multiply two polynomials in GF(256) using log/antilog tables
// Polynomials are stored in log form (each element is the log of the coefficient)
const mul = (p1Ln: Uint8Array, p2Ln: Uint8Array) => {
  const result = new Uint8Array(p1Ln.length + p2Ln.length - 1);
  for (let i = 0; i < p1Ln.length; ++i) {
    for (let j = 0; j < p2Ln.length; ++j) {
      // In GF(256), multiplication is addition of logs, then antilog
      result[i + j] ^= exp(p1Ln[i] + p2Ln[j]);
    }
  }
  // Convert result back to log form
  return result.map(log);
};

// Binary polynomial division for encoding format and version information
// Used to generate the 15-bit format info and 18-bit version info
// num: dividend (data bits)
// den: divisor polynomial (generator)
// denBitsMinusOne: number of bits in divisor - 1
const remBinPoly = (num: number, den: number, denBitsMinusOne: number) => {
  num <<= denBitsMinusOne;
  let r = num;
  // Perform binary polynomial long division
  for (let i = 0x8000000; (i >>= 1); ) {
    if (r & i) {
      r ^= den * (i >> denBitsMinusOne);
    }
  }
  // Return remainder ORed with original num (for format info encoding)
  return r | num;
};

// Build generator polynomials for Reed-Solomon encoding
// GENERATORS[i] is the product of (x - α^i) for i = 0 to i-1
for (let i = 1; i < 30; ++i) {
  GENERATORS.push(mul(GENERATORS[i], new Uint8Array([0, i])));
}

// const _ENCODING_MODE = {
//   Numeric: 0b0001,
//   Alphanumeric: 0b0010,
//   Byte: 0b0100,
//   Kanji: 0b1000,
//   ECI: 0b0111,
// };

// QR Code Payload length encoded as Big-Endian bitstream with variable length:
// Version [1-9], [10-26], [27-40]
// const _LENGTH_BITS = {
//   // Numeric:
//   // 10 bits for versions [1-9]
//   // 12 bits for versions [10-26]
//   // 14 bits for versions [27-40]
//   Numeric: [10, 12, 14],
//   Alphanumeric: [9, 11, 13],
//   Byte: [8, 16, 16],
//   Kanji: [8, 10, 12],
// };

const EC_TABLE = [
  [
    [7, 1],
    [10, 1],
    [13, 1],
    [17, 1],
  ],
  [
    [10, 1],
    [16, 1],
    [22, 1],
    [28, 1],
  ],
  [
    [15, 1],
    [26, 1],
    [18, 2],
    [22, 2],
  ],
  [
    [20, 1],
    [18, 2],
    [26, 2],
    [16, 4],
  ],
  [
    [26, 1],
    [24, 2],
    [18, 4],
    [22, 4],
  ],
  [
    [18, 2],
    [16, 4],
    [24, 4],
    [28, 4],
  ],
  [
    [20, 2],
    [18, 4],
    [18, 6],
    [26, 5],
  ],
  [
    [24, 2],
    [22, 4],
    [22, 6],
    [26, 6],
  ],
  [
    [30, 2],
    [22, 5],
    [20, 8],
    [24, 8],
  ],
  [
    [18, 4],
    [26, 5],
    [24, 8],
    [28, 8],
  ],
  [
    [20, 4],
    [30, 5],
    [28, 8],
    [24, 11],
  ],
  [
    [24, 4],
    [22, 8],
    [26, 10],
    [28, 11],
  ],
  [
    [26, 4],
    [22, 9],
    [24, 12],
    [22, 16],
  ],
  [
    [30, 4],
    [24, 9],
    [20, 16],
    [24, 16],
  ],
  [
    [22, 6],
    [24, 10],
    [30, 12],
    [24, 18],
  ],
  [
    [24, 6],
    [28, 10],
    [24, 17],
    [30, 16],
  ],
  [
    [28, 6],
    [28, 11],
    [28, 16],
    [28, 19],
  ],
  [
    [30, 6],
    [26, 13],
    [28, 18],
    [28, 21],
  ],
  [
    [28, 7],
    [26, 14],
    [26, 21],
    [26, 25],
  ],
  [
    [28, 8],
    [26, 16],
    [30, 20],
    [28, 25],
  ],
  [
    [28, 8],
    [26, 17],
    [28, 23],
    [30, 25],
  ],
  [
    [28, 9],
    [28, 17],
    [30, 23],
    [24, 34],
  ],
  [
    [30, 9],
    [28, 18],
    [30, 25],
    [30, 30],
  ],
  [
    [30, 10],
    [28, 20],
    [30, 27],
    [30, 32],
  ],
  [
    [26, 12],
    [28, 21],
    [30, 29],
    [30, 35],
  ],
  [
    [28, 12],
    [28, 23],
    [28, 34],
    [30, 37],
  ],
  [
    [30, 12],
    [28, 25],
    [30, 34],
    [30, 40],
  ],
  [
    [30, 13],
    [28, 26],
    [30, 35],
    [30, 42],
  ],
  [
    [30, 14],
    [28, 28],
    [30, 38],
    [30, 45],
  ],
  [
    [30, 15],
    [28, 29],
    [30, 40],
    [30, 48],
  ],
  [
    [30, 16],
    [28, 31],
    [30, 43],
    [30, 51],
  ],
  [
    [30, 17],
    [28, 33],
    [30, 45],
    [30, 54],
  ],
  [
    [30, 18],
    [28, 35],
    [30, 48],
    [30, 57],
  ],
  [
    [30, 19],
    [28, 37],
    [30, 51],
    [30, 60],
  ],
  [
    [30, 19],
    [28, 38],
    [30, 53],
    [30, 63],
  ],
  [
    [30, 20],
    [28, 40],
    [30, 56],
    [30, 66],
  ],
  [
    [30, 21],
    [28, 43],
    [30, 59],
    [30, 70],
  ],
  [
    [30, 22],
    [28, 45],
    [30, 62],
    [30, 74],
  ],
  [
    [30, 24],
    [28, 47],
    [30, 65],
    [30, 77],
  ],
  [
    [30, 25],
    [28, 49],
    [30, 68],
    [30, 81],
  ],
];

// Used to filter out unused generator polynomials
const GENERATOR_DEGREES = new Set<number>();
for (const v of EC_TABLE) {
  for (const [d, _] of v) {
    GENERATOR_DEGREES.add(d);
  }
}

const G1_COUNT = [
  [
    1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 4, 2, 4, 3, 5, 5, 1, 5, 3, 3, 4, 2, 4, 6, 8, 10, 8, 3, 7, 5, 13,
    17, 17, 13, 12, 6, 17, 4, 20, 19,
  ],
  [
    1, 1, 1, 2, 2, 4, 4, 2, 3, 4, 1, 6, 8, 4, 5, 7, 10, 9, 3, 3, 17, 17, 4, 6, 8, 19, 22, 3, 21, 19,
    2, 10, 14, 14, 12, 6, 29, 13, 40, 18,
  ],
  [
    1, 1, 2, 2, 2, 4, 2, 4, 4, 6, 4, 4, 8, 11, 5, 15, 1, 17, 17, 15, 17, 7, 11, 11, 7, 28, 8, 4, 1,
    15, 42, 10, 29, 44, 39, 46, 49, 48, 43, 34,
  ],
  [
    1, 1, 2, 4, 2, 4, 4, 4, 4, 6, 3, 7, 12, 11, 11, 3, 2, 2, 9, 15, 19, 34, 16, 30, 22, 33, 12, 11,
    19, 23, 23, 19, 11, 59, 22, 2, 24, 42, 10, 20,
  ],
];

const G1_SIZE = [
  [
    19, 34, 55, 80, 108, 68, 78, 97, 116, 68, 81, 92, 107, 115, 87, 98, 107, 120, 113, 107, 116,
    111, 121, 117, 106, 114, 122, 117, 116, 115, 115, 115, 115, 115, 121, 121, 122, 122, 117, 118,
  ],
  [
    16, 28, 44, 32, 43, 27, 31, 38, 36, 43, 50, 36, 37, 40, 41, 45, 46, 43, 44, 41, 42, 46, 47, 45,
    47, 46, 45, 45, 45, 47, 46, 46, 46, 46, 47, 47, 46, 46, 47, 47,
  ],
  [
    13, 22, 17, 24, 15, 19, 14, 18, 16, 19, 22, 20, 20, 16, 24, 19, 22, 22, 21, 24, 22, 24, 24, 24,
    24, 22, 23, 24, 23, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24,
  ],
  [
    9, 16, 13, 9, 11, 15, 13, 14, 12, 15, 12, 14, 11, 12, 12, 15, 14, 14, 13, 15, 16, 13, 15, 16,
    15, 16, 15, 15, 15, 15, 15, 15, 15, 16, 15, 15, 15, 15, 15, 15,
  ],
];

const G2_COUNT = [
  [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 1, 1, 1, 5, 1, 4, 5, 4, 7, 5, 4, 4, 2, 4, 10, 7, 10, 3,
    0, 1, 6, 7, 14, 4, 18, 4, 6,
  ],
  [
    0, 0, 0, 0, 0, 0, 0, 2, 2, 1, 4, 2, 1, 5, 5, 3, 1, 4, 11, 13, 0, 0, 14, 14, 13, 4, 3, 23, 7, 10,
    29, 23, 21, 23, 26, 34, 14, 32, 7, 31,
  ],
  [
    0, 0, 0, 0, 2, 0, 4, 2, 4, 2, 4, 6, 4, 5, 7, 2, 15, 1, 4, 5, 6, 16, 14, 16, 22, 6, 26, 31, 37,
    25, 1, 35, 19, 7, 14, 10, 10, 14, 22, 34,
  ],
  [
    0, 0, 0, 0, 2, 0, 1, 2, 4, 2, 8, 4, 4, 5, 7, 13, 17, 19, 16, 10, 6, 0, 14, 2, 13, 4, 28, 31, 26,
    25, 28, 35, 46, 1, 41, 64, 46, 32, 67, 61,
  ],
];

// Number of Data Codewords = quality[version]
const DATA_CODEWORDS = [
  [
    19, 34, 55, 80, 108, 136, 156, 194, 232, 274, 324, 370, 428, 461, 523, 589, 647, 721, 795, 861,
    932, 1006, 1094, 1174, 1276, 1370, 1468, 1531, 1631, 1735, 1843, 1955, 2071, 2191, 2306, 2434,
    2566, 2702, 2812, 2956,
  ],
  [
    16, 28, 44, 64, 86, 108, 124, 154, 182, 216, 254, 290, 334, 365, 415, 453, 507, 563, 627, 669,
    714, 782, 860, 914, 1000, 1062, 1128, 1193, 1267, 1373, 1455, 1541, 1631, 1725, 1812, 1914,
    1992, 2102, 2216, 2334,
  ],
  [
    13, 22, 34, 48, 62, 76, 88, 110, 132, 154, 180, 206, 244, 261, 295, 325, 367, 397, 445, 485,
    512, 568, 614, 664, 718, 754, 808, 871, 911, 985, 1033, 1115, 1171, 1231, 1286, 1354, 1426,
    1502, 1582, 1666,
  ],
  [
    9, 16, 26, 36, 46, 60, 66, 86, 100, 122, 140, 158, 180, 197, 223, 253, 283, 313, 341, 385, 406,
    442, 464, 514, 538, 596, 628, 661, 701, 745, 793, 845, 901, 961, 986, 1054, 1096, 1142, 1222,
    1276,
  ],
];

const MODES = ['L', 'M', 'Q', 'H'];

const _dirname = import.meta.dirname;
const presetsDir = path.join(_dirname, '../src/presets');

{
  let s = '';
  for (let i = 0; i < GENERATORS.length; i++) {
    if (GENERATOR_DEGREES.has(i)) {
      s += `export const G${i} = [${GENERATORS[i].join(', ')}];\n`;
    }
  }
  await fs.writeFile(path.join(_dirname, '../src/const/generators.ts'), s);
}

for (let i = 0; i < 40; i++) {
  for (let m = 0; m < 4; m++) {
    const v = i + 1;
    const size = v * 4 + 17;
    const modeName = MODES[m];
    const presetName = `preset_${v}_${modeName}`;
    const fileName = `${v}-${modeName}.ts`;
    const filePath = path.join(presetsDir, fileName);
    const dataCodewords = DATA_CODEWORDS[m][i];
    const ec = EC_TABLE[i][m];
    let s = `import type { QRPreset } from '../index.js';\n`;
    s += `import * as g from '../const/generators.js';\n`;
    s += `import a from '../const/alignment/${v}.js';\n\n`;
    s += `const ${presetName}: QRPreset = {\n`;
    s += `  c: null,\n`;
    s += `  s: ${v < 10 ? dataCodewords - 3 : dataCodewords - 4},\n`;
    s += `  v: ${v},\n`;
    s += `  gs: ${size},\n`;
    s += `  ds: ${dataCodewords},\n`;
    s += `  ts: ${G1_COUNT[m][i] * (ec[0] + G1_SIZE[m][i]) + G2_COUNT[m][i] * (ec[0] + G1_SIZE[m][i] + 1)},\n`;
    if (v > 1) {
      const patterns = [];
      // Alignment Patterns:
      // Calculate number of alignment patterns based on version
      const numAlignmentM = ((v / 7) | 0) + 1;
      // alignment boxes must always be positioned on even pixels
      // and are spaced evenly from the bottom right (except top and left which are always 6)
      // the 0.75 (1-0.25) avoids a quirk in the spec for version 32
      const stepAlignment = (((size - 13) / numAlignmentM / 2 + 0.75) | 0) * 2;
      // Draw alignment patterns in the lower-right region
      for (let i = size - 7; i > 8; i -= stepAlignment) {
        for (let j = i; j > 8; j -= stepAlignment) {
          patterns.push(j * size + i);
        }
        if (i < size - 7) {
          patterns.push(6 * size + i);
        }
      }
      await fs.writeFile(
        path.join(_dirname, `../src/const/alignment/${v}.ts`),
        `const ALIGNMENT_PATTERNS_${v} = [${patterns.join(', ')}];\nexport default ALIGNMENT_PATTERNS_${v};\n`,
      );
    } else {
      await fs.writeFile(
        path.join(_dirname, `../src/const/alignment/${v}.ts`),
        `const ALIGNMENT_PATTERNS_${v}: number[] = [];\nexport default ALIGNMENT_PATTERNS_${v};\n`,
      );
    }
    s += `  a,\n`;
    // s += `  eb: ${ec[1]},\n`;
    s += `  ec: ${ec[0]},\n`;
    s += `  g: g.G${ec[0]},\n`;
    s += `  g1: ${G1_COUNT[m][i]},\n`;
    s += `  g1s: ${G1_SIZE[m][i]},\n`;
    s += `  g2: ${G2_COUNT[m][i]},\n`;
    {
      const maskId = 0;
      const info = ((m ^ 1) << 3) | maskId;
      const heeader = 0b101010000010010 ^ remBinPoly(info, 0b10100110111, 10);
      s += `  h1: ${heeader},\n`;
    }
    if (v < 7) {
      s += `  h2: null,\n`;
    } else {
      const header = remBinPoly(v, 0b1111100100101, 12);
      s += `  h2: ${header},\n`;
    }
    s += '};\n\n';
    s += `export default ${presetName};\n`;
    await fs.writeFile(filePath, s);
  }
}
