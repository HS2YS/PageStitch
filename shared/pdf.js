const encoder = new TextEncoder();

function ascii(value) {
  return encoder.encode(value);
}

function padOffset(value) {
  return String(value).padStart(10, "0");
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function streamObject(dictionary, bytes) {
  return [
    ascii(`${dictionary.replace(/>>$/, "")} /Length ${bytes.length} >>\nstream\n`),
    bytes,
    ascii("\nendstream")
  ];
}

export function buildPdfFromJpegs(pages, options) {
  if (!pages.length) throw new Error("At least one PDF page is required.");
  const pageWidth = Number(options.pageWidth);
  const pageHeight = Number(options.pageHeight);
  const objectCount = 2 + pages.length * 3;
  const objects = new Array(objectCount + 1);

  objects[1] = [ascii("<< /Type /Catalog /Pages 2 0 R >>")];
  const pageReferences = pages.map((_, index) => `${3 + index * 3} 0 R`).join(" ");
  objects[2] = [ascii(`<< /Type /Pages /Kids [${pageReferences}] /Count ${pages.length} >>`)];

  pages.forEach((page, index) => {
    const pageObject = 3 + index * 3;
    const imageObject = pageObject + 1;
    const contentObject = pageObject + 2;
    objects[pageObject] = [ascii(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
      `/Resources << /XObject << /Im0 ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>`
    )];
    objects[imageObject] = streamObject(
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} ` +
      "/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode >>",
      page.bytes
    );
    const drawing = ascii(`q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /Im0 Do Q`);
    objects[contentObject] = streamObject("<< >>", drawing);
  });

  const chunks = [ascii("%PDF-1.4\n%PageStitch\n")];
  const offsets = new Array(objectCount + 1).fill(0);
  let byteOffset = chunks[0].length;

  for (let objectNumber = 1; objectNumber <= objectCount; objectNumber += 1) {
    offsets[objectNumber] = byteOffset;
    const prefix = ascii(`${objectNumber} 0 obj\n`);
    const suffix = ascii("\nendobj\n");
    chunks.push(prefix, ...objects[objectNumber], suffix);
    byteOffset += prefix.length + suffix.length +
      objects[objectNumber].reduce((sum, chunk) => sum + chunk.length, 0);
  }

  const xrefOffset = byteOffset;
  const xref = [
    `xref\n0 ${objectCount + 1}\n`,
    "0000000000 65535 f \n",
    ...offsets.slice(1).map((offset) => `${padOffset(offset)} 00000 n \n`),
    `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\n`,
    `startxref\n${xrefOffset}\n%%EOF`
  ].join("");
  chunks.push(ascii(xref));
  return concatBytes(chunks);
}
