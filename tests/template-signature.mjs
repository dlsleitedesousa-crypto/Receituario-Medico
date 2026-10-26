import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url));
const context = vm.createContext({});
context.self = context; context.globalThis = context;
vm.runInContext(read('vendor/pdf-lib-1.17.1.min.js').toString(), context);
vm.runInContext(read('apac-template-pdf.js').toString() + '\n' + read('aih-template-pdf.js').toString(), context);
const PDFLib = context.PDFLib;
function png(width, height) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]), size = Buffer.alloc(4), crc = Buffer.alloc(4);
    size.writeUInt32BE(data.length); crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([size, body, crc]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const rows = Buffer.alloc((width * 3 + 1) * height);
  return 'data:image/png;base64,' + Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}
async function drawnImages(create, values, template) {
  const calls = [], original = PDFLib.PDFPage.prototype.drawImage;
  PDFLib.PDFPage.prototype.drawImage = function (image, options) { calls.push(options); return original.call(this, image, options); };
  const bytes = read(template), buffer = vm.runInContext(`new Uint8Array(${bytes.length})`, context);
  buffer.set(bytes);
  try { await create(values, buffer, PDFLib); } finally { PDFLib.PDFPage.prototype.drawImage = original; }
  return calls;
}
const inside = (call, box) => call.x >= box.x && call.y >= box.y && call.x + call.width <= box.x + box.width + 1e-6 && call.y + call.height <= box.y + box.height + 1e-6;
const apac = { cnes: '1234567', patient: 'Paciente', procedure: 'Procedimento', code: '0301010072', quantity: '1', professional: 'Profissional', professionalCpf: '12345678901', date: '25/10/2026' };
test('APAC desenha a assinatura dentro do quadro de assinatura', async () => {
  const [call] = await drawnImages(context.createApacTemplatePdf, { ...apac, signature: png(400, 100) }, 'assets/apac-modelo.pdf');
  assert.ok(inside(call, { x: 381, y: 185, width: 175, height: 37 }));
  assert.equal((await drawnImages(context.createApacTemplatePdf, apac, 'assets/apac-modelo.pdf')).length, 0);
});
test('AIH desenha a assinatura dentro do quadro de assinatura', async () => {
  const [call] = await drawnImages(context.createAihTemplatePdf, { patient: 'Paciente', procedure: 'Procedimento', signature: png(400, 100) }, 'assets/aih-modelo.pdf');
  assert.ok(inside(call, { x: 381, y: 225, width: 194, height: 13 }));
});
test('assinatura que não é PNG/JPEG em base64 é ignorada', async () => {
  const calls = await drawnImages(context.createApacTemplatePdf, { ...apac, signature: 'data:image/svg+xml;base64,aGVsbG8=' }, 'assets/apac-modelo.pdf');
  assert.equal(calls.length, 0);
});
