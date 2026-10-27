/* Assinatura digital ICP-Brasil (PAdES com carimbo do tempo) pela BRy, com QR Code de validação no rodapé. */
(() => {
  if (['127.0.0.1', 'localhost'].includes(location.hostname)) return;
  const SIGNABLE = ['simples', 'especial', 'atestado', 'laudo', 'exame', 'fisioterapia'];
  // Faixa reservada no pé de cada página: QR Code à esquerda, carimbo da BRy à direita.
  const FOOTER_HEIGHT = 30, QR_SIZE = 22, QR_X = 12, QR_Y = 297 - QR_SIZE - 5;
  let enabled;

  const api = async (action, data = {}) => {
    const response = await fetch(`api/index.php?action=${encodeURIComponent(action)}`, {
      method: 'POST', credentials: 'same-origin',
      ...(data instanceof FormData ? { body: data } : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || 'Não foi possível concluir a assinatura digital.');
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

  function askPin(preview) {
    const dialog = document.createElement('dialog');
    dialog.className = 'signature-dialog';
    dialog.innerHTML = '<form method="dialog"><h2>Assinar digitalmente</h2><p>Informe o PIN do seu certificado ICP-Brasil em nuvem (BRy KMS). O PIN é usado apenas nesta assinatura e não fica salvo.</p><label>PIN do certificado<input type="password" name="pin" autocomplete="off" required maxlength="64"></label><div><button class="btn outline" value="cancel" formnovalidate>Cancelar</button><button class="btn blue" value="ok">Assinar</button></div></form>';
    preview.append(dialog);
    return new Promise(resolve => {
      dialog.addEventListener('close', () => {
        const input = dialog.querySelector('input');
        const pin = dialog.returnValue === 'ok' ? input.value : '';
        input.value = ''; dialog.remove(); resolve(pin);
      }, { once: true });
      dialog.showModal();
    });
  }

  const documentType = () => $('.type-card.active')?.dataset.type;
  const documentTitle = () => documentType() === 'especial' ? 'Receita de Controle Especial' : $('#paperTitle').textContent.trim();

  async function signPreview(preview) {
    const button = preview.querySelector('#signDigital');
    if (button.disabled) return false;
    const pin = await askPin(preview);
    if (!pin) return false;
    // Abre durante o toque, antes das operações assíncronas, para permitir a nova aba no iOS.
    const viewer = window.open('', '_blank');
    if (!viewer) { toast('Permita abrir a nova aba para visualizar o documento assinado.'); return false; }
    viewer.opener = null;
    viewer.document.title = 'Assinando documento';
    viewer.document.body.textContent = 'Assinando o documento digitalmente…';
    const controls = [...preview.querySelectorAll('button, input')].filter(control => control !== button);
    const states = controls.map(control => control.disabled);
    controls.forEach(control => { control.disabled = true; });
    const label = button.textContent;
    button.disabled = true; button.textContent = 'Assinando…';
    try {
      const draft = await api('signature.prepare', { type: documentType() });
      await loadQrLibrary();
      const blob = await createPreviewPdf(preview, { footerHeight: FOOTER_HEIGHT, decorate: pdf => drawValidationFooter(pdf, { url: draft.validation_url, code: draft.code }) });
      const form = new FormData();
      form.append('public_id', draft.public_id);
      form.append('pin', pin);
      form.append('document', blob, 'documento.pdf');
      const signed = await api('signature.sign', form);
      const fileUrl = new URL(signed.file_url, document.baseURI).href;
      if (viewer.closed) window.open(fileUrl, '_blank', 'noopener');
      else viewer.location.replace(fileUrl);
      toast(`Documento assinado. Código de validação: ${draft.code}`);
      try {
        const saved = await window.saveAppointmentRecord?.({ type: documentType(), title: documentTitle(), text: $('#rxText').value.trim(), date: $('#rxDate').value });
        if (saved?.historyReady) toast(`Documento assinado e salvo no histórico. Código de validação: ${draft.code}`);
      } catch (error) { toast(error.message || 'Documento assinado, mas não foi possível salvá-lo no histórico.'); }
      return true;
    } catch (error) {
      if (!viewer.closed) viewer.close();
      toast(error.message || 'Não foi possível assinar o documento.');
      return false;
    } finally {
      button.disabled = false; button.textContent = label;
      controls.forEach((control, index) => { control.disabled = states[index]; });
    }
  }

  async function addSignButton() {
    const preview = $('#printPreview');
    if (!preview || !SIGNABLE.includes(documentType())) return;
    if (enabled === undefined) enabled = api('signature.status').then(result => result.enabled === true, () => false);
    if (!await enabled || !preview.isConnected || preview.querySelector('#signDigital')) return;
    const button = document.createElement('button');
    button.className = 'btn blue'; button.id = 'signDigital'; button.textContent = '🔏 Assinar digitalmente';
    button.onclick = () => signPreview(preview);
    preview.querySelector('#confirmPrint').before(button);
  }

  const style = document.createElement('style');
  style.textContent = '.signature-dialog{border:0;border-radius:14px;padding:22px;max-width:min(420px,calc(100vw - 32px));box-sizing:border-box}.signature-dialog::backdrop{background:#0008}.signature-dialog h2{margin:0 0 8px;font-size:20px}.signature-dialog p{margin:0 0 14px;line-height:1.45}.signature-dialog label{display:block;font-weight:700}.signature-dialog input{display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:11px;font-size:18px}.signature-dialog form>div{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}';
  document.head.append(style);
  const openPreview = $('#printRx').onclick;
  $('#printRx').onclick = event => { openPreview(event); addSignButton(); };
  window.digitalSignature = { drawValidationFooter, signPreview, addSignButton };
})();
