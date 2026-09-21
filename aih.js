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
      <div class="apac-fields">
        <label class="field apac-lookup apac-wide"><span>Procedimento AIH principal</span><input id="aihProcedure" required autocomplete="off" placeholder="Buscar por nome ou código SIGTAP"><div class="apac-suggestions hidden" id="aihProcedureSuggestions"></div></label>
        <label class="field"><span>Código SIGTAP</span><input id="aihCode" inputmode="numeric" maxlength="10" readonly required></label>
        <label class="field apac-lookup"><span>CID-10 principal</span><input id="aihCid" required autocomplete="off" placeholder="Buscar por código ou descrição"><div class="apac-suggestions hidden" id="aihCidSuggestions"></div></label>
        <label class="field apac-wide"><span>Diagnóstico inicial</span><input id="aihDiagnosis" required placeholder="Preenchido ao selecionar o CID-10; ajuste se precisar resumir para o PDF"></label>
        <label class="field apac-wide"><span>Sinais e Sintomas</span><textarea id="aihSymptoms" rows="4" required></textarea></label>
        <label class="field apac-wide"><span>Condições que justificam</span><textarea id="aihConditions" rows="3" required></textarea></label>
        <label class="field apac-wide"><span>Principais resultados diagnósticos</span><textarea id="aihTests" rows="3"></textarea></label>
      </div><p class="apac-catalog-status" id="aihCatalogStatus" role="status">Carregando procedimentos AIH e CID-10 do SIGTAP…</p><div class="actions apac-actions"><button class="btn outline" type="button" id="saveAihModel">Salvar modelo</button><button class="btn blue" type="submit">Gerar PDF da AIH</button></div>
    </form></div></div>`;
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  const normal = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const date = value => value ? value.split('-').reverse().join('/') : '';
  const reusable = ['procedure', 'code', 'cid', 'diagnosis', 'symptoms', 'conditions', 'tests'];
  const field = name => $(`#aih${name[0].toUpperCase()}${name.slice(1)}`);
  const valuesForModel = () => Object.fromEntries(reusable.map(name => [name, field(name).value.trim()]));
  const localMode = ['127.0.0.1', 'localhost'].includes(location.hostname);
  const localKey = 'clinicaFlowAihModels';
  let models = [], editingId = null, catalog, catalogPromise;
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
      use.onclick = () => { editingId = model.id; $('#aihModelName').value = model.name; reusable.forEach(name => { field(name).value = model.values[name] || ''; }); if (!$('#aihDiagnosis').value) syncDiagnosis(); $('#aihProcedure').focus(); };
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'apac-model-delete'; remove.textContent = 'Excluir';
      remove.onclick = async () => { if (!confirm(`Excluir o modelo “${model.name}”?`)) return; remove.disabled = true; try { if (localMode) { models = models.filter(item => item.id !== model.id); localStorage.setItem(localKey, JSON.stringify(models)); } else { await api('models.delete', { category: 'aih', id: model.id }); await loadModels(); } if (editingId === model.id) editingId = null; render(); toast('Modelo excluído'); } catch (error) { toast(error.message); remove.disabled = false; } };
      row.append(use, remove); list.append(row);
    }
  };
  const loadModels = async () => {
    if (localMode) { try { const saved = JSON.parse(localStorage.getItem(localKey)); models = Array.isArray(saved) ? saved : []; } catch { models = []; } }
    else { const result = await api('models.list', { category: 'aih' }); models = result.items.map(item => { let values = {}; try { values = JSON.parse(item.text); } catch {} return { id: String(item.id), name: item.name, values }; }); }
    render();
  };
  const loadCatalog = () => {
    if (!catalogPromise) catalogPromise = Promise.all([
      fetch('aih-catalog.json?v=20260921-sigtap', { cache: 'force-cache' }),
      fetch('apac-catalog.json?v=202609-layout', { cache: 'force-cache' })
    ]).then(async responses => {
      if (responses.some(response => !response.ok)) throw new Error('Catálogo SIGTAP indisponível.');
      const [aih, apac] = await Promise.all(responses.map(response => response.json()));
      if (!Array.isArray(aih.procedures) || !Array.isArray(apac.cids) || aih.competence !== apac.competence) throw new Error('Catálogo SIGTAP inválido.');
      catalog = { procedures: aih.procedures, cids: apac.cids };
      if (!$('#aihDiagnosis').value) syncDiagnosis();
      $('#aihCatalogStatus').textContent = `SIGTAP ${aih.competence.slice(4)}/${aih.competence.slice(0, 4)} · ${aih.procedures.length} procedimentos AIH principais · ${apac.cids.length} códigos CID-10`;
    }).catch(error => { catalogPromise = undefined; $('#aihCatalogStatus').textContent = 'Não foi possível carregar a tabela SIGTAP. Verifique a conexão e abra a AIH novamente.'; throw error; });
    return catalogPromise;
  };
  const suggest = (input, box, items, label, select) => {
    const query = normal(input.value).replace(/[^a-z0-9]/g, '');
    if (!query || !catalog) { box.classList.add('hidden'); return; }
    const matches = [];
    for (const item of items) { if (normal(item.code).includes(query) || normal(item.name).replace(/[^a-z0-9]/g, '').includes(query)) matches.push(item); if (matches.length === 12) break; }
    box.replaceChildren();
    for (const item of matches) { const option = document.createElement('button'); option.type = 'button'; option.textContent = label(item); option.onmousedown = event => event.preventDefault(); option.onclick = () => select(item); box.append(option); }
    box.classList.toggle('hidden', !matches.length);
  };
  const cidDisplay = code => code.length === 4 ? `${code.slice(0, 3)}.${code[3]}` : code;
  const setProcedure = item => { $('#aihProcedure').value = item.name; $('#aihCode').value = item.code; $('#aihProcedureSuggestions').classList.add('hidden'); };
  const syncDiagnosis = () => { const code = $('#aihCid').value.toUpperCase().replace(/[^A-Z0-9]/g, ''); $('#aihDiagnosis').value = catalog?.cids.find(item => item.code === code)?.name || ''; };
  const setCid = item => { $('#aihCid').value = cidDisplay(item.code); $('#aihDiagnosis').value = item.name; $('#aihCidSuggestions').classList.add('hidden'); };
  $('#aihProcedure').oninput = () => { $('#aihCode').value = ''; suggest($('#aihProcedure'), $('#aihProcedureSuggestions'), catalog?.procedures || [], item => `${item.code} · ${item.name}`, setProcedure); };
  $('#aihCid').oninput = () => { syncDiagnosis(); suggest($('#aihCid'), $('#aihCidSuggestions'), catalog?.cids || [], item => `${cidDisplay(item.code)} · ${item.name}`, setCid); };
  $('#aihProcedure').onblur = () => setTimeout(() => { $('#aihProcedureSuggestions').classList.add('hidden'); const value = normal($('#aihProcedure').value); const item = catalog?.procedures.find(entry => normal(entry.code) === value || normal(entry.name) === value); if (item) setProcedure(item); }, 150);
  $('#aihCid').onblur = () => setTimeout(() => { $('#aihCidSuggestions').classList.add('hidden'); const code = $('#aihCid').value.toUpperCase().replace(/[^A-Z0-9]/g, ''); const item = catalog?.cids.find(entry => entry.code === code); if (item) setCid(item); }, 150);
  const validateCatalog = () => {
    if (!catalog) { toast('Aguarde o carregamento da tabela SIGTAP.'); return false; }
    if (!catalog.procedures.some(item => item.code === $('#aihCode').value && item.name === $('#aihProcedure').value)) { toast('Selecione um procedimento AIH da lista.'); $('#aihProcedure').focus(); return false; }
    const cid = $('#aihCid').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!catalog.cids.some(item => item.code === cid)) { toast('Selecione um CID-10 válido da lista.'); $('#aihCid').focus(); return false; }
    return true;
  };
  $('#aihModelSearch').oninput = render;
  $('#newAihModel').onclick = () => { editingId = null; reusable.forEach(name => { field(name).value = ''; }); $('#aihDiagnosis').value = ''; $('#aihModelName').value = ''; $('#aihModelName').focus(); };
  $('#saveAihModel').onclick = async () => {
    const name = $('#aihModelName').value.trim();
    if (!name) { toast('Informe o nome do modelo.'); $('#aihModelName').focus(); return; }
    if (!$('#aihForm').reportValidity() || !validateCatalog()) return;
    const button = $('#saveAihModel'); button.disabled = true;
    try {
      const values = valuesForModel();
      if (localMode) { const id = editingId || `aih-${Date.now()}`; models = models.filter(item => item.id !== id); models.push({ id, name, values }); localStorage.setItem(localKey, JSON.stringify(models)); editingId = id; }
      else { const result = await api('models.save', { id: editingId, category: 'aih', name, type: 'aih', text: JSON.stringify(values) }); editingId = String(result.id); await loadModels(); }
      render(); toast('Modelo de AIH salvo');
    } catch (error) { toast(error.message); } finally { button.disabled = false; }
  };
  const close = () => { dialog.classList.add('hidden'); document.body.classList.remove('aih-editing'); };
  $('#closeAih').onclick = close;
  dialog.onclick = event => { if (event.target === dialog) close(); };
  launch.onclick = () => {
    if (!document.querySelector('#patientName').value.trim()) { toast('Informe o nome do paciente antes de criar a AIH.'); document.querySelector('#patientName').focus(); return; }
    dialog.classList.remove('hidden'); document.body.classList.add('aih-editing');
    loadModels().catch(error => toast(error.message)); loadCatalog().catch(error => toast(error.message)); $('#aihProcedure').focus();
  };
  $('#aihForm').onsubmit = async event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity() || !validateCatalog()) return;
    const patient = document.querySelector('#patientName').value.trim();
    if (!patient) { toast('Informe o nome do paciente.'); close(); return; }
    const place = selectedPlace || {}, reusableValues = valuesForModel();
    const cidCode = reusableValues.cid.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const values = { ...reusableValues, cid: cidDisplay(cidCode), diagnosis: $('#aihDiagnosis').value, placeName: place.name || '', cnes: place.cnes || '', patient, birthDate: date(document.querySelector('#patientBirthDate').value), professional: doctor.name || '', professionalCpf: doctor.cpf || '', date: date(document.querySelector('#rxDate').value || new Date().toISOString().slice(0, 10)) };
    const button = event.currentTarget.querySelector('button[type="submit"]'), label = button.textContent;
    button.disabled = true; button.textContent = 'Preparando PDF…';
    try { if (await openAihTemplatePdf(values)) { close(); printSummaryEntries.push({ title: 'Solicitação de AIH', patient, cpf: document.querySelector('#patientDoc').value, birthDate: document.querySelector('#patientBirthDate').value, age: patientAge(document.querySelector('#patientBirthDate').value), text: `Procedimento: ${values.procedure}\nCódigo SIGTAP: ${values.code}\nCID-10: ${values.cid}\nSinais e sintomas: ${values.symptoms}\nCondições: ${values.conditions}\nResultados diagnósticos: ${values.tests}`, date: document.querySelector('#rxDate').value, professional: doctor.name, place: place.name || '', address: place.address || '', phone: place.phone || '', cnpj: place.cnpj || '', cnes: place.cnes || '', requestedAt: new Date().toLocaleString('pt-BR') }); } }
    finally { button.disabled = false; button.textContent = label; }
  };
})();
