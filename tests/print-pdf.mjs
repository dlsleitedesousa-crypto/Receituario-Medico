import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../print-pdf.js', import.meta.url), 'utf8');
function setup() {
  const button = { disabled: false, textContent: 'Imprimir ou salvar PDF' };
  const slider = { disabled: false };
  const viewer = { closed: false, document: { body: {} }, location: { replace(url) { this.url = url; } }, close() { this.closed = true; } };
  const messages = [], events = {}, revoked = [];
  const context = vm.createContext({
    window: { open: () => viewer, addEventListener: (name, callback) => { events[name] = callback; } },
    URL: { createObjectURL: () => 'blob:documento-teste', revokeObjectURL: url => revoked.push(url) },
    toast: message => messages.push(message)
  });
  vm.runInContext(source, context);
  const preview = { querySelector: () => button, querySelectorAll: () => [button, slider] };
  context.createPreviewPdf = async () => ({});
  return { context, preview, button, slider, viewer, messages, events, revoked };
}
test('popup bloqueado não gera PDF nem deixa os controles bloqueados', async () => {
  const t = setup(); t.context.window.open = () => null;
  t.context.createPreviewPdf = () => { throw new Error('Não deve gerar'); };
  assert.equal(await t.context.printPreviewPdf(t.preview), false);
  assert.equal(t.button.disabled, false);
  assert.equal(t.messages.length, 1);
});
test('erro na geração fecha aba vazia e permite tentar novamente', async () => {
  const t = setup(); t.context.createPreviewPdf = async () => { throw new Error('Falha'); };
  assert.equal(await t.context.printPreviewPdf(t.preview), false);
  assert.equal(t.viewer.closed, true);
  assert.equal(t.button.disabled, false); assert.equal(t.slider.disabled, false);
  assert.equal(t.button.textContent, 'Imprimir ou salvar PDF');
});
test('toques repetidos não abrem outra aba durante geração e controles são restaurados', async () => {
  const t = setup(); let resolve;
  t.context.createPreviewPdf = () => new Promise(done => { resolve = done; });
  const first = t.context.printPreviewPdf(t.preview);
  assert.equal(t.button.disabled, true); assert.equal(t.slider.disabled, true);
  assert.equal(await t.context.printPreviewPdf(t.preview), false);
  resolve({}); assert.equal(await first, true);
  assert.equal(t.viewer.location.url, 'blob:documento-teste');
  assert.equal(t.viewer.closed, false); assert.equal(t.viewer.opener, null);
  assert.equal(t.button.disabled, false); assert.equal(t.slider.disabled, false);
  t.events.pagehide(); assert.deepEqual(t.revoked, ['blob:documento-teste']);
});
test('fechar a aba durante a geração não deixa URL temporária nem controles bloqueados', async () => {
  const t = setup(); t.viewer.closed = true;
  assert.equal(await t.context.printPreviewPdf(t.preview), false);
  assert.deepEqual(t.revoked, ['blob:documento-teste']);
  assert.equal(t.button.disabled, false); assert.equal(t.slider.disabled, false);
});
