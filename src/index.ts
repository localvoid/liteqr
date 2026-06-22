export interface QRPreset {
  /** Cached Functional Patterns + Data Path */
  c: Uint8Array | null;

  /** Maximum Payload Size */
  readonly s: number;
  /** Version Number */
  readonly v: number;

  /** Grid Size */
  readonly gs: number;

  /** Data Codewords Size */
  readonly ds: number;
  /** Total Data Codewords+ECC Codewords Size */
  readonly ts: number;

  /** Error Correction Codewords Per Block */
  readonly ec: number;
  /** Generator Polynomial */
  readonly g: number[];

  // Short Blocks
  readonly g1: number;
  readonly g1s: number;
  // Long Blocks
  readonly g2: number;

  /**
   * ECL and Mask Header (15-Bit BCH Code):
   * Contains 2 bits specifying the Reed-Solomon error correction
   * level (L, M, Q, H) and 3 bits specifying which of the 8 grid mask
   * patterns was applied.
   *
   *     ┌───────────────── 15 Bits Total ─────────────────┐
   *     │  5 Bits: Payload      │   10 Bits: Checksum     │
   *     │  [2: ECL] + [3: Mask] │   (Error Correction)    │
   *     └───────────────────────┴─────────────────────────┘
   */
  readonly h1: number;
  /**
   * Version Header (18-bit BCH Code):
   * Encodes the size version, ranging from Version 7 up to Version 40.
   *
   * Smaller grids (Versions 1 through 6) do not use this header. Scanners
   * simply calculate their size by counting the row/column layout.
   *
   *     ┌────────────────── 18 Bits Total ──────────────────┐
   *     │   6 Bits: Payload     │    12 Bits: Checksum      │
   *     │   (Version Number)    │    (Error Correction)     │
   *     └───────────────────────┴───────────────────────────┘
   */
  readonly h2: number | null;
  /** Alignment Patterns */
  readonly a: number[];
}

// GF(256) logarithm and antilogarithm tables for Reed-Solomon error correction
// e(x) => LOG[x % 255]
// ln(x) => LOG[x + 255]
const LOG_TABLES = new Uint8Array(512);

// Generates a Uint8Array with a QR code matrix (size x size)
export const qrEncode = (preset: QRPreset, payload: Uint8Array): Uint8Array => {
  if (preset.c === null) {
    addFunctionalPatterns((preset.c = new Uint8Array(preset.gs ** 2)), preset);
  }
  // Final result matrix
  const result = preset.c.slice();
  const gridSize = preset.gs;
  const g1 = preset.g1;
  const g1s = preset.g1s;
  const blocksCount = g1 + preset.g2;
  const ecSize = preset.ec;
  // Generator polynomial for ECC
  const gen = preset.g;
  const dataSize = preset.ds;
  // Payload Header + Payload + Finalizer + Alternating Padding
  const data = new Uint8Array(dataSize);
  // Final Interleaved Payload
  const out = new Uint8Array(preset.ts);
  let s = preset.g1s;
  let i = payload.length;
  let j;
  let k;
  let p;

  // ECI Indicator (0111)
  // UTF-8 Designator (00011010)
  // Byte Mode Indicator (0100)
  data[0] = 0b01110001;
  data[1] = 0b10100100;
  if (preset.v < 10) {
    data[2] = i;
    p = 3;
  } else {
    data[2] = i >> 8;
    data[3] = i;
    p = 4;
  }
  data.set(payload, p);
  p += i;

  // Pad with alternating bytes 0xEC and 0x11 to fill remaining capacity
  k = 0x11;
  // ++p — advance cursor to add terminator zeros
  while (++p < dataSize) {
    // 0x11 ^ 0xEC = 253
    data[p] = k ^= 253;
  }

  // Reed-Solomon ECC
  p = 0;
  const ecc = new Uint8Array(s + ecSize + 1);
  for (i = 0; i < blocksCount; i++) {
    if (i === g1) s++;
    const block = data.subarray(p, (p += s));
    ecc.set(block, 0);
    ecc.fill(0, s);
    for (j = 0; j < s; j++) {
      if (ecc[j]) {
        // Get the log of the leading coefficient
        // GF(256) logarithm: returns the exponent such that 2^log(x) = x
        const shift = LOG_TABLES[ecc[j] + 255];
        // XOR with the generator polynomial scaled by the leading coefficient
        for (k = 0; k < gen.length; k++) {
          // GF(256) antilogarithm: returns 2^x mod 0x11d (the irreducible polynomial)
          ecc[j + k] ^= LOG_TABLES[(gen[k] + shift) % 255];
        }
      }
    }

    // Interleave data and EC blocks
    k = i;
    for (j = 0; j < s; j++) {
      if (j === g1s) k -= g1;
      out[k] = block[j];
      k += blocksCount;
    }

    k = dataSize + i;
    for (j = s; j < s + ecSize; j++) {
      out[k] = ecc[j];
      k += blocksCount;
    }
  }

  // Place masked data on a matrix
  let x = gridSize - 2;
  let y = gridSize;
  i = 0; // Data byte offset
  s = 7; // Bit offset

  for (let yDir = -1; x >= 0; x -= 2) {
    // skip the vertical timing pattern at column 6
    if (x === 5) x = 4;

    while (((y += yDir), y >= 0 && y < gridSize)) {
      p = y * gridSize + x;
      // right → left column order
      for (j = 1; j >= 0; j--) {
        k = p + j;
        if (result[k] === 0) {
          if (i < out.length) {
            result[k] = (out[i] >> s) & 1;
            if (--s < 0) {
              s = 7;
              i++;
            }
          }
          if ((x + j + y) % 2 === 0) {
            result[k] ^= 1;
          }
        }
      }
    }
    yDir = -yDir; // reverse direction
  }

  return result;
};

// Add functional patterns:
// - Finders
// - Alignments
// - Timings
// - Version information
// - Format information
const addFunctionalPatterns = (data: Uint8Array, preset: QRPreset) => {
  // When log tables are ready, `LOG_TABLES[0]` should be `1`
  if (!LOG_TABLES[0]) {
    // Initialize GF(256) logarithm and antilogarithm tables
    for (let i = 0, v = 1; i < 255; i++) {
      LOG_TABLES[(LOG_TABLES[v + 255] = i)] = v;
      v <<= 1;
      if (v & 0x100) v ^= 0x11d;
    }
  }

  const size = preset.gs;

  // Fill a rectangular region in the QR code matrix
  // data: the QR code matrix (1D array representing 2D grid)
  // size: width/height of the QR code
  // p: starting position (row * size + col)
  // w, h: width and height of rectangle
  // value: value to fill (0=white, 1=black, 2=reserved for patterns, 3=reserved for timing)
  const rect = (p: number, w: number, h: number, value: number) => {
    for (; h-- > 0; p += size) {
      data.fill(value, p, p + w);
    }
  };

  // Draw an alignment pattern (concentric squares: black-white-black)
  // These help the QR reader correct for perspective distortion
  // x, y: center coordinates
  // diameter: outer diameter (typically 5 or 7)
  const alignment = (p: number, diameter: number) => {
    // Draw 3 concentric squares, each 2 pixels smaller
    for (let i = 0; i++ < 3; diameter -= 2) {
      rect(p - (diameter >> 1) * (size + 1), diameter, diameter, i | 2);
    }
  };

  let h1 = preset.h1;
  let v = preset.h2;
  let p1 = 8;
  let p2 = 9 * size;
  let i;
  let j;

  // Alignment Patterns
  for (i of preset.a) {
    alignment(i, 5);
  }

  // Version information (18-bit BCH code)
  if (v !== null) {
    for (j = size; j < 7 * size; j += size) {
      for (i = 12; i-- > 9; v >>= 1) {
        data[j - i] = 2 | (v & 1);
      }
    }
  }
  // Draw finder patterns (the three large squares in corners)
  // Top-left and bottom-left finder pattern separators
  rect(7, 1, 8, 2);
  // Top-right and bottom-right finder pattern separators
  rect(size - 8, 8, 8, 2);
  // Horizontal timing pattern (alternating black/white modules)
  j = 7 * size;
  for (i = j - size; i < j; i++) {
    data[i] = 3 ^ (i & 1);
  }
  // Draw alignment patterns at fixed positions (top-left and top-right)
  alignment(3 * size + 3, 7);
  alignment(4 * size - 4, 7);
  // Mirror the frame to complete the finder patterns on the other side
  for (j = 0; j < size; j++) {
    for (i = j; i < size; i++) {
      data[i * size + j] = data[j * size + i];
    }
  }
  // Dark module (always black)
  data[(size - 8) * size + 8] = 3;

  // Format Information Area (15-bit BCH code):
  // Write format information to the QR code (two copies for error correction)
  // First copy: around top-left finder pattern
  // 8 bits
  for (i = 0; i < 8; i++) {
    if (i === 6) p1 += size;
    v = (h1 & 1) | 2;
    h1 >>= 1;
    data[p1] = v; // top-left
    data[--p2] = v; // top-right
    p1 += size;
  }
  // 7 bits
  // Second copy: along bottom and right edges
  p1 = 8 * size + 7;
  p2 = size * size - 8 * size + 8;
  for (i = 0; i < 7; i++) {
    if (i === 1) p1--;
    v = (h1 & 1) | 2;
    h1 >>= 1;
    data[p1--] = v; // top-left
    data[(p2 += size)] = v; // bottom-left
  }
};
