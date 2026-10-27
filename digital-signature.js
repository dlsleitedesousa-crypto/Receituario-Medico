/* Assinatura Digital ICP-Brasil (PAdES com carimbo do tempo) pela BRy, com QR Code de validação no rodapé.
   O interruptor "Assinatura Digital" conecta o certificado em nuvem (BirdID, VIDaaS etc.): a autenticação acontece no
   site do provedor (OAuth pelo Integra BRy) e vale pelo tempo de atividade escolhido. Senha, PIN e códigos nunca passam por aqui. */
(() => {
  if (['127.0.0.1', 'localhost'].includes(location.hostname)) return;
  const SIGNABLE = ['simples', 'especial', 'atestado', 'laudo', 'exame', 'fisioterapia'];
  const PROVIDERS = {
    BirdID: { title: 'BirdID', company: 'Soluti', color: '#0b7a55', hint: 'No site do BirdID, informe seu CPF e o código de 6 dígitos (OTP) do aplicativo BirdID.' },
    Vidaas: { title: 'VIDaaS', company: 'Valid', color: '#c8102e', hint: 'No site do VIDaaS, confirme o acesso pelo aplicativo VIDaaS no celular.' },
    SafeID: { title: 'SafeID', company: 'Safeweb', color: '#1b5fb4' },
    RemoteID: { title: 'RemoteID', company: 'Certisign', color: '#d9531e' },
    Syn: { title: 'SyngularID', company: 'Syngular', color: '#5b2a86' },
    SerproID: { title: 'SerproID', company: 'Serpro', color: '#00508c', hint: 'No SerproID, a validade da autorização é escolhida na própria tela do provedor.' },
    'DS Cloud': { title: 'DS Cloud', company: 'Digital Sign', color: '#2f4858' }
  };
  const FEATURED = ['BirdID', 'Vidaas', 'SafeID', 'RemoteID'];
  const LIFETIMES = [[3600, '1 hora'], [14400, '4 horas'], [28800, '8 horas'], [43200, '12 horas'], [86400, '24 horas'], [604800, '7 dias']];
  const PROVIDER_HINT = 'Na página do provedor, entre com a senha, o PIN ou o código do aplicativo, conforme ele pedir.';
  const WEB_PKI_SCRIPT = 'https://cdn.lacunasoftware.com/libs/web-pki/lacuna-web-pki-2.18.0.min.js';
  const WEB_PKI_INSTALL = 'https://get.webpkiplugin.com/';
  // Faixa reservada no pé de cada página: QR Code à esquerda, carimbo da BRy à direita.
  const FOOTER_HEIGHT = 30, QR_SIZE = 22, QR_X = 12, QR_Y = 297 - QR_SIZE - 5;
  let status = null;

  const api = async (action, data = {}) => {
    const response = await fetch(`api/index.php?action=${encodeURIComponent(action)}`, {
      method: 'POST', credentials: 'same-origin',
      ...(data instanceof FormData ? { body: data } : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw Object.assign(new Error(result.error || 'Não foi possível concluir a assinatura digital.'), { result });
    return result;
  };
  const scripts = {};
  const loadScript = (src, available) => scripts[src] ||= available() ? Promise.resolve() : new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL(src, document.baseURI).href;
    script.onload = () => available() ? resolve() : reject(new Error('Biblioteca indisponível.'));
    script.onerror = () => { script.remove(); delete scripts[src]; reject(new Error('Falha ao carregar a biblioteca.')); };
    document.head.append(script);
  });
  const remembered = {
    get(key) { try { return localStorage.getItem(key) || ''; } catch (_) { return ''; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (_) {} }
  };
  // A página /psc/retorno avisa por BroadcastChannel; a consulta periódica cobre navegadores sem suporte.
  let wake;
  try { new BroadcastChannel('flow-signature').onmessage = () => wake?.(); } catch (_) {}
  const pause = ms => new Promise(resolve => { wake = resolve; setTimeout(resolve, ms); });

  const provider = name => PROVIDERS[name] || { title: name, company: 'Certificado em nuvem', color: '#455468' };
  const activeSession = () => status?.psc_session?.status === 'active' ? status.psc_session : null;
  const formatCpf = cpf => /^\d{11}$/.test(cpf || '') ? cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '';
  const until = iso => {
    const date = new Date(iso), time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return date.toDateString() === new Date().toDateString() ? time : `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${time}`;
  };
  const logo = (name, large = false) => {
    const item = provider(name);
    return `<span class="ds-logo${large ? ' ds-logo-large' : ''}" style="--ds-color:${item.color}" aria-hidden="true">${safe(large ? item.title : item.title.slice(0, 2))}</span>`;
  };

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

  // Aguarda o médico autenticar na aba do provedor; false se recusou, expirou ou a espera foi cancelada.
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

  async function signDocument(preview, { method = 'psc', pin = '' } = {}) {
    const draft = await api('signature.prepare', { type: documentType() });
    await loadScript('vendor/qrcode-generator-1.4.4.js', () => typeof window.qrcode === 'function');
    const blob = await createPreviewPdf(preview, { footerHeight: FOOTER_HEIGHT, decorate: pdf => drawValidationFooter(pdf, { url: draft.validation_url, code: draft.code }) });
    const form = new FormData();
    form.append('public_id', draft.public_id);
    form.append('method', method);
    if (method === 'kms') form.append('pin', pin);
    form.append('document', blob, 'documento.pdf');
    const signed = await api('signature.sign', form);
    return { code: draft.code, fileUrl: new URL(signed.file_url, document.baseURI).href };
  }

  async function refreshStatus() {
    status = await api('signature.status');
    syncToggle();
    return status;
  }

  // Interruptor na lateral do receituário, abaixo de "Usar imagem da assinatura".
  function syncToggle() {
    const anchor = $('#signatureToggleHint');
    if (!status?.enabled || !anchor) return;
    if (!$('#useDigitalSignature')) {
      anchor.insertAdjacentHTML('afterend', '<label class="signature-toggle ds-toggle"><input id="useDigitalSignature" type="checkbox" role="switch"><span>Assinatura Digital</span></label><small id="digitalSignatureHint" class="ds-toggle-hint"></small>');
      $('#useDigitalSignature').onchange = onToggle;
    }
    const session = activeSession();
    $('#useDigitalSignature').checked = Boolean(session);
    $('#digitalSignatureHint').textContent = session
      ? `Conectado: ${provider(session.psc).title} até ${until(session.expires_at)}.`
      : 'Conecte seu certificado ICP-Brasil para assinar receitas, atestados e laudos.';
  }
  async function onToggle(event) {
    const input = event.target, session = activeSession();
    if (input.checked) { input.checked = false; openModal(); return; }
    if (!session) return;
    if (!confirm(`Desconectar o certificado ${provider(session.psc).title}?`)) { input.checked = true; return; }
    input.disabled = true;
    try { await api('signature.psc.disconnect'); await refreshStatus(); toast('Certificado desconectado.'); }
    catch (error) { input.checked = true; toast(error.message); }
    finally { input.disabled = false; }
  }

  // Modal "Assinatura Digital": seleção de certificados, autenticação no provedor, A1/A3 e assinatura.
  function createModal() {
    const dialog = document.createElement('dialog');
    dialog.className = 'ds-modal';
    dialog.setAttribute('aria-labelledby', 'dsTitle');
    dialog.innerHTML = '<header class="ds-head"><button type="button" class="ds-icon" data-ds="back" aria-label="Voltar" hidden>&#8592;</button><h2 id="dsTitle">Assinatura Digital</h2><button type="button" class="ds-icon" data-ds="close" aria-label="Fechar">&#10005;</button></header><div class="ds-body"></div>';
    document.body.append(dialog);
    const modal = {
      dialog, closed: false, busy: false, handlers: {},
      q: selector => dialog.querySelector(selector),
      view(html, { back = null } = {}) {
        dialog.querySelector('.ds-body').innerHTML = html;
        dialog.querySelector('[data-ds="back"]').hidden = !back;
        modal.handlers.back = back;
      },
      setStatus(text, kind = '') {
        const element = dialog.querySelector('.ds-status');
        if (!element) return;
        element.className = 'ds-status' + (kind ? ' ds-' + kind : '');
        element.innerHTML = (kind === 'loading' ? '<span class="ds-spinner" aria-hidden="true"></span>' : kind === 'success' ? '<span aria-hidden="true">&#10003;</span> ' : '') + safe(text);
      },
      lock(on) {
        modal.busy = on;
        dialog.querySelectorAll('.ds-body button:not([data-ds="cancel"]), .ds-body select').forEach(control => { control.disabled = on; });
      },
      close() { if (dialog.open) dialog.close(); }
    };
    dialog.addEventListener('click', event => {
      const target = event.target.closest('[data-ds]');
      if (event.target === dialog && !modal.busy) { modal.close(); return; }
      if (!target || target.disabled) return;
      const action = target.dataset.ds;
      if (action === 'close') modal.close();
      else if (action === 'back') modal.handlers.back?.();
      else modal.handlers[action]?.(target);
    });
    dialog.addEventListener('close', () => { modal.closed = true; dialog.remove(); modal.onClose?.(); }, { once: true });
    dialog.showModal();
    return modal;
  }

  function gridView(modal, done) {
    const available = status?.pscs || [], found = status?.pscs_with_certificate || [], session = activeSession();
    const names = [...FEATURED.filter(name => available.includes(name)), ...available.filter(name => !FEATURED.includes(name))];
    const card = name => {
      const item = provider(name);
      const tag = session?.psc === name ? '<em class="ds-tag ds-tag-ok">Conectado</em>' : found.includes(name) ? '<em class="ds-tag">Certificado encontrado</em>' : '';
      return `<button type="button" class="ds-card" data-ds="provider" data-psc="${safe(name)}">${logo(name)}<span class="ds-card-text"><b>${safe(item.title)}</b><small>${safe(item.company)}</small>${tag}</span></button>`;
    };
    modal.view(`<p class="ds-sub">Certificados integrados</p><div class="ds-grid">${names.map(card).join('')}<button type="button" class="ds-card" data-ds="local"><span class="ds-logo ds-logo-local" aria-hidden="true">A1<br>A3</span><span class="ds-card-text"><b>A1/A3 Instalados</b><small>Computador ou token USB</small></span></button></div><p class="ds-status" role="status" aria-live="polite"></p>`);
    if (!available.length) modal.setStatus('Não foi possível carregar os certificados em nuvem agora. Tente novamente em instantes.', 'error');
    modal.handlers.provider = target => providerView(modal, target.dataset.psc, done);
    modal.handlers.local = () => localView(modal, done);
  }

  function providerView(modal, name, done) {
    const item = provider(name), cpf = formatCpf(status?.cpf);
    const chosen = Number(remembered.get('flowSignatureLifetime')) || 43200;
    const found = status?.pscs_with_certificate || [];
    modal.view(`<div class="ds-provider">${logo(name, true)}<div><b>${safe(item.title)}</b><small>${safe(item.company)} · Certificado em nuvem</small></div></div>
      <label class="ds-field"><span>Tempo de atividade</span><select data-field="lifetime">${LIFETIMES.map(([seconds, text]) => `<option value="${seconds}"${seconds === chosen ? ' selected' : ''}>Expirar login em ${text}</option>`).join('')}</select></label>
      <label class="ds-field"><span>CPF</span><input value="${safe(cpf)}" readonly aria-describedby="dsCpfHint"><small id="dsCpfHint">CPF do seu cadastro. Para alterar, edite Meu perfil.</small></label>
      <div class="ds-info">${safe(item.hint || PROVIDER_HINT)} Senha, PIN e códigos são digitados somente no site do provedor; o Flow Receita não os recebe.</div>
      <p class="ds-status" role="status" aria-live="polite"></p>
      <div class="ds-actions"><button type="button" class="btn blue" data-ds="authenticate">Autenticar</button></div>`, { back: () => { modal.cancelled = true; gridView(modal, done); } });
    if (!cpf) { modal.setStatus('Cadastre seu CPF em Meu perfil para conectar o certificado.', 'error'); modal.q('[data-ds="authenticate"]').disabled = true; return; }
    if (found.length && !found.includes(name)) modal.setStatus(`A BRy não encontrou certificado ${item.title} para este CPF. Confira em qual provedor está o seu certificado.`, 'warning');
    modal.handlers.authenticate = () => authenticate(modal, name, done);
  }

  async function authenticate(modal, name, done) {
    const item = provider(name), lifetime = Number(modal.q('[data-field="lifetime"]').value);
    remembered.set('flowSignatureLifetime', String(lifetime));
    // Abre a aba do provedor durante o toque, antes das operações assíncronas, para não ser bloqueada.
    const auth = window.open('', '_blank');
    if (!auth) { modal.setStatus('Permita abrir uma nova aba para entrar no provedor.', 'error'); return; }
    modal.cancelled = false; modal.lock(true);
    modal.setStatus(`Abrindo o ${item.title}…`, 'loading');
    let connected = false;
    try {
      auth.document.title = `Entrar com ${item.title}`;
      auth.document.body.textContent = `Abrindo ${item.title}…`;
      const { url } = await api('signature.psc.connect', { psc: name, lifetime });
      auth.location.href = url;
      modal.setStatus(`Conclua a autenticação na aba do ${item.title}. Aguardando confirmação…`, 'loading');
      modal.q('.ds-actions').insertAdjacentHTML('afterbegin', '<button type="button" class="btn outline" data-ds="cancel">Cancelar</button>');
      modal.handlers.cancel = () => { modal.cancelled = true; };
      if (!await waitForPsc(name, { cancelled: () => modal.cancelled || modal.closed })) {
        if (modal.closed) return;
        throw new Error(modal.cancelled ? 'Autenticação cancelada.' : 'A autenticação não foi concluída no provedor. Tente novamente.');
      }
      await refreshStatus();
      connected = true;
      modal.q('[data-ds="cancel"]')?.remove();
      modal.setStatus(`Conectado ao ${item.title} até ${until(activeSession().expires_at)}.`, 'success');
      toast(`Assinatura Digital ativa com ${item.title}.`);
      setTimeout(() => done(true), 1200);
    } catch (error) {
      if (!auth.closed) auth.close();
      if (modal.closed) return;
      modal.q('[data-ds="cancel"]')?.remove();
      modal.setStatus(error.message, error.message === 'Autenticação cancelada.' ? '' : 'error');
    } finally {
      if (!modal.closed && !connected) modal.lock(false);
    }
  }

  function localView(modal, done) {
    modal.view(`<div class="ds-provider"><span class="ds-logo ds-logo-large ds-logo-local" aria-hidden="true">A1 · A3</span><div><b>Certificado instalado</b><small>Arquivo A1 no computador ou token/cartão A3</small></div></div>
      <p>Para ler certificados instalados no computador ou em token USB, o navegador precisa do componente <b>Web PKI</b>.</p>
      <ol class="ds-steps"><li><b>Baixe o aplicativo/extensão Web PKI</b> na loja do seu navegador: <a href="${WEB_PKI_INSTALL}" target="_blank" rel="noopener">instalar o Web PKI</a>.</li><li><b>Volte para esta tela</b> e clique em avançar.</li></ol>
      <ul class="ds-certificates" hidden></ul>
      <p class="ds-status" role="status" aria-live="polite"></p>
      <div class="ds-actions"><button type="button" class="btn blue" data-ds="webpki">Após instalar, clique aqui para avançar</button></div>`, { back: () => gridView(modal, done) });
    modal.handlers.webpki = () => checkWebPki(modal);
  }

  async function checkWebPki(modal) {
    modal.lock(true);
    modal.setStatus('Procurando o Web PKI neste navegador…', 'loading');
    const finish = (text, kind) => { if (!modal.closed) { modal.lock(false); modal.setStatus(text, kind); } };
    try { await loadScript(WEB_PKI_SCRIPT, () => typeof window.LacunaWebPKI === 'function'); }
    catch (_) { finish('Não foi possível carregar o Web PKI. Verifique a conexão e tente novamente.', 'error'); return; }
    const pki = new window.LacunaWebPKI();
    pki.init({
      ready: () => pki.listCertificates().success(certificates => {
        const valid = certificates.filter(certificate => new Date(certificate.validityEnd) > new Date());
        const list = modal.q('.ds-certificates');
        if (list) {
          list.innerHTML = valid.map(certificate => `<li><b>${safe(certificate.subjectName)}</b><small>Válido até ${new Date(certificate.validityEnd).toLocaleDateString('pt-BR')}</small></li>`).join('');
          list.hidden = !valid.length;
        }
        finish(valid.length
          ? `Web PKI instalado: ${valid.length} certificado(s) válido(s) encontrado(s). A assinatura com certificado A1/A3 ainda não está habilitada no Flow Receita; por enquanto, use um certificado em nuvem.`
          : 'Web PKI instalado, mas nenhum certificado válido foi encontrado. Conecte o token USB ou instale o certificado A1 e tente novamente.', valid.length ? 'warning' : 'error');
      }).fail(error => finish('O Web PKI não conseguiu ler os certificados: ' + (error?.userMessage || error?.message || 'erro desconhecido'), 'error')),
      notInstalled: () => finish('O Web PKI não foi encontrado neste navegador. Instale pela loja do navegador, recarregue a página se ela pedir e clique em avançar novamente.', 'error'),
      defaultFail: error => finish('O Web PKI respondeu com erro: ' + (error?.userMessage || error?.message || 'erro desconhecido'), 'error')
    });
  }

  // Abre a seleção de certificados; resolve true quando um certificado em nuvem fica conectado.
  function openModal() {
    return new Promise(resolve => {
      const modal = createModal();
      let result = false;
      const done = connected => { result = connected; modal.close(); };
      modal.onClose = () => resolve(result);
      modal.view('<p class="ds-status ds-loading" role="status"><span class="ds-spinner" aria-hidden="true"></span>Carregando certificados…</p>');
      refreshStatus().then(() => !modal.closed && gridView(modal, done), error => { if (!modal.closed) { gridView(modal, done); modal.setStatus(error.message, 'error'); } });
    });
  }

  async function saveRecord(code) {
    try {
      const saved = await window.saveAppointmentRecord?.({ type: documentType(), title: documentTitle(), text: $('#rxText').value.trim(), date: $('#rxDate').value });
      toast(saved?.historyReady ? `Documento assinado e salvo no histórico. Código de validação: ${code}` : `Documento assinado. Código de validação: ${code}`);
    } catch (error) { toast(error.message || 'Documento assinado, mas não foi possível salvá-lo no histórico.'); }
  }

  // Botão da prévia: assina com o certificado conectado ou abre a seleção antes.
  async function signFromPreview(preview) {
    await refreshStatus().catch(() => {});
    if (!activeSession() && !await openModal()) return false;
    const session = activeSession();
    if (!session) return false;
    const modal = createModal();
    const title = provider(session.psc).title;
    modal.view(`<div class="ds-provider">${logo(session.psc, true)}<div><b>Assinando com ${safe(title)}</b><small>Conectado até ${safe(until(session.expires_at))}</small></div></div><p class="ds-status" role="status" aria-live="polite"></p><div class="ds-actions"></div>`);
    modal.setStatus('Gerando o PDF e aplicando a assinatura ICP-Brasil com carimbo do tempo…', 'loading');
    modal.busy = true;
    try {
      const result = await signDocument(preview, { method: 'psc' });
      modal.busy = false;
      saveRecord(result.code);
      if (modal.closed) return true;
      modal.setStatus(`Documento assinado digitalmente. Código de validação: ${result.code}`, 'success');
      modal.q('.ds-actions').innerHTML = '<button type="button" class="btn outline" data-ds="close">Fechar</button><button type="button" class="btn blue" data-ds="open">Abrir PDF assinado</button>';
      modal.handlers.open = () => window.open(result.fileUrl, '_blank', 'noopener');
      return true;
    } catch (error) {
      modal.busy = false;
      if (modal.closed) return false;
      modal.setStatus(error.message, 'error');
      if (error.result?.reconnect) {
        await refreshStatus().catch(() => {});
        modal.q('.ds-actions').innerHTML = '<button type="button" class="btn blue" data-ds="reconnect">Conectar novamente</button>';
        modal.handlers.reconnect = async () => { modal.close(); if (await openModal()) signFromPreview(preview); };
      }
      return false;
    }
  }

  function addSignButton() {
    if (!status) { refreshStatus().then(() => status && addSignButton(), () => {}); return; }
    const preview = $('#printPreview');
    if (!preview || !status.enabled || !SIGNABLE.includes(documentType()) || preview.querySelector('#signDigital')) return;
    const button = document.createElement('button');
    button.className = 'btn blue'; button.id = 'signDigital'; button.textContent = '🔏 Assinar digitalmente';
    button.onclick = async () => { button.disabled = true; try { await signFromPreview(preview); } finally { button.disabled = false; } };
    preview.querySelector('#confirmPrint').before(button);
  }

  const style = document.createElement('style');
  style.textContent = `
.ds-toggle{margin-top:14px}.ds-toggle-hint{display:block;margin-bottom:14px}
.ds-modal{border:0;border-radius:16px;padding:0;width:min(560px,calc(100vw - 24px));max-height:min(92vh,760px);box-sizing:border-box;color:#172033;box-shadow:0 20px 60px #0004}
.ds-modal::backdrop{background:#0b1220aa}
.ds-head{position:sticky;top:0;z-index:1;display:flex;align-items:center;gap:8px;padding:14px 16px;background:#fff;border-bottom:1px solid #e3e8ef}
.ds-head h2{flex:1;margin:0;font-size:19px}
.ds-icon{width:38px;height:38px;border:0;border-radius:50%;background:#eef2f6;font-size:18px;cursor:pointer;color:#172033}
.ds-icon:hover,.ds-icon:focus-visible{background:#dde5ee}
.ds-body{padding:18px 18px 20px}
.ds-sub{margin:0 0 12px;font-weight:700;color:#4a5568;font-size:14px;text-transform:uppercase;letter-spacing:.04em}
.ds-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.ds-card{display:flex;flex-direction:column;align-items:flex-start;gap:10px;min-height:118px;padding:14px;border:1px solid #d5dde7;border-radius:12px;background:#fff;text-align:left;cursor:pointer;font:inherit;color:inherit;transition:border-color .15s,box-shadow .15s}
.ds-card:hover,.ds-card:focus-visible{border-color:#1f5fbf;box-shadow:0 0 0 3px #1f5fbf22;outline:0}
.ds-card-text{display:grid;gap:2px}.ds-card-text small{color:#5a6678}
.ds-logo{display:inline-grid;place-items:center;min-width:44px;height:44px;padding:0 6px;box-sizing:border-box;border-radius:10px;background:var(--ds-color,#455468);color:#fff;font-weight:800;font-size:15px;line-height:1.05;text-align:center}
.ds-logo-large{height:56px;min-width:56px;padding:0 14px;font-size:18px;border-radius:14px}
.ds-logo-local{--ds-color:#334155;font-size:12px}
.ds-tag{justify-self:start;margin-top:4px;padding:2px 8px;border-radius:999px;background:#eef2f6;color:#334155;font-style:normal;font-size:12px;font-weight:700}
.ds-tag-ok{background:#e3f6ec;color:#0b6b3f}
.ds-provider{display:flex;align-items:center;gap:14px;margin-bottom:18px}.ds-provider div{display:grid;gap:2px}.ds-provider b{font-size:18px}.ds-provider small{color:#5a6678}
.ds-field{display:grid;gap:6px;margin-bottom:14px;font-weight:700}
.ds-field select,.ds-field input{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #c3cdd9;border-radius:10px;font:inherit;font-weight:400;background:#fff;color:inherit}
.ds-field input[readonly]{background:#f4f6f9}
.ds-field small{font-weight:400;color:#5a6678}
.ds-info{padding:12px 14px;border-radius:10px;background:#f2f6fd;color:#23406e;font-size:14px;line-height:1.45}
.ds-steps{padding-left:22px;line-height:1.6}.ds-steps li{margin-bottom:6px}
.ds-certificates{list-style:none;margin:0 0 8px;padding:0;display:grid;gap:6px}.ds-certificates li{display:grid;padding:8px 10px;border:1px solid #d5dde7;border-radius:8px}.ds-certificates small{color:#5a6678}
.ds-status{display:flex;align-items:flex-start;gap:8px;min-height:1.4em;margin:14px 0 0;line-height:1.45}
.ds-status:empty{display:none}
.ds-error{color:#b42318}.ds-warning{color:#8a5a00}.ds-success{color:#0b6b3f;font-weight:700}
.ds-spinner{flex:none;width:16px;height:16px;margin-top:2px;border:2px solid #c3cdd9;border-top-color:#1f5fbf;border-radius:50%;animation:ds-spin .8s linear infinite}
@keyframes ds-spin{to{transform:rotate(360deg)}}
.ds-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:16px}
@media (max-width:480px){.ds-modal{width:100vw;max-width:100vw;max-height:100dvh;height:100dvh;border-radius:0;margin:0}.ds-grid{grid-template-columns:1fr 1fr}.ds-card{min-height:104px;padding:12px}.ds-actions .btn{flex:1 1 100%}}
@media (prefers-reduced-motion:reduce){.ds-spinner{animation-duration:2.4s}.ds-card{transition:none}}`;
  document.head.append(style);

  const openPreview = $('#printRx').onclick;
  $('#printRx').onclick = event => { openPreview(event); addSignButton(); };
  document.addEventListener('patients:load', () => refreshStatus().catch(() => {}));
  for (const id of ['#logoutButton', '#logoutRx']) $(id)?.addEventListener('click', () => {
    status = null;
    $('#useDigitalSignature')?.closest('label').remove();
    $('#digitalSignatureHint')?.remove();
  });
  refreshStatus().catch(() => {});
  window.digitalSignature = { drawValidationFooter, signDocument, waitForPsc, openModal, signFromPreview, addSignButton, refreshStatus };
})();
