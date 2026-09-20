/* Laudo de solicitação/autorização de procedimento ambulatorial (APAC). */
(() => {
  const buttons = [...document.querySelectorAll('.apac-launch')];

  const form = document.createElement('section');
  form.className = 'apac-editor hidden';
  form.setAttribute('role', 'dialog');
  form.setAttribute('aria-modal', 'true');
  form.setAttribute('aria-labelledby', 'apacEditorTitle');
  form.innerHTML = `<form class="apac-editor-panel" id="apacForm">
    <div class="apac-editor-head"><div><h2 id="apacEditorTitle">Criar APAC</h2><p>Laudo para solicitação/autorização de procedimentos ambulatoriais do SUS</p></div><button class="btn outline" type="button" id="closeApac">Fechar</button></div>
    <div class="apac-fields">
      <label class="field"><span>Procedimento</span><input id="apacProcedure" required placeholder="Nome do procedimento principal"></label>
      <label class="field"><span>Código SIGTAP do procedimento (se disponível)</span><input id="apacCode" inputmode="numeric" maxlength="12"></label>
      <label class="field"><span>Quantidade</span><input id="apacQuantity" type="number" min="1" step="1" value="1" required></label>
      <label class="field"><span>CID-10 principal</span><input id="apacCid" required maxlength="10" placeholder="Ex.: M54.5"></label>
      <label class="field apac-wide"><span>Diagnóstico</span><textarea id="apacDiagnosis" rows="3" required></textarea></label>
      <label class="field apac-wide"><span>Observações</span><textarea id="apacNotes" rows="4"></textarea></label>
    </div><div class="actions"><button class="btn blue" type="submit">Visualizar e imprimir APAC</button></div>
  </form>`;
  document.body.append(form);
  const $ = selector => document.querySelector(selector);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const date = value => value ? value.split('-').reverse().join('/') : '';
  const field = (label, value = '') => `<div class="apac-cell"><small>${label}</small><div>${escape(value) || '&nbsp;'}</div></div>`;
  const section = title => `<div class="apac-section">${title}</div>`;
  const close = () => { form.classList.add('hidden'); document.body.classList.remove('apac-editing'); };
  $('#closeApac').onclick = close;
  form.onclick = event => { if (event.target === form) close(); };
  const open = () => {
    if (!$('#patientName').value.trim()) { toast('Informe o nome do paciente antes de criar a APAC.'); $('#patientName').focus(); return; }
    form.classList.remove('hidden');
    document.body.classList.add('apac-editing');
    $('#apacProcedure').focus();
  };
  buttons.forEach(button => { button.onclick = open; });
  $('#apacForm').onsubmit = event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const patient = $('#patientName').value.trim();
    if (!patient) { close(); toast('Informe o nome do paciente.'); $('#patientName').focus(); return; }
    const procedure = $('#apacProcedure').value.trim(), code = $('#apacCode').value.trim();
    const quantity = $('#apacQuantity').value, cid = $('#apacCid').value.trim().toUpperCase();
    const diagnosis = $('#apacDiagnosis').value.trim(), notes = $('#apacNotes').value.trim();
    const place = selectedPlace || {};
    const sheet = document.createElement('article');
    sheet.className = 'apac-sheet';
    sheet.innerHTML = `<header class="apac-title"><strong>SUS · Ministério da Saúde</strong><h2>LAUDO PARA SOLICITAÇÃO/AUTORIZAÇÃO<br>DE PROCEDIMENTOS AMBULATORIAIS</h2><small>APAC · Solicitação (autorização reservada ao órgão competente)</small></header>
      ${section('IDENTIFICAÇÃO DO ESTABELECIMENTO DE SAÚDE SOLICITANTE')}
      <div class="apac-row">${field('1 · Nome do estabelecimento', place.name)}${field('2 · CNES', place.cnes)}</div>
      ${section('IDENTIFICAÇÃO DO PACIENTE')}
      <div class="apac-row">${field('3 · Nome do paciente', patient)}${field('5 · Nº do prontuário')}</div>
      <div class="apac-row">${field('4 · Sexo')}${field('6 · Cartão Nacional de Saúde (CNS)')}${field('7 · Data de nascimento', date($('#patientBirthDate').value))}</div>
      <div class="apac-row">${field('8 · Raça/cor e etnia')}${field('9 · Nome da mãe')}${field('10 · Telefone de contato')}</div>
      <div class="apac-row">${field('11 · Nome do responsável')}${field('12 · Telefone de contato')}</div>
      <div class="apac-row">${field('13 · Endereço (rua, nº, bairro)')}${field('14 · Município de residência')}${field('15 · Cód. IBGE')}</div>
      <div class="apac-row">${field('16 · UF')}${field('17 · CEP')}</div>
      ${section('PROCEDIMENTO(S) SOLICITADO(S)')}
      <div class="apac-row">${field('18 · Código do procedimento principal', code)}${field('19 · Nome do procedimento principal', procedure)}${field('20 · Qtde.', quantity)}</div>
      <div class="apac-row">${field('Procedimentos secundários (código, nome, qtde.)')}</div>
      ${section('JUSTIFICATIVA DO(S) PROCEDIMENTO(S) SOLICITADO(S)')}
      <div class="apac-row">${field('36 · Descrição do diagnóstico', diagnosis)}</div>
      <div class="apac-row">${field('37 · CID-10 principal', cid)}${field('38 · CID-10 secundário')}${field('39 · CID-10 causas associadas')}</div>
      <div class="apac-row apac-observations">${field('40 · Observações', notes)}</div>
      ${section('SOLICITAÇÃO')}
      <div class="apac-row">${field('41 · Nome do profissional solicitante', doctor.name)}${field('42 · Data da solicitação', date($('#rxDate').value || new Date().toISOString().slice(0, 10)))}</div>
      <div class="apac-row">${field('43 · Assinatura e carimbo / registro no conselho', doctor.crm)}${field('44–45 · Documento CNS/CPF do profissional')}</div>
      ${section('AUTORIZAÇÃO · PREENCHIMENTO PELO ÓRGÃO AUTORIZADOR')}
      <div class="apac-row">${field('Nome e documento do autorizador')}${field('Data, assinatura e carimbo')}</div>
      <div class="apac-row">${field('Nº da autorização (APAC)')}${field('Período de validade')}</div>
      ${section('ESTABELECIMENTO EXECUTANTE')}
      <div class="apac-row">${field('Nome do estabelecimento')}${field('CNES')}</div>`;
    close();
    $('#printPreview')?.remove();
    const preview = document.createElement('section');
    preview.id = 'printPreview';
    preview.className = 'print-overlay';
    preview.innerHTML = '<div class="preview-toolbar"><b>Prévia da APAC</b><div><button class="btn outline" id="closePreview" type="button">Voltar ao formulário</button><button class="btn blue" id="confirmPrint" type="button">🖨 Imprimir ou salvar PDF</button></div></div>';
    preview.append(sheet);
    document.body.append(preview);
    document.body.classList.add('printing');
    preview.querySelector('#closePreview').onclick = () => { preview.remove(); document.body.classList.remove('printing'); form.classList.remove('hidden'); document.body.classList.add('apac-editing'); };
    let recorded = false;
    preview.querySelector('#confirmPrint').onclick = async () => {
      if (await printPreviewPdf(preview) && !recorded) {
        printSummaryEntries.push({title:'Solicitação de APAC', patient, cpf:$('#patientDoc').value,
          birthDate:$('#patientBirthDate').value, age:patientAge($('#patientBirthDate').value),
          text:`Procedimento: ${procedure}\nCódigo SIGTAP: ${code}\nQuantidade: ${quantity}\nCID-10: ${cid}\nDiagnóstico: ${diagnosis}\nObservações: ${notes}`,
          date:$('#rxDate').value, professional:doctor.name, place:place.name || '', address:place.address || '',
          phone:place.phone || '', cnpj:place.cnpj || '', cnes:place.cnes || '', requestedAt:new Date().toLocaleString('pt-BR')});
        recorded = true;
      }
    };
  };
})();
