import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../digital-signature.js', import.meta.url), 'utf8');
const qrSource = readFileSync(new URL('../vendor/qrcode-generator-1.4.4.js', import.meta.url), 'utf8');
function setup({ type = 'laudo', pin = '123456', enabled = true, signReply } = {}) {
  const messages = [], requests = [], saved = [];
  const viewer = { closed: false, document: { body: {} }, location: { replace(url) { this.url = url; } }, close() { this.closed = true; } };
  const button = { disabled: false, textContent: '' }, confirm = { disabled: false, before(node) { this.inserted = node; } }, slider = { disabled: true };
  const preview = {
    isConnected: true, dialogs: [], signButton: button,
    querySelector: selector => ({ '#signDigital': confirm.inserted || preview.signButton, '#confirmPrint': confirm })[selector] ?? null,
    querySelectorAll: () => [confirm.inserted || preview.signButton, confirm, slider],
    append(dialog) { this.dialogs.push(dialog); }
  };
  const elements = { '#printRx': { onclick: () => { elements.opened = true; } }, '.type-card.active': { dataset: { type } }, '#paperTitle': { textContent: ' Laudo Médico ' }, '#rxText': { value: ' Texto do laudo ' }, '#rxDate': { value: '2026-10-26' }, '#printPreview': preview };
  const createElement = tag => {
    const input = { value: '' };
    return { tag, listeners: {}, returnValue: '', addEventListener(name, callback) { this.listeners[name] = callback; }, remove() { this.removed = true; },
      querySelector: () => input,
      showModal() { queueMicrotask(() => { input.value = pin; this.returnValue = pin ? 'ok' : 'cancel'; this.listeners.close(); }); } };
  };
  const context = vm.createContext({
    location: { hostname: 'receita.drdanielleite.com.br' }, URL, FormData, Blob, queueMicrotask,
    document: { baseURI: 'https://receita.drdanielleite.com.br/', head: { append() {} }, createElement },
    $: selector => elements[selector], toast: message => messages.push(message),
    createPreviewPdf: async (target, options) => { requests.push({ pdf: options }); return new Blob(['%PDF-1.4']); },
    fetch: async (url, init) => {
      const action = new URL(url, 'https://x/').searchParams.get('action');
      requests.push({ action, body: init.body });
      const reply = action === 'signature.status' ? { ok: true, enabled }
        : action === 'signature.prepare' ? { ok: true, public_id: 'a'.repeat(32), code: 'ABCD-2345', validation_url: 'https://receita.drdanielleite.com.br/v/' + 'a'.repeat(32) }
        : signReply || { ok: true, file_url: 'api/index.php?action=signature.file&id=' + 'a'.repeat(32) };
      return { ok: reply.ok, json: async () => reply };
    }
  });
  context.window = context;
  context.window.open = () => viewer;
  context.window.saveAppointmentRecord = async record => { saved.push(record); return { historyReady: true }; };
  vm.runInContext(qrSource, context);
  vm.runInContext(source, context);
  return { context, preview, button, confirm, slider, viewer, messages, requests, saved, elements };
}
function fakePdf() {
  const calls = { rects: [], texts: [], page: null };
  return { calls, getNumberOfPages: () => 2, setPage(page) { calls.page = page; }, setFillColor() {}, setTextColor() {}, setFont() {}, setFontSize() {},
    rect(x, y, w, h, style) { calls.rects.push({ x, y, w, h, style }); }, text(value, x, y) { calls.texts.push({ value, x, y }); } };
}
test('QR Code e código de validação ficam na faixa do rodapé da última página', () => {
  const t = setup(), pdf = fakePdf();
  t.context.digitalSignature.drawValidationFooter(pdf, { url: 'https://receita.drdanielleite.com.br/v/' + 'b'.repeat(32), code: 'WXYZ-2345' });
  assert.equal(pdf.calls.page, 2);
  assert.ok(pdf.calls.rects.length > 100);
  for (const rect of pdf.calls.rects) {
    assert.equal(rect.style, 'F');
    assert.ok(rect.x >= 12 && rect.x + rect.w <= 34.001 && rect.y >= 270 && rect.y + rect.h <= 292.001);
  }
  const text = pdf.calls.texts.map(item => item.value).join('\n');
  assert.match(text, /Código de validação: WXYZ-2345/);
  assert.match(text, /validar\.iti\.gov\.br/);
  assert.ok(pdf.calls.texts.every(item => item.y > 270 && item.y < 297 && item.x > 34));
});
test('assinatura envia PDF com rodapé, PIN e rascunho, abre o arquivo assinado e salva no histórico', async () => {
  const t = setup();
  assert.equal(await t.context.digitalSignature.signPreview(t.preview), true);
  assert.deepEqual(t.requests.filter(item => item.action).map(item => item.action), ['signature.prepare', 'signature.sign']);
  assert.equal(JSON.parse(t.requests[0].body).type, 'laudo');
  assert.equal(t.requests[1].pdf.footerHeight, 30);
  const form = t.requests[2].body;
  assert.equal(form.get('public_id'), 'a'.repeat(32));
  assert.equal(form.get('pin'), '123456');
  assert.equal(form.get('document').name, 'documento.pdf');
  assert.equal(t.viewer.location.url, 'https://receita.drdanielleite.com.br/api/index.php?action=signature.file&id=' + 'a'.repeat(32));
  assert.equal(t.viewer.opener, null);
  assert.deepEqual({ ...t.saved[0] }, { type: 'laudo', title: 'Laudo Médico', text: 'Texto do laudo', date: '2026-10-26' });
  assert.match(t.messages.at(-1), /ABCD-2345/);
  assert.equal(t.button.disabled, false); assert.equal(t.slider.disabled, true);
  assert.equal(t.preview.dialogs[0].removed, true);
});
test('cancelar o PIN não abre aba nem chama a API', async () => {
  const t = setup({ pin: '' });
  t.context.window.open = () => { throw new Error('Não deve abrir'); };
  assert.equal(await t.context.digitalSignature.signPreview(t.preview), false);
  assert.equal(t.requests.length, 0);
});
test('recusa da BRy fecha a aba, mostra o motivo e libera os controles', async () => {
  const t = setup({ signReply: { ok: false, error: 'A BRy recusou a assinatura: PIN inválido' } });
  assert.equal(await t.context.digitalSignature.signPreview(t.preview), false);
  assert.equal(t.viewer.closed, true);
  assert.equal(t.messages.at(-1), 'A BRy recusou a assinatura: PIN inválido');
  assert.equal(t.saved.length, 0);
  assert.equal(t.button.disabled, false); assert.equal(t.button.textContent, '');
});
test('botão aparece só em documentos assináveis e com o servidor configurado', async () => {
  const t = setup();
  t.preview.signButton = null;
  t.elements['#printRx'].onclick();
  assert.equal(t.elements.opened, true);
  await new Promise(resolve => setTimeout(resolve));
  assert.equal(t.confirm.inserted.id, 'signDigital');
  const budget = setup({ type: 'orcamento' });
  budget.preview.signButton = null;
  await budget.context.digitalSignature.addSignButton();
  assert.equal(budget.confirm.inserted, undefined);
  const disabled = setup({ enabled: false });
  disabled.preview.signButton = null;
  await disabled.context.digitalSignature.addSignButton();
  assert.equal(disabled.confirm.inserted, undefined);
});
