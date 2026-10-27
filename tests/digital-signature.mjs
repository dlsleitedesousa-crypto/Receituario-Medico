import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../digital-signature.js', import.meta.url), 'utf8');
const qrSource = readFileSync(new URL('../vendor/qrcode-generator-1.4.4.js', import.meta.url), 'utf8');
const DRAFT = { ok: true, public_id: 'a'.repeat(32), code: 'ABCD-2345', validation_url: 'https://receita.drdanielleite.com.br/v/' + 'a'.repeat(32) };
const tick = () => new Promise(resolve => setTimeout(resolve));
async function setup({ type = 'laudo', enabled = true, statuses = [], signReply } = {}) {
  const requests = [], queue = [];
  const confirm = { before(node) { this.inserted = node; } };
  const preview = { querySelector: selector => ({ '#signDigital': confirm.inserted, '#confirmPrint': confirm })[selector] ?? null };
  const elements = { '#printRx': { onclick: () => { elements.opened = true; } }, '.type-card.active': { dataset: { type } }, '#printPreview': preview };
  const context = vm.createContext({
    location: { hostname: 'receita.drdanielleite.com.br' }, URL, FormData, Blob, setTimeout,
    document: { baseURI: 'https://receita.drdanielleite.com.br/', head: { append() {} }, createElement: () => ({}), addEventListener() {} },
    $: selector => elements[selector], toast() {}, safe: value => String(value),
    createPreviewPdf: async (target, options) => { requests.push({ pdf: options }); return new Blob(['%PDF-1.4']); },
    fetch: async (url, init) => {
      const action = new URL(url, 'https://x/').searchParams.get('action');
      requests.push({ action, body: init.body });
      const reply = action === 'signature.status' ? (queue.shift() || { ok: true, enabled, pscs: [], psc_session: null })
        : action === 'signature.prepare' ? DRAFT
        : signReply || { ok: true, file_url: 'api/index.php?action=signature.file&id=' + 'a'.repeat(32) };
      return { ok: reply.ok, json: async () => reply };
    }
  });
  context.window = context;
  vm.runInContext(qrSource, context);
  vm.runInContext(source, context);
  await tick();
  // O carregamento já consultou o status; os testes medem apenas as chamadas seguintes.
  queue.push(...statuses);
  requests.length = 0;
  return { context, preview, confirm, requests, elements, api: context.digitalSignature };
}
test('QR Code e código de validação ficam na faixa do rodapé de todas as folhas', async () => {
  const t = await setup(), calls = { rects: [], texts: [], pages: [] };
  const pdf = { getNumberOfPages: () => 3, setPage(page) { calls.pages.push(page); }, setFillColor() {}, setTextColor() {}, setFont() {}, setFontSize() {},
    rect(x, y, w, h, style) { calls.rects.push({ page: calls.pages.at(-1), x, y, w, h, style }); }, text(value, x, y) { calls.texts.push({ page: calls.pages.at(-1), value, x, y }); } };
  t.api.drawValidationFooter(pdf, { url: 'https://receita.drdanielleite.com.br/v/' + 'b'.repeat(32), code: 'WXYZ-2345' });
  assert.deepEqual(calls.pages, [1, 2, 3]);
  for (const page of [1, 2, 3]) {
    const rects = calls.rects.filter(rect => rect.page === page);
    assert.ok(rects.length > 100 && rects.length === calls.rects.length / 3, 'QR completo na folha ' + page);
    assert.ok(calls.texts.some(item => item.page === page && item.value === 'Código de validação: WXYZ-2345'), 'código na folha ' + page);
  }
  for (const rect of calls.rects) assert.ok(rect.style === 'F' && rect.x >= 12 && rect.x + rect.w <= 34.001 && rect.y >= 270 && rect.y + rect.h <= 292.001);
  assert.match(calls.texts.map(item => item.value).join('\n'), /validar\.iti\.gov\.br/);
  assert.ok(calls.texts.every(item => item.y > 270 && item.y < 297 && item.x > 34));
});
test('assinatura com o certificado em nuvem envia o PDF com rodapé, sem PIN', async () => {
  const t = await setup();
  const result = await t.api.signDocument({});
  assert.deepEqual(t.requests.filter(item => item.action).map(item => item.action), ['signature.prepare', 'signature.sign']);
  assert.equal(JSON.parse(t.requests[0].body).type, 'laudo');
  assert.equal(t.requests[1].pdf.footerHeight, 30);
  const form = t.requests[2].body;
  assert.equal(form.get('public_id'), 'a'.repeat(32));
  assert.equal(form.get('method'), 'psc');
  assert.equal(form.has('pin'), false);
  assert.equal(form.get('document').name, 'documento.pdf');
  assert.deepEqual({ ...result }, { code: 'ABCD-2345', fileUrl: 'https://receita.drdanielleite.com.br/api/index.php?action=signature.file&id=' + 'a'.repeat(32) });
});
test('BRy KMS continua aceitando PIN pela API', async () => {
  const t = await setup();
  await t.api.signDocument({}, { method: 'kms', pin: '123456' });
  assert.equal(t.requests[2].body.get('pin'), '123456');
});
test('recusa da BRy chega com o motivo e o pedido de reconexão', async () => {
  const t = await setup({ signReply: { ok: false, error: 'A autorização do certificado em nuvem expirou. Conecte novamente.', reconnect: true } });
  await assert.rejects(t.api.signDocument({}), error => error.message.includes('expirou') && error.result.reconnect === true);
});
test('espera a autenticação no provedor até a conexão ficar ativa', async () => {
  const pending = { ok: true, enabled: true, pscs: ['BirdID'], psc_session: { psc: 'BirdID', status: 'pending' } };
  const t = await setup({ statuses: [pending, pending, { ...pending, psc_session: { psc: 'BirdID', status: 'active' } }] });
  assert.equal(await t.api.waitForPsc('BirdID', { interval: 1, timeout: 1000 }), true);
  assert.equal(t.requests.length, 3);
});
test('autenticação recusada, outro provedor, prazo esgotado ou cancelamento encerram a espera', async () => {
  assert.equal(await (await setup({ statuses: [{ ok: true, psc_session: null }] })).api.waitForPsc('BirdID', { interval: 1 }), false);
  assert.equal(await (await setup({ statuses: [{ ok: true, psc_session: { psc: 'Vidaas', status: 'active' } }] })).api.waitForPsc('BirdID', { interval: 1 }), false);
  const pending = () => ({ ok: true, psc_session: { psc: 'BirdID', status: 'pending' } });
  const slow = await setup({ statuses: Array.from({ length: 50 }, pending) });
  assert.equal(await slow.api.waitForPsc('BirdID', { interval: 1, timeout: 20 }), false);
  const cancelled = await setup({ statuses: [pending()] });
  assert.equal(await cancelled.api.waitForPsc('BirdID', { interval: 1, cancelled: () => true }), false);
  assert.equal(cancelled.requests.length, 0);
});
test('botão da prévia aparece só em documentos assináveis e com o servidor configurado', async () => {
  const t = await setup();
  t.elements['#printRx'].onclick();
  assert.equal(t.elements.opened, true);
  assert.equal(t.confirm.inserted.id, 'signDigital');
  const budget = await setup({ type: 'orcamento' });
  budget.api.addSignButton();
  assert.equal(budget.confirm.inserted, undefined);
  const disabled = await setup({ enabled: false });
  disabled.api.addSignButton();
  assert.equal(disabled.confirm.inserted, undefined);
});
