# liteqr

Fast and Compact QR Code Encoder / Generator.

## Why Another Library?

There are already a lot of different QR Code libraries, but this one is specifically optimized for generating QR Codes on web-sites/PWAs directly in a browser (canvas) with a primary focus on reduced code size (~1.4KB).

## Features

- **Compact**: ~1.4KB minified, zero dependencies.
- **Fast**: pre-computed presets, cached functional patterns.
- **Presets**: 40 versions and 4 error correction levels (L, M, Q, H).
- **Fully Tested**: Identical output to the reference [nayuki](https://github.com/nayuki/QR-Code-generator/) implementation. 

## Install

```sh
npm install liteqr
```

## Usage

```ts
import { qrEncode } from 'liteqr';
import QR_2_L from 'liteqr/presets/2-L';

const text = new TextEncoder().encode('hello');
// Check if the current preset has enough space to store text
if (QR_2_L.s < text.length) {
  throw Error('Not enough space');
}
const matrix = qrEncode(QR_2_L, text);

const size = QR_2_L.gs; // grid size (e.g. 25 for version 2)
const scale = 10; // pixels per module

const canvas = document.createElement('canvas');
canvas.width = size * scale;
canvas.height = size * scale;
const ctx = canvas.getContext('2d');

let p = 0;
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    if (matrix[p++] & 1) {
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
}
document.body.appendChild(canvas);
```

## Presets

Each preset contains pre-computed data for a specific QR Code version and error correction level:

```
liteqr/presets/{version}-{level}
```

- **version**: 1-40
- **level**: L (Low), M (Medium), Q (Quartile), H (High)

### Payload Capacity

| Version | L    | M    | Q    | H    |
| ------- | ---- | ---- | ---- | ---- |
| 1       | 16   | 13   | 10   | 6    |
| 2       | 31   | 25   | 19   | 13   |
| 3       | 52   | 41   | 31   | 23   |
| 4       | 77   | 61   | 45   | 33   |
| 5       | 105  | 83   | 59   | 43   |
| 6       | 133  | 105  | 73   | 57   |
| 7       | 153  | 121  | 85   | 63   |
| 8       | 191  | 151  | 107  | 83   |
| 9       | 229  | 179  | 129  | 97   |
| 10      | 270  | 212  | 150  | 118  |
| 11      | 320  | 250  | 176  | 136  |
| 12      | 366  | 286  | 202  | 154  |
| 13      | 424  | 330  | 240  | 176  |
| 14      | 457  | 361  | 257  | 193  |
| 15      | 519  | 411  | 291  | 219  |
| 16      | 585  | 449  | 321  | 249  |
| 17      | 643  | 503  | 363  | 279  |
| 18      | 717  | 559  | 393  | 309  |
| 19      | 791  | 623  | 441  | 337  |
| 20      | 857  | 665  | 481  | 381  |
| 21      | 928  | 710  | 508  | 402  |
| 22      | 1002 | 778  | 564  | 438  |
| 23      | 1090 | 856  | 610  | 460  |
| 24      | 1170 | 910  | 660  | 510  |
| 25      | 1272 | 996  | 714  | 534  |
| 26      | 1366 | 1058 | 750  | 592  |
| 27      | 1464 | 1124 | 804  | 624  |
| 28      | 1527 | 1189 | 867  | 657  |
| 29      | 1627 | 1263 | 907  | 697  |
| 30      | 1731 | 1369 | 981  | 741  |
| 31      | 1839 | 1451 | 1029 | 789  |
| 32      | 1951 | 1537 | 1111 | 841  |
| 33      | 2067 | 1627 | 1167 | 897  |
| 34      | 2187 | 1721 | 1227 | 957  |
| 35      | 2302 | 1808 | 1282 | 982  |
| 36      | 2430 | 1910 | 1350 | 1050 |
| 37      | 2562 | 1988 | 1422 | 1092 |
| 38      | 2698 | 2098 | 1498 | 1138 |
| 39      | 2808 | 2212 | 1578 | 1218 |
| 40      | 2952 | 2330 | 1662 | 1272 |

## Design Trade-offs

### ECI/UTF-8 Only

liteqr encodes all payloads as ECI (designator 26 = UTF-8) byte-mode segments. This makes the payload bit-stream byte-aligned and simplifies the encoder. For most real-world use cases (international text, URLs with mixed characters) this is a net win.

### Pre-computed Presets

Each version + error-correction-level combination is shipped as a separate preset module (`liteqr/presets/{version}-{level}`). A preset contains grid size, payload size, generator polynomial, headers, alignment pattern positions, etc. The downside is that you must manually select a version with enough capacity for your payload — the library won't automatically choose the smallest version that fits. The upside is that since you explicitly control which version is used, you know the exact grid size and pixel dimensions upfront, which allows you to render onto a canvas without any aliasing or rounding artifacts.

### Mask Pattern 0

Only mask pattern 0 (`(x + y) % 2 === 0`) is supported. The QR specification defines 8 patterns and recommends selecting the one that minimizes errors. Since this library is optimized for web-site rendering, QR codes will be displayed on good screens with clean rendering, making the difference between mask patterns negligible in practice.

## License

MIT OR Apache-2.0
