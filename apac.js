/* Laudo de solicitação/autorização de procedimento ambulatorial (APAC). */
(() => {
  const buttons = [...document.querySelectorAll('.apac-launch')];

  const form = document.createElement('section');
  form.className = 'apac-editor hidden';
  form.setAttribute('role', 'dialog');
  form.setAttribute('aria-modal', 'true');
  form.setAttribute('aria-labelledby', 'apacEditorTitle');
  form.innerHTML = `<div class="apac-editor-panel">
    <div class="apac-editor-head"><div><h2 id="apacEditorTitle">Criar APAC</h2><p>Laudo para solicitação/autorização de procedimentos ambulatoriais do SUS</p></div><button class="btn outline" type="button" id="closeApac">Fechar</button></div>
    <div class="apac-workspace"><aside class="apac-models" aria-label="Modelos de APAC salvos"><h3>Modelos salvos</h3><label class="field"><span>Pesquisar modelo</span><input id="apacModelSearch" type="search" placeholder="Digite o nome do modelo"></label><div id="apacModelList" class="apac-model-list" role="list"></div><button class="btn outline" type="button" id="newApacModel">Novo modelo</button></aside>
    <form id="apacForm" class="apac-form"><label class="field apac-model-name"><span>Nome do modelo</span><input id="apacModelName" maxlength="180" placeholder="Ex.: Consulta de acompanhamento"></label>
    <div class="apac-fields">
      <label class="field apac-lookup"><span>Procedimento APAC principal</span><input id="apacProcedure" required autocomplete="off" placeholder="Buscar por nome ou código SIGTAP"><div class="apac-suggestions hidden" id="apacProcedureSuggestions"></div></label>
      <label class="field"><span>Código SIGTAP</span><input id="apacCode" inputmode="numeric" maxlength="10" readonly></label>
      <label class="field"><span>Quantidade</span><input id="apacQuantity" type="number" min="1" step="1" value="1" required></label>
      <label class="field apac-lookup"><span>CID-10 principal</span><input id="apacCid" required autocomplete="off" maxlength="100" placeholder="Buscar por código ou descrição"><div class="apac-suggestions hidden" id="apacCidSuggestions"></div></label>
      <label class="field apac-wide"><span>Diagnóstico</span><textarea id="apacDiagnosis" rows="3" required></textarea></label>
      <label class="field apac-wide"><span>Observações</span><textarea id="apacNotes" rows="4"></textarea></label>
    </div><p class="apac-catalog-status" id="apacCatalogStatus" role="status">Carregando tabela SIGTAP e CID-10…</p><div class="actions"><button class="btn outline" type="button" id="saveApacModel">Salvar modelo</button><button class="btn blue" type="submit">Gerar PDF da APAC</button></div>
  </form>`;
  document.body.append(form);
  const $ = selector => document.querySelector(selector);
  const date = value => value ? value.split('-').reverse().join('/') : '';
  let catalogPromise;
  let catalog;
  let models = [];
  let editingModelId = null;
  const localModelsKey = 'clinicaFlowApacModels';
  const localMode = ['127.0.0.1', 'localhost'].includes(location.hostname);
  const modelFields = ['procedure', 'code', 'quantity', 'cid', 'diagnosis', 'notes'];
  const modelValues = () => Object.fromEntries(modelFields.map(field => [field, $(`#apac${field[0].toUpperCase()}${field.slice(1)}`).value.trim()]));
  const api = async (action, data = {}) => {
    const response = await fetch(`api/index.php?action=${encodeURIComponent(action)}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || 'Não foi possível concluir a operação.');
    return result;
  };
  const renderModels = () => {
    const list = $('#apacModelList');
    const query = normal($('#apacModelSearch').value);
    const matches = [...models].filter(model => normal(model.name).includes(query)).sort((a, b) => new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true }).compare(a.name, b.name));
    list.replaceChildren();
    if (!matches.length) { const empty = document.createElement('p'); empty.className = 'apac-model-empty'; empty.textContent = query ? 'Nenhum modelo encontrado.' : 'Nenhum modelo salvo.'; list.append(empty); return; }
    for (const model of matches) {
      const row = document.createElement('div'); row.className = 'apac-model-item'; row.setAttribute('role', 'listitem');
      const use = document.createElement('button'); use.type = 'button'; use.className = 'apac-model-use'; use.textContent = model.name; use.title = `Usar modelo ${model.name}`;
      use.onclick = () => { editingModelId = model.id; $('#apacModelName').value = model.name; for (const field of modelFields) $(`#apac${field[0].toUpperCase()}${field.slice(1)}`).value = model.values[field] || ''; $('#apacProcedure').focus(); };
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'apac-model-delete'; remove.textContent = 'Excluir'; remove.title = `Excluir modelo ${model.name}`;
      remove.onclick = async () => { if (!confirm(`Excluir o modelo “${model.name}”?`)) return; remove.disabled = true; try { if (localMode) { models = models.filter(item => item.id !== model.id); localStorage.setItem(localModelsKey, JSON.stringify(models)); } else { await api('models.delete', { category: 'apac', id: model.id }); await loadModels(); } if (editingModelId === model.id) editingModelId = null; renderModels(); toast('Modelo excluído'); } catch (error) { toast(error.message); remove.disabled = false; } };
      row.append(use, remove); list.append(row);
    }
  };
  const loadModels = async () => {
    if (localMode) { try { const saved = JSON.parse(localStorage.getItem(localModelsKey)); models = Array.isArray(saved) ? saved : []; } catch { models = []; } }
    else { const result = await api('models.list', { category: 'apac' }); models = result.items.map(item => { let values = {}; try { values = JSON.parse(item.text); } catch {} return { id: String(item.id), name: item.name, values }; }); }
    renderModels();
  };
  $('#apacModelSearch').oninput = renderModels;
  $('#newApacModel').onclick = () => { editingModelId = null; $('#apacForm').reset(); $('#apacCode').value = ''; $('#apacModelName').focus(); };
  $('#saveApacModel').onclick = async () => {
    const name = $('#apacModelName').value.trim();
    if (!name) { toast('Informe o nome do modelo.'); $('#apacModelName').focus(); return; }
    if (!$('#apacForm').reportValidity()) return;
    if (catalog && !catalog.procedures.some(item => item.code === $('#apacCode').value && item.name === $('#apacProcedure').value)) { toast('Selecione um procedimento APAC da lista.'); $('#apacProcedure').focus(); return; }
    const cid = $('#apacCid').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (catalog && !catalog.cids.some(item => item.code === cid)) { toast('Selecione um CID-10 válido da tabela.'); $('#apacCid').focus(); return; }
    const button = $('#saveApacModel'); button.disabled = true;
    try {
      const values = modelValues();
      if (localMode) { const id = editingModelId || `apac-${Date.now()}`; models = models.filter(item => item.id !== id); models.push({ id, name, values }); localStorage.setItem(localModelsKey, JSON.stringify(models)); editingModelId = id; }
      else { const result = await api('models.save', { id: editingModelId, category: 'apac', name, type: 'apac', text: JSON.stringify(values) }); editingModelId = String(result.id); await loadModels(); }
      renderModels(); toast('Modelo de APAC salvo');
    } catch (error) { toast(error.message); } finally { button.disabled = false; }
  };
  const normal = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const cidDisplay = code => code.length === 4 ? `${code.slice(0, 3)}.${code[3]}` : code;
  const setProcedure = item => { $('#apacProcedure').value = item.name; $('#apacCode').value = item.code; $('#apacProcedureSuggestions').classList.add('hidden'); };
  const setCid = item => {
    $('#apacCid').value = cidDisplay(item.code);
    if (!$('#apacDiagnosis').value.trim()) $('#apacDiagnosis').value = item.name;
    $('#apacCidSuggestions').classList.add('hidden');
  };
  const suggest = (input, box, items, label, select) => {
    const query = normal(input.value).replace(/[^a-z0-9]/g, '');
    if (!query || !catalog) { box.classList.add('hidden'); return; }
    const matches = [];
    for (const item of items) {
      if (normal(item.code).includes(query) || normal(item.name).replace(/[^a-z0-9]/g, '').includes(query)) matches.push(item);
      if (matches.length === 12) break;
    }
    box.replaceChildren();
    for (const item of matches) {
      const option = document.createElement('button');
      option.type = 'button';
      option.textContent = label(item);
      option.onmousedown = event => event.preventDefault();
      option.onclick = () => select(item);
      box.append(option);
    }
    box.classList.toggle('hidden', !matches.length);
  };
  const loadCatalog = () => {
    if (!catalogPromise) catalogPromise = fetch('apac-catalog.json?v=202609-layout', { cache: 'force-cache' })
      .then(response => { if (!response.ok) throw new Error('Catálogo indisponível'); return response.json(); })
      .then(data => {
        if (!Array.isArray(data.procedures) || !Array.isArray(data.cids)) throw new Error('Catálogo inválido');
        catalog = data;
        $('#apacCatalogStatus').textContent = `SIGTAP ${data.competence.slice(4)}/${data.competence.slice(0, 4)} · ${data.procedures.length} procedimentos APAC principais · ${data.cids.length} códigos CID-10`;
      }).catch(() => {
        catalogPromise = undefined;
        $('#apacCatalogStatus').textContent = 'Não foi possível carregar a tabela. Verifique a conexão e abra a APAC novamente.';
      });
    return catalogPromise;
  };
  $('#apacProcedure').oninput = () => {
    $('#apacCode').value = '';
    suggest($('#apacProcedure'), $('#apacProcedureSuggestions'), catalog?.procedures || [], item => `${item.code} · ${item.name}`, setProcedure);
  };
  $('#apacCid').oninput = () => suggest($('#apacCid'), $('#apacCidSuggestions'), catalog?.cids || [], item => `${cidDisplay(item.code)} · ${item.name}`, setCid);
  $('#apacProcedure').onblur = () => setTimeout(() => {
    $('#apacProcedureSuggestions').classList.add('hidden');
    const value = normal($('#apacProcedure').value);
    const item = catalog?.procedures.find(entry => normal(entry.code) === value || normal(entry.name) === value);
    if (item) setProcedure(item);
  }, 150);
  $('#apacCid').onblur = () => setTimeout(() => {
    $('#apacCidSuggestions').classList.add('hidden');
    const code = $('#apacCid').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const item = catalog?.cids.find(entry => entry.code === code);
    if (item) setCid(item);
  }, 150);
  const close = () => { form.classList.add('hidden'); document.body.classList.remove('apac-editing'); };
  $('#closeApac').onclick = close;
  form.onclick = event => { if (event.target === form) close(); };
  const open = () => {
    if (!validDoctorCpf(doctor.cpf)) {
      toast('Preencha seu CPF em Meu perfil antes de gerar a APAC.');
      document.querySelector('#rxScreen .open-profile').click();
      $('#profileCpf').focus();
      return;
    }
    if (!$('#patientName').value.trim()) { toast('Informe o nome do paciente antes de criar a APAC.'); $('#patientName').focus(); return; }
    form.classList.remove('hidden');
    document.body.classList.add('apac-editing');
    loadModels().catch(error => toast(error.message));
    $('#apacProcedure').focus();
    loadCatalog();
  };
  buttons.forEach(button => { button.onclick = open; });
  $('#apacForm').onsubmit = event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    if (catalog) {
      const procedure = catalog.procedures.find(item => item.code === $('#apacCode').value && item.name === $('#apacProcedure').value);
      if (!procedure) { toast('Selecione um procedimento APAC da lista.'); $('#apacProcedure').focus(); return; }
      const cid = $('#apacCid').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!catalog.cids.some(item => item.code === cid)) { toast('Selecione um CID-10 válido da tabela.'); $('#apacCid').focus(); return; }
    }
    const patient = $('#patientName').value.trim();
    if (!patient) { close(); toast('Informe o nome do paciente.'); $('#patientName').focus(); return; }
    const procedure = $('#apacProcedure').value.trim(), code = $('#apacCode').value.trim();
    const quantity = $('#apacQuantity').value, cid = $('#apacCid').value.trim().toUpperCase();
    const diagnosis = $('#apacDiagnosis').value.trim(), notes = $('#apacNotes').value.trim();
    const place = selectedPlace || {};
    const submit = event.currentTarget.querySelector('button[type="submit"]');
    submit.disabled = true;
    const originalLabel = submit.textContent;
    submit.textContent = 'Preparando PDF…';
    const values = {
      cnes: place.cnes || '', patient,
      birthDate: date($('#patientBirthDate').value), code, procedure, quantity,
      cid, diagnosis, notes, professional: doctor.name || '', professionalCpf: doctor.cpf,
      date: date($('#rxDate').value || new Date().toISOString().slice(0, 10))
    };
    openApacTemplatePdf(values).then(success => {
      if (!success) return;
      close();
      printSummaryEntries.push({title:'Solicitação de APAC', patient, cpf:$('#patientDoc').value,
        birthDate:$('#patientBirthDate').value, age:patientAge($('#patientBirthDate').value),
        text:`Procedimento: ${procedure}\nCódigo SIGTAP: ${code}\nQuantidade: ${quantity}\nCID-10: ${cid}\nDiagnóstico: ${diagnosis}\nObservações: ${notes}`,
        date:$('#rxDate').value, professional:doctor.name, place:place.name || '', address:place.address || '',
        phone:place.phone || '', cnpj:place.cnpj || '', cnes:place.cnes || '', requestedAt:new Date().toLocaleString('pt-BR')});
    }).finally(() => { submit.disabled = false; submit.textContent = originalLabel; });
  };
})();
