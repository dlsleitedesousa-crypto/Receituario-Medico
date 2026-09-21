/* Solicitação de autorização de internação hospitalar (AIH). */
(() => {
  const launch = document.querySelector('#createAih');
  if (!launch) return;
  const dialog = document.createElement('section');
  dialog.className = 'apac-editor hidden';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'aihEditorTitle');
  dialog.innerHTML = `<div class="apac-editor-panel">
    <div class="apac-editor-head"><div><h2 id="aihEditorTitle">Criar AIH</h2><p>Laudo para solicitação de autorização de internação hospitalar</p></div><button class="btn outline" type="button" id="closeAih">Fechar</button></div>
    <div class="apac-workspace"><aside class="apac-models" aria-label="Modelos de AIH salvos"><h3>Modelos salvos</h3><label class="field"><span>Pesquisar modelo</span><input id="aihModelSearch" type="search" placeholder="Digite o nome do modelo"></label><div id="aihModelList" class="apac-model-list" role="list"></div><button class="btn outline" type="button" id="newAihModel">Novo modelo</button></aside>
    <form id="aihForm" class="apac-form"><label class="field apac-model-name"><span>Nome do modelo</span><input id="aihModelName" maxlength="180" placeholder="Ex.: Internação clínica"></label>
      <h3>Estabelecimento e paciente</h3><div class="apac-fields">
      <label class="field"><span>Estabelecimento executante</span><input id="aihExecutorName"></label><label class="field"><span>CNES executante</span><input id="aihExecutorCnes" inputmode="numeric"></label><label class="field"><span>Nº do prontuário</span><input id="aihRecordNumber"></label>
      <label class="field"><span>Cartão Nacional de Saúde (CNS)</span><input id="aihCns" inputmode="numeric"></label><label class="field"><span>Sexo</span><select id="aihSex"><option value="">Selecione</option><option>Masculino</option><option>Feminino</option></select></label><label class="field"><span>Raça/cor (código)</span><input id="aihRace" maxlength="2"></label>
      <label class="field"><span>Nome da mãe</span><input id="aihMother"></label><label class="field"><span>Telefone de contato</span><input id="aihContact"></label><label class="field"><span>Responsável</span><input id="aihResponsible"></label><label class="field"><span>Telefone do responsável</span><input id="aihResponsibleContact"></label>
      <label class="field apac-wide"><span>Endereço do paciente</span><input id="aihAddress"></label><label class="field"><span>Município</span><input id="aihCity"></label><label class="field"><span>Código IBGE do município</span><input id="aihCityCode" inputmode="numeric"></label><label class="field"><span>UF / CEP</span><div class="aih-inline aih-uf"><input id="aihState" maxlength="2" placeholder="UF"><input id="aihPostcode" placeholder="CEP"></div></label>
      </div><h3>Justificativa da internação</h3><div class="apac-fields">
      <label class="field apac-wide"><span>Principais sinais e sintomas clínicos</span><textarea id="aihSymptoms" rows="4" required></textarea></label>
      <label class="field apac-wide"><span>Condições que justificam a internação</span><textarea id="aihConditions" rows="3" required></textarea></label>
      <label class="field apac-wide"><span>Principais resultados de provas diagnósticas</span><textarea id="aihTests" rows="3"></textarea></label>
      <label class="field"><span>Diagnóstico inicial</span><input id="aihDiagnosis" required></label><label class="field"><span>CID-10 principal</span><input id="aihCid" required></label><label class="field"><span>CID-10 secundário</span><input id="aihSecondaryCid"></label><label class="field"><span>CID-10 causas associadas</span><input id="aihAssociatedCid"></label>
      </div><h3>Procedimento solicitado</h3><div class="apac-fields">
      <label class="field apac-wide"><span>Descrição do procedimento</span><input id="aihProcedure" required></label><label class="field"><span>Código SIGTAP</span><input id="aihCode" inputmode="numeric" maxlength="10" required></label><label class="field"><span>Clínica</span><input id="aihClinic"></label><label class="field"><span>Caráter da internação</span><input id="aihAdmission"></label>
      </div><h3>Causas externas (se aplicável)</h3><div class="apac-fields">
      <label class="field"><span>Tipo de acidente</span><select id="aihAccident"><option value="">Não se aplica</option><option value="transito">Acidente de trânsito</option><option value="trabalho">Acidente de trabalho típico</option><option value="trajeto">Acidente de trabalho no trajeto</option></select></label>
      <label class="field"><span>CNPJ da seguradora</span><input id="aihInsurer"></label><label class="field"><span>Nº do bilhete / série</span><div class="aih-inline"><input id="aihTicket" placeholder="Bilhete"><input id="aihSeries" placeholder="Série"></div></label>
      <label class="field"><span>CNPJ da empresa</span><input id="aihCompany"></label><label class="field"><span>CNAE</span><input id="aihCnae"></label><label class="field"><span>CBOR</span><input id="aihCbor"></label>
      <label class="field"><span>Vínculo com a Previdência</span><select id="aihSocialSecurity"><option value="">Não informado</option><option>Empregado</option><option>Empregador</option><option>Autônomo</option><option>Desempregado</option><option>Aposentado</option><option>Não segurado</option></select></label>
      </div><p class="apac-catalog-status">Os dados do paciente e do profissional são preenchidos com os dados do atendimento. Confira o formulário antes de imprimir.</p><div class="actions apac-actions"><button class="btn outline" type="button" id="saveAihModel">Salvar modelo</button><button class="btn blue" type="submit">Gerar PDF da AIH</button></div>
    </form></div></div>`;
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  const normal = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const date = value => value ? value.split('-').reverse().join('/') : '';
  const reusable = ['symptoms', 'conditions', 'tests', 'diagnosis', 'cid', 'secondaryCid', 'associatedCid', 'procedure', 'code', 'clinic', 'admission'];
  const field = name => $(`#aih${name[0].toUpperCase()}${name.slice(1)}`);
  const valuesForModel = () => Object.fromEntries(reusable.map(name => [name, field(name).value.trim()]));
  const localMode = ['127.0.0.1', 'localhost'].includes(location.hostname);
  const localKey = 'clinicaFlowAihModels';
  let models = [], editingId = null;
  const api = async (action, data = {}) => {
    const response = await fetch(`api/index.php?action=${encodeURIComponent(action)}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || 'Não foi possível concluir a operação.');
    return result;
  };
  const render = () => {
    const list = $('#aihModelList'), query = normal($('#aihModelSearch').value);
    const matches = models.filter(model => normal(model.name).includes(query)).sort((a, b) => new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true }).compare(a.name, b.name));
    list.replaceChildren();
    if (!matches.length) { const empty = document.createElement('p'); empty.className = 'apac-model-empty'; empty.textContent = query ? 'Nenhum modelo encontrado.' : 'Nenhum modelo salvo.'; list.append(empty); return; }
    for (const model of matches) {
      const row = document.createElement('div'); row.className = 'apac-model-item'; row.setAttribute('role', 'listitem');
      const use = document.createElement('button'); use.type = 'button'; use.className = 'apac-model-use'; use.textContent = model.name;
      use.onclick = () => { editingId = model.id; $('#aihModelName').value = model.name; reusable.forEach(name => { field(name).value = model.values[name] || ''; }); $('#aihSymptoms').focus(); };
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'apac-model-delete'; remove.textContent = 'Excluir';
      remove.onclick = async () => { if (!confirm(`Excluir o modelo “${model.name}”?`)) return; remove.disabled = true; try { if (localMode) { models = models.filter(item => item.id !== model.id); localStorage.setItem(localKey, JSON.stringify(models)); } else { await api('models.delete', { category: 'aih', id: model.id }); await load(); } if (editingId === model.id) editingId = null; render(); toast('Modelo excluído'); } catch (error) { toast(error.message); remove.disabled = false; } };
      row.append(use, remove); list.append(row);
    }
  };
  const load = async () => {
    if (localMode) { try { const saved = JSON.parse(localStorage.getItem(localKey)); models = Array.isArray(saved) ? saved : []; } catch { models = []; } }
    else { const result = await api('models.list', { category: 'aih' }); models = result.items.map(item => { let values = {}; try { values = JSON.parse(item.text); } catch {} return { id: String(item.id), name: item.name, values }; }); }
    render();
  };
  $('#aihModelSearch').oninput = render;
  $('#newAihModel').onclick = () => { editingId = null; reusable.forEach(name => { field(name).value = ''; }); $('#aihModelName').value = ''; $('#aihModelName').focus(); };
  $('#saveAihModel').onclick = async () => {
    const name = $('#aihModelName').value.trim();
    if (!name) { toast('Informe o nome do modelo.'); $('#aihModelName').focus(); return; }
    if (!$('#aihForm').reportValidity()) return;
    const button = $('#saveAihModel'); button.disabled = true;
    try {
      const values = valuesForModel();
      if (localMode) { const id = editingId || `aih-${Date.now()}`; models = models.filter(item => item.id !== id); models.push({ id, name, values }); localStorage.setItem(localKey, JSON.stringify(models)); editingId = id; }
      else { const result = await api('models.save', { id: editingId, category: 'aih', name, type: 'aih', text: JSON.stringify(values) }); editingId = String(result.id); await load(); }
      render(); toast('Modelo de AIH salvo');
    } catch (error) { toast(error.message); } finally { button.disabled = false; }
  };
  const close = () => { dialog.classList.add('hidden'); document.body.classList.remove('aih-editing'); };
  $('#closeAih').onclick = close;
  dialog.onclick = event => { if (event.target === dialog) close(); };
  launch.onclick = () => {
    if (!document.querySelector('#patientName').value.trim()) { toast('Informe o nome do paciente antes de criar a AIH.'); document.querySelector('#patientName').focus(); return; }
    dialog.classList.remove('hidden'); document.body.classList.add('aih-editing'); load().catch(error => toast(error.message)); $('#aihSymptoms').focus();
  };
  $('#aihForm').onsubmit = async event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const patient = document.querySelector('#patientName').value.trim();
    if (!patient) { toast('Informe o nome do paciente.'); close(); return; }
    const code = $('#aihCode').value.replace(/\D/g, '');
    if (code.length !== 10) { toast('O código SIGTAP deve ter 10 dígitos.'); $('#aihCode').focus(); return; }
    const place = selectedPlace || {};
    const values = { ...valuesForModel(), placeName: place.name || '', cnes: place.cnes || '', executorName: $('#aihExecutorName').value.trim(), executorCnes: $('#aihExecutorCnes').value.trim(), patient, birthDate: date(document.querySelector('#patientBirthDate').value), professional: doctor.name || '', professionalCpf: doctor.cpf || '', date: date(document.querySelector('#rxDate').value || new Date().toISOString().slice(0, 10)) };
    for (const name of ['recordNumber', 'cns', 'sex', 'race', 'mother', 'contact', 'responsible', 'responsibleContact', 'address', 'city', 'cityCode', 'state', 'postcode', 'accident', 'insurer', 'ticket', 'series', 'company', 'cnae', 'cbor', 'socialSecurity']) values[name] = field(name).value.trim();
    const button = event.currentTarget.querySelector('button[type="submit"]'), label = button.textContent;
    button.disabled = true; button.textContent = 'Preparando PDF…';
    try { if (await openAihTemplatePdf(values)) { close(); printSummaryEntries.push({ title: 'Solicitação de AIH', patient, cpf: document.querySelector('#patientDoc').value, birthDate: document.querySelector('#patientBirthDate').value, age: patientAge(document.querySelector('#patientBirthDate').value), text: `Procedimento: ${values.procedure}\nCódigo SIGTAP: ${code}\nCID-10: ${values.cid}\nDiagnóstico: ${values.diagnosis}`, date: document.querySelector('#rxDate').value, professional: doctor.name, place: place.name || '', address: place.address || '', phone: place.phone || '', cnpj: place.cnpj || '', cnes: place.cnes || '', requestedAt: new Date().toLocaleString('pt-BR') }); } }
    finally { button.disabled = false; button.textContent = label; }
  };
})();
