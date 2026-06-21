export function formatQRCode(matrix: Uint8Array, size: number): string[] {
  const length = matrix.length;
  const size2 = size << 1;
  const emptyLine = ' '.repeat(size + 4); // width + padding

  const result = [];
  result.push(emptyLine);

  for (let p1 = 0; p1 < length; p1 += size2) {
    const p2 = p1 + size;
    let line = '  '; // Left quiet zone padding (2 spaces)

    for (let x = 0; x < size; x++) {
      // Encode top/bottom pixels in 2bits
      let pixel = matrix[p1 + x] & 1; // Top pixel
      if (p2 < length) {
        pixel |= (matrix[p2 + x] & 1) << 1; // Bottom pixel
      }

      // Map the vertical pair to the correct half-block character
      line +=
        pixel === 0
          ? ' ' // U+0020 (Both light)
          : pixel === 1
            ? '▀' // U+2580 (Top dark)
            : pixel === 2
              ? '▄' // U+2584 (Bottom dark)
              : '█'; // U+2588 (Both dark)
    }

    line += '  '; // Right quiet zone padding (2 spaces)
    result.push(line);
  }

  result.push(emptyLine);
  return result;
}
