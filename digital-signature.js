/* Assinatura digital ICP-Brasil (PAdES com carimbo do tempo) pela BRy, com QR Code de validação no rodapé.
   O médico escolhe onde está o certificado: PSC em nuvem (BirdID, VIDaaS etc.), autorizado por OAuth no Integra BRy, ou BRy KMS com PIN. */
(() => {
  if (['127.0.0.1', 'localhost'].includes(location.hostname)) return;
  const SIGNABLE = ['simples', 'especial', 'atestado', 'laudo', 'exame', 'fisioterapia'];
  const PSC_LABELS = { BirdID: 'BirdID (Soluti)', Vidaas: 'VIDaaS (Valid)', SafeID: 'SafeID (Safeweb)', RemoteID: 'RemoteID (Certisign)', Syn: 'SyngularID (Syngular)', SerproID: 'SerproID (Serpro)', 'DS Cloud': 'DS Cloud (Digital Sign)' };
  // Faixa reservada no pé de cada página: QR Code à esquerda, carimbo da BRy à direita.
  const FOOTER_HEIGHT = 30, QR_SIZE = 22, QR_X = 12, QR_Y = 297 - QR_SIZE - 5;
  let enabled;

  const api = async (action, data = {}) => {
    const response = await fetch(`api/index.php?action=${encodeURIComponent(action)}`, {
      method: 'POST', credentials: 'same-origin',
      ...(data instanceof FormData ? { body: data } : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw Object.assign(new Error(result.error || 'Não foi possível concluir a assinatura digital.'), { result });
    return result;
  };
  let qrLibrary;
  const loadQrLibrary = () => qrLibrary ||= typeof window.qrcode === 'function' ? Promise.resolve() : new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('vendor/qrcode-generator-1.4.4.js', document.baseURI).href;
    script.onload = () => typeof window.qrcode === 'function' ? resolve() : reject(new Error('Biblioteca do QR Code indisponível.'));
    script.onerror = () => { script.remove(); qrLibrary = undefined; reject(new Error('Falha ao carregar o QR Code.')); };
    document.head.append(script);
  });
  const providerChoice = {
    get() { try { return localStorage.getItem('flowSignatureProvider') || ''; } catch (_) { return ''; } },
    set(value) { try { localStorage.setItem('flowSignatureProvider', value); } catch (_) {} }
  };
  // A página /psc/retorno avisa por BroadcastChannel; a consulta periódica cobre navegadores sem suporte.
  let wake;
  try { new BroadcastChannel('flow-signature').onmessage = () => wake?.(); } catch (_) {}
  const pause = ms => new Promise(resolve => { wake = resolve; setTimeout(resolve, ms); });

  // Desenha o QR em vetor, antes da assinatura: qualquer alteração depois dela invalidaria o PAdES.
  function drawValidationFooter(pdf, { url, code }) {
    pdf.setPage(pdf.getNumberOfPages());
    const qr = window.qrcode(0, 'M');
    qr.addData(url); qr.make();
    const count = qr.getModuleCount(), cell = QR_SIZE / count;
    pdf.setFillColor(0, 0, 0);
    for (let row = 0; row < count; row++) for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) pdf.rect(QR_X + col * cell, QR_Y + row * cell, cell, cell, 'F');
    }
    const left = QR_X + QR_SIZE + 4;
    pdf.setTextColor(23, 32, 51);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5);
    pdf.text('Documento assinado digitalmente com certificado ICP-Brasil.', left, QR_Y + 5);
    pdf.text('Confira em validar.iti.gov.br ou leia o QR Code.', left, QR_Y + 9.5);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Código de validação: ${code}`, left, QR_Y + 14.5);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6);
    pdf.text(url, left, QR_Y + 19);
  }

  // Aguarda o médico autorizar o certificado na aba do PSC; false se recusou, expirou ou o modal foi fechado.
  async function waitForPsc(psc, { interval = 3000, timeout = 5 * 60 * 1000, cancelled = () => false } = {}) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      await pause(interval);
      if (cancelled()) return false;
      const session = (await api('signature.status')).psc_session;
      if (session?.psc !== psc) return false;
      if (session.status === 'active') return true;
    }
    return false;
  }

  const documentType = () => $('.type-card.active')?.dataset.type;
  const documentTitle = () => documentType() === 'especial' ? 'Receita de Controle Especial' : $('#paperTitle').textContent.trim();

  async function signDocument(preview, { method, pin = '' }) {
    const draft = await api('signature.prepare', { type: documentType() });
    await loadQrLibrary();
    const blob = await createPreviewPdf(preview, { footerHeight: FOOTER_HEIGHT, decorate: pdf => drawValidationFooter(pdf, { url: draft.validation_url, code: draft.code }) });
    const form = new FormData();
    form.append('public_id', draft.public_id);
    form.append('method', method);
    if (method === 'kms') form.append('pin', pin);
    form.append('document', blob, 'documento.pdf');
    const signed = await api('signature.sign', form);
    return { code: draft.code, fileUrl: new URL(signed.file_url, document.baseURI).href };
  }

  async function saveRecord(code) {
    try {
      const saved = await window.saveAppointmentRecord?.({ type: documentType(), title: documentTitle(), text: $('#rxText').value.trim(), date: $('#rxDate').value });
      toast(saved?.historyReady ? `Documento assinado e salvo no histórico. Código de validação: ${code}` : `Documento assinado. Código de validação: ${code}`);
    } catch (error) { toast(error.message || 'Documento assinado, mas não foi possível salvá-lo no histórico.'); }
  }

  function openSignDialog(preview) {
    const dialog = document.createElement('dialog');
    dialog.className = 'signature-dialog';
    dialog.innerHTML = '<h2>Assinar digitalmente</h2><p>Onde está o seu certificado ICP-Brasil?</p><div class="signature-options" role="radiogroup" aria-label="Provedor do certificado"></div><label class="signature-pin" hidden>PIN do certificado<input type="password" autocomplete="off" maxlength="64"></label><p class="signature-status" role="status" aria-live="polite">Carregando provedores…</p><div class="signature-actions"><button type="button" class="btn outline" data-action="close">Cancelar</button><button type="button" class="btn blue" data-action="go" disabled>Continuar</button></div>';
    preview.append(dialog);
    const q = selector => dialog.querySelector(selector);
    const pinInput = q('.signature-pin input');
    let status = { pscs: [], psc_session: null }, busy = false, closed = false, result = null;
    const setStatus = (text, error = false) => { q('.signature-status').textContent = text; q('.signature-status').classList.toggle('error', error); };
    const choice = () => q('input[name="signatureProvider"]:checked')?.value || '';
    const connected = psc => status.psc_session?.psc === psc && status.psc_session.status === 'active';
    const label = psc => PSC_LABELS[psc] || psc;
    const update = () => {
      const value = choice(), kms = value === 'kms';
      q('.signature-pin').hidden = !kms || Boolean(result);
      dialog.querySelectorAll('.signature-options input, .signature-options button').forEach(control => { control.disabled = busy; });
      pinInput.disabled = busy;
      const go = q('[data-action="go"]');
      if (!go) return;
      go.disabled = busy || !value;
      go.textContent = kms || connected(value.slice(4)) ? 'Assinar' : 'Conectar e assinar';
    };
    const render = () => {
      const session = status.psc_session?.status === 'active' ? status.psc_session : null;
      const until = session ? new Date(session.expires_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
      const options = [
        ...status.pscs.map(name => ({ value: 'psc:' + name, title: label(name), note: connected(name) ? `Conectado até ${until}` : 'Autorização no site ou aplicativo do provedor' })),
        { value: 'kms', title: 'BRy KMS', note: 'Assinatura com PIN' }
      ];
      q('.signature-options').innerHTML = options.map(option => `<label class="signature-option"><input type="radio" name="signatureProvider" value="${safe(option.value)}"><span><b>${safe(option.title)}</b><small>${safe(option.note)}</small></span></label>`).join('')
        + (session ? `<button type="button" class="signature-link" data-action="disconnect">Desconectar ${safe(label(session.psc))}</button>` : '');
      const preferred = session ? 'psc:' + session.psc : providerChoice.get();
      const input = [...dialog.querySelectorAll('input[name="signatureProvider"]')].find(item => item.value === preferred);
      if (input) input.checked = true;
      setStatus(status.pscs.length ? '' : 'Não foi possível listar os provedores em nuvem agora; o BRy KMS continua disponível.');
      update();
    };
    const refresh = async () => { status = await api('signature.status'); render(); };
    const showDone = () => {
      q('.signature-options').hidden = true;
      dialog.querySelector('p').hidden = true;
      setStatus(`Documento assinado digitalmente. Código de validação: ${result.code}`);
      q('.signature-actions').innerHTML = '<button type="button" class="btn outline" data-action="close">Fechar</button><button type="button" class="btn blue" data-action="open">Abrir PDF assinado</button>';
      update();
    };

    async function go() {
      const value = choice();
      if (!value || busy) return;
      const psc = value.startsWith('psc:') ? value.slice(4) : '';
      const pin = pinInput.value;
      if (!psc && !pin) { setStatus('Informe o PIN do certificado.', true); pinInput.focus(); return; }
      // Abre a aba do PSC durante o toque, antes das operações assíncronas, para não ser bloqueada.
      const auth = psc && !connected(psc) ? window.open('', '_blank') : null;
      if (psc && !connected(psc) && !auth) { setStatus('Permita abrir uma nova aba para autorizar o certificado.', true); return; }
      busy = true; providerChoice.set(value); update();
      try {
        if (auth) {
          auth.document.title = 'Conectando certificado';
          auth.document.body.textContent = `Abrindo ${label(psc)}…`;
          const { url } = await api('signature.psc.connect', { psc });
          auth.location.href = url;
          setStatus(`Autorize o certificado na nova aba (${label(psc)}). Se o provedor pedir, aprove no aplicativo do celular. Aguardando…`);
          if (!await waitForPsc(psc, { cancelled: () => closed })) {
            if (closed) return;
            throw new Error('A autorização não foi concluída. Tente conectar novamente.');
          }
          await refresh();
        }
        setStatus('Gerando e assinando o documento…');
        result = await signDocument(preview, psc ? { method: 'psc' } : { method: 'kms', pin });
        pinInput.value = '';
        if (!closed) showDone();
        saveRecord(result.code);
      } catch (error) {
        if (auth && !auth.closed && !connected(psc)) auth.close();
        if (closed) return;
        if (error.result?.reconnect) await refresh().catch(() => {});
        setStatus(error.message || 'Não foi possível assinar o documento.', true);
      } finally {
        busy = false;
        if (!closed) update();
      }
    }

    dialog.addEventListener('change', update);
    dialog.addEventListener('click', async event => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'close') dialog.close();
      if (action === 'open' && result) window.open(result.fileUrl, '_blank', 'noopener');
      if (action === 'go') go();
      if (action === 'disconnect' && !busy) {
        busy = true; update();
        try { await api('signature.psc.disconnect'); await refresh(); }
        catch (error) { setStatus(error.message, true); }
        finally { busy = false; update(); }
      }
    });
    return new Promise(resolve => {
      dialog.addEventListener('close', () => { closed = true; pinInput.value = ''; dialog.remove(); resolve(result); }, { once: true });
      dialog.showModal();
      refresh().catch(error => setStatus(error.message, true));
    });
  }

  async function addSignButton() {
    const preview = $('#printPreview');
    if (!preview || !SIGNABLE.includes(documentType())) return;
    if (enabled === undefined) enabled = api('signature.status').then(result => result.enabled === true, () => false);
    if (!await enabled || !preview.isConnected || preview.querySelector('#signDigital')) return;
    const button = document.createElement('button');
    button.className = 'btn blue'; button.id = 'signDigital'; button.textContent = '🔏 Assinar digitalmente';
    button.onclick = () => openSignDialog(preview);
    preview.querySelector('#confirmPrint').before(button);
  }

  const style = document.createElement('style');
  style.textContent = '.signature-dialog{border:0;border-radius:14px;padding:22px;width:min(440px,calc(100vw - 32px));box-sizing:border-box}.signature-dialog::backdrop{background:#0008}.signature-dialog h2{margin:0 0 8px;font-size:20px}.signature-dialog p{margin:0 0 12px;line-height:1.45}.signature-options{display:grid;gap:8px;max-height:46vh;overflow:auto}.signature-option{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid #c9d2dd;border-radius:10px;cursor:pointer}.signature-option:has(input:checked){border-color:#1f5fbf;background:#f2f6fd}.signature-option input{margin-top:3px}.signature-option span{display:grid;gap:2px}.signature-option small{color:#4a5568}.signature-link{justify-self:start;border:0;background:none;color:#1f5fbf;padding:4px 0;text-decoration:underline;cursor:pointer}.signature-pin{display:block;font-weight:700;margin-top:12px}.signature-pin[hidden]{display:none}.signature-pin input{display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:11px;font-size:18px}.signature-status{min-height:1.4em;margin-top:12px!important}.signature-status.error{color:#b42318}.signature-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}';
  document.head.append(style);
  const openPreview = $('#printRx').onclick;
  $('#printRx').onclick = event => { openPreview(event); addSignButton(); };
  window.digitalSignature = { drawValidationFooter, signDocument, waitForPsc, openSignDialog, addSignButton };
})();
