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
      <label class="field apac-lookup"><span>Procedimento APAC principal</span><input id="apacProcedure" required autocomplete="off" placeholder="Buscar por nome ou código SIGTAP"><div class="apac-suggestions hidden" id="apacProcedureSuggestions"></div></label>
      <label class="field"><span>Código SIGTAP</span><input id="apacCode" inputmode="numeric" maxlength="10" readonly></label>
      <label class="field"><span>Quantidade</span><input id="apacQuantity" type="number" min="1" step="1" value="1" required></label>
      <label class="field apac-lookup"><span>CID-10 principal</span><input id="apacCid" required autocomplete="off" maxlength="100" placeholder="Buscar por código ou descrição"><div class="apac-suggestions hidden" id="apacCidSuggestions"></div></label>
      <label class="field apac-wide"><span>Diagnóstico</span><textarea id="apacDiagnosis" rows="3" required></textarea></label>
      <label class="field apac-wide"><span>Observações</span><textarea id="apacNotes" rows="4"></textarea></label>
    </div><p class="apac-catalog-status" id="apacCatalogStatus" role="status">Carregando tabela SIGTAP e CID-10…</p><div class="actions"><button class="btn blue" type="submit">Gerar PDF da APAC</button></div>
  </form>`;
  document.body.append(form);
  const $ = selector => document.querySelector(selector);
  const date = value => value ? value.split('-').reverse().join('/') : '';
  let catalogPromise;
  let catalog;
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
