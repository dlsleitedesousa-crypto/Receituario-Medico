/* Cadastro de pacientes e histórico de atendimentos por profissional. */
(() => {
  const list = document.querySelector('#patientList');
  const search = document.querySelector('#patientSearch');
  const detail = document.querySelector('#patientDetail');
  const history = document.querySelector('#patientHistory');
  const placesTab = document.querySelector('#placesTab');
  const patientsTab = document.querySelector('#patientsTab');
  const patientsPanel = document.querySelector('#patientsPanel');
  const registrationForm = document.querySelector('#patientRegistrationForm');
  const registrationHeading = registrationForm.querySelector('h2');
  const registrationButton = document.querySelector('#registerPatientButton');
  const optionalFields = {
    sex:'Sex',gender:'Gender',rg:'Rg',rg_issuer:'RgIssuer',marital_status:'MaritalStatus',
    passport:'Passport',birth_certificate:'BirthCertificate',email:'Email',landline:'Landline',other_phone:'OtherPhone',
    postal_code:'PostalCode',street:'Street',number:'Number',complement:'Complement',neighborhood:'Neighborhood',
    city:'City',state:'State',ibge_code:'IbgeCode',birthplace:'Birthplace',insurance:'Insurance',
    insurance_plan:'InsurancePlan',insurance_card:'InsuranceCard',notes:'Notes'
  };
  const registrationInputs = Object.fromEntries(Object.entries({name:'Name',cpf:'Cpf',birth_date:'BirthDate',phone:'Phone',...optionalFields})
    .map(([key,suffix])=>[key,document.querySelector('#newPatient'+suffix)]));
  const registrationError = document.querySelector('#patientRegistrationError');
  const directoryHost = document.querySelector('#patientDirectoryHost');
  let page = 1;
  const cancelEditButton = document.createElement('button');
  cancelEditButton.type = 'button';
  cancelEditButton.className = 'btn outline hidden';
  cancelEditButton.textContent = 'Cancelar edição';
  registrationButton.before(cancelEditButton);
  let editingPatientId = null;
  const stopEditing = () => {
    editingPatientId = null;
    registrationForm.reset();
    registrationHeading.textContent = 'Cadastrar paciente';
    registrationButton.textContent = 'Salvar novo paciente';
    cancelEditButton.classList.add('hidden');
    registrationError.textContent = '';
    registrationForm.classList.add('hidden');
    directoryHost.classList.remove('hidden');
  };
  cancelEditButton.onclick = stopEditing;
  document.querySelector('#patientDirectoryHost').append(patientsPanel);
  patientsPanel.classList.remove('hidden');
  const selectTab = target => {
    show(target === 'patients' ? '#patientsScreen' : '#placesScreen');
  };
  placesTab.onclick = () => selectTab('places');
  patientsTab.onclick = () => { selectTab('patients'); load().catch(notifyError); };
  document.querySelector('#backFromPatients').onclick = () => selectTab('places');
  let patients = [];
  let patientsLoaded = false;
  const request = async (action, data = {}) => {
    const response = await fetch(`api/index.php?action=${encodeURIComponent(action)}`, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || 'Não foi possível salvar os dados.');
    return result;
  };
  const notifyError = error => toast(error.message || 'Falha na comunicação com o servidor.');
  const patientData = () => ({
    name: document.querySelector('#patientName').value.trim(),
    cpf: document.querySelector('#patientDoc').value.replace(/\D/g, ''),
    birth_date: document.querySelector('#patientBirthDate').value
  });
  const registrationData = () => Object.fromEntries(Object.entries(registrationInputs)
    .map(([key,input])=>[key,key==='cpf'?input.value.replace(/\D/g,''):input.value.trim()]));
  document.querySelector('#newPatientBirthDate').max = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  document.querySelector('#newPatientCpf').addEventListener('input', event => {
    const digits = event.target.value.replace(/\D/g, '').slice(0, 11);
    event.target.value = digits.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  });
  const validPatient = () => {
    const { name, cpf, birth_date } = patientData();
    if (name.split(/\s+/).length < 2 || cpf.length !== 11 || patientAge(birth_date) === null) {
      toast('Informe nome completo, CPF com 11 dígitos e data de nascimento válida.');
      return false;
    }
    return true;
  };
  const formatDate = value => String(value || '').slice(0, 10).split('-').reverse().join('/');
  const formatCpf = value => String(value || '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  const createHistoryCard = item => {
    const card = document.createElement('article');
    card.className = item.document_type === 'historia_clinica' ? 'history-card clinical-history-card' : 'history-card';
    const heading = document.createElement('h4');
    heading.textContent = item.document_title;
    const meta = document.createElement('small');
    meta.textContent = `Data: ${formatDate(item.document_date)} · Local de atendimento: ${item.place_name || 'Não disponível'}`;
    const content = document.createElement('pre');
    content.textContent = item.document_type === 'tempo_atendimento'
      ? 'Início: ' + new Date(item.consultation_started_at.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' }) + '\nTempo de atendimento: ' + formatConsultationDuration(item.consultation_duration_seconds)
      : item.document_text;
    card.append(heading, meta, content);
    return card;
  };
  const renderHistory = (container, items) => {
    container.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('p');
      empty.textContent = 'Nenhum atendimento salvo para este paciente.';
      container.append(empty);
      return;
    }
    const dates = new Map();
    items.forEach(item => {
      const date = String(item.document_date || '').slice(0, 10);
      if (!dates.has(date)) dates.set(date, []);
      dates.get(date).push(item);
    });
    [...dates.keys()].sort().reverse().forEach(date => {
      const documents = [...dates.get(date)].sort((a, b) => Number(b.document_type === 'historia_clinica') - Number(a.document_type === 'historia_clinica'));
      const documentCount = documents.filter(item => !['historia_clinica', 'tempo_atendimento'].includes(item.document_type)).length;
      const hasClinicalHistory = documents.some(item => item.document_type === 'historia_clinica');
      const group = document.createElement('details');
      group.className = 'history-date-group';
      const summary = document.createElement('summary');
      summary.textContent = `${date ? formatDate(date) : 'Data não informada'} · ${documentCount} ${documentCount === 1 ? 'documento' : 'documentos'}${hasClinicalHistory ? ' · História clínica' : ''}`;
      const contents = document.createElement('div');
      contents.className = 'history-date-documents';
      documents.forEach(item => contents.append(createHistoryCard(item)));
      group.append(summary, contents);
      container.append(group);
    });
  };
  const clinicalHistoryInput = document.querySelector('#clinicalHistory');
  const clearClinicalHistory = () => { clinicalHistoryInput.value = ''; };
  ['#patientName', '#patientDoc', '#patientBirthDate', '#logoutRx', '#logoutButton'].forEach(selector => {
    document.querySelector(selector).addEventListener(selector.startsWith('#logout') ? 'click' : 'input', clearClinicalHistory);
  });
  const patientNameInput = document.querySelector('#patientName');
  const patientCpfInput = document.querySelector('#patientDoc');
  const patientBirthInput = document.querySelector('#patientBirthDate');
  const historyButton = document.createElement('button');
  historyButton.type = 'button';
  historyButton.className = 'btn outline';
  historyButton.textContent = 'Histórico de atendimentos';
  document.querySelector('#openPrintSummary').before(historyButton);
  const historyOverlay = document.createElement('section');
  historyOverlay.className = 'patient-history-overlay hidden';
  historyOverlay.setAttribute('role', 'dialog');
  historyOverlay.setAttribute('aria-modal', 'true');
  historyOverlay.setAttribute('aria-labelledby', 'currentPatientHistoryTitle');
  const historyPanel = document.createElement('div');
  historyPanel.className = 'patient-history-panel';
  const historyHeading = document.createElement('div');
  historyHeading.className = 'patient-detail-head';
  const historyTitle = document.createElement('h2');
  historyTitle.id = 'currentPatientHistoryTitle';
  historyTitle.textContent = 'Histórico de atendimentos';
  const closeHistoryButton = document.createElement('button');
  closeHistoryButton.type = 'button';
  closeHistoryButton.className = 'btn outline';
  closeHistoryButton.textContent = 'Fechar';
  historyHeading.append(historyTitle, closeHistoryButton);
  const historyPatient = document.createElement('p');
  const currentHistoryList = document.createElement('div');
  currentHistoryList.className = 'history-list';
  historyPanel.append(historyHeading, historyPatient, currentHistoryList);
  historyOverlay.append(historyPanel);
  document.body.append(historyOverlay);
  const closeCurrentHistory = () => historyOverlay.classList.add('hidden');
  closeHistoryButton.onclick = closeCurrentHistory;
  historyOverlay.onclick = event => { if (event.target === historyOverlay) closeCurrentHistory(); };
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !historyOverlay.classList.contains('hidden')) closeCurrentHistory();
  });
  ['#backPlaces', '#logoutRx', '#clearPatient', '#printRx'].forEach(selector => {
    document.querySelector(selector).addEventListener('click', closeCurrentHistory);
  });
  historyButton.onclick = async () => {
    const cpf = patientCpfInput.value.replace(/\D/g, '');
    if (cpf.length !== 11) { toast('Selecione um paciente cadastrado para ver o histórico.'); patientNameInput.focus(); return; }
    historyButton.disabled = true;
    try {
      await load();
      const patient = patients.find(item => item.cpf === cpf);
      if (!patient) { toast('Paciente não encontrado no cadastro.'); return; }
      historyPatient.textContent = `${patient.name} · CPF ${formatCpf(patient.cpf)}`;
      currentHistoryList.textContent = 'Carregando atendimentos...';
      historyOverlay.classList.remove('hidden');
      closeHistoryButton.focus();
      const result = await request('patients.history', { id: patient.id });
      renderHistory(currentHistoryList, result.items);
    } catch (error) { closeCurrentHistory(); notifyError(error); }
    finally { historyButton.disabled = false; }
  };
  const suggestions = document.createElement('div');
  suggestions.id = 'patientSuggestions';
  suggestions.className = 'patient-suggestions hidden';
  suggestions.setAttribute('role', 'listbox');
  suggestions.setAttribute('aria-label', 'Pacientes cadastrados');
  const patientNameField = patientNameInput.closest('.field');
  const lookupContainer = document.createElement('div');
  lookupContainer.className = 'patient-lookup';
  patientNameField.before(lookupContainer);
  lookupContainer.append(patientNameField, suggestions);
  patientNameInput.setAttribute('autocomplete', 'off');
  patientNameInput.setAttribute('role', 'combobox');
  patientNameInput.setAttribute('aria-autocomplete', 'list');
  patientNameInput.setAttribute('aria-controls', suggestions.id);
  patientNameInput.setAttribute('aria-expanded', 'false');
  let selectedPatientId = null;
  let suggestedPatients = [];
  let activeSuggestion = -1;
  const foldName = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const hideSuggestions = () => {
    suggestions.classList.add('hidden');
    patientNameInput.setAttribute('aria-expanded', 'false');
    patientNameInput.removeAttribute('aria-activedescendant');
    activeSuggestion = -1;
  };
  const choosePatient = patient => {
    if (patientCpfInput.value.replace(/\D/g, '') !== patient.cpf) { clearClinicalHistory(); window.consultationTimer?.reset(); }
    patientNameInput.value = patient.name;
    patientCpfInput.value = formatCpf(patient.cpf);
    patientBirthInput.value = patient.birth_date;
    updatePaperPatient();
    selectedPatientId = patient.id;
    patientNameInput.focus();
    hideSuggestions();
  };
  const highlightSuggestion = index => {
    activeSuggestion = index;
    [...suggestions.children].forEach((option, optionIndex) => {
      option.setAttribute('aria-selected', String(optionIndex === index));
    });
    const active = suggestions.children[index];
    if (active) {
      patientNameInput.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView({ block: 'nearest' });
    }
  };
  const renderSuggestions = () => {
    const query = foldName(patientNameInput.value.trim());
    suggestions.replaceChildren();
    if (!query) { hideSuggestions(); return; }
    suggestedPatients = patients.filter(patient => foldName(patient.name).includes(query)).slice(0, 8);
    if (!suggestedPatients.length) { hideSuggestions(); return; }
    suggestedPatients.forEach((patient, index) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.id = `patientSuggestion${index}`;
      option.className = 'patient-suggestion';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      const name = document.createElement('strong');
      name.textContent = patient.name;
      const cpf = document.createElement('small');
      cpf.textContent = `CPF ${formatCpf(patient.cpf)} · Nascimento ${formatDate(patient.birth_date)}`;
      option.append(name, cpf);
      option.addEventListener('pointerdown', event => {
        event.preventDefault();
        choosePatient(patient);
      });
      option.onclick = () => choosePatient(patient);
      suggestions.append(option);
    });
    suggestions.classList.remove('hidden');
    patientNameInput.setAttribute('aria-expanded', 'true');
    activeSuggestion = -1;
    patientNameInput.removeAttribute('aria-activedescendant');
  };
  patientNameInput.addEventListener('input', () => {
    if (selectedPatientId !== null) {
      patientCpfInput.value = '';
      patientBirthInput.value = '';
      selectedPatientId = null;
    }
    updatePaperPatient();
    renderSuggestions();
  });
  patientNameInput.addEventListener('focus', () => {
    if (patientsLoaded) renderSuggestions();
    else load().catch(notifyError);
  });
  patientNameInput.addEventListener('keydown', event => {
    if (suggestions.classList.contains('hidden')) return;
    if (event.key === 'Escape') { hideSuggestions(); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      highlightSuggestion((activeSuggestion + step + suggestedPatients.length) % suggestedPatients.length);
    }
    if (event.key === 'Enter' && activeSuggestion >= 0) {
      event.preventDefault();
      choosePatient(suggestedPatients[activeSuggestion]);
    }
  });
  document.addEventListener('click', event => {
    if (!lookupContainer.contains(event.target)) hideSuggestions();
  });
  document.querySelector('#clearPatient').addEventListener('click', () => { selectedPatientId = null; hideSuggestions(); });
  const updateRegistrationSummary = () => {
    const data = registrationData(), age = patientAge(data.birth_date);
    for (const [suffix,value] of Object.entries({Name:data.name||'Novo paciente',Age:age===null?'—':age+' anos',
      Cpf:formatCpf(data.cpf),Phone:data.phone,Email:data.email,City:[data.city,data.state].filter(Boolean).join(' / ')})) {
      document.querySelector('#patientSummary'+suffix).textContent=value||'—';
    }
  };
  registrationForm.addEventListener('input',updateRegistrationSummary);
  registrationForm.addEventListener('change',updateRegistrationSummary);
  const openRegistration = (patient=null) => {
    registrationForm.reset();editingPatientId=patient?.id??null;
    Object.entries(registrationInputs).forEach(([key,input])=>input.value=patient?.[key]||'');
    registrationInputs.cpf.value=formatCpf(registrationInputs.cpf.value);
    registrationHeading.textContent=patient?'Editar paciente':'Cadastrar paciente';
    registrationButton.textContent=patient?'Salvar alterações':'Salvar novo paciente';
    document.querySelector('#patientSummaryCode').textContent=patient?'Código: '+patient.id:'Novo paciente';
    registrationError.textContent='';cancelEditButton.classList.toggle('hidden',!patient);
    directoryHost.classList.add('hidden');registrationForm.classList.remove('hidden');
    registrationForm.querySelectorAll('details').forEach(section=>section.open=true);
    updateRegistrationSummary();registrationForm.scrollIntoView({block:'start'});registrationInputs.name.focus();
  };
  document.querySelector('#newPatientButton').onclick=()=>openRegistration();
  document.querySelector('#backPatientDirectory').onclick=stopEditing;
  document.querySelectorAll('.patient-form-nav a').forEach(link=>link.addEventListener('click',()=>{
    document.querySelector(link.getAttribute('href')).open=true;
  }));
  const showHistory = async patient => {
    detail.classList.remove('hidden');
    document.querySelector('#patientDetailName').textContent = patient.name;
    document.querySelector('#patientDetailData').textContent = `CPF ${formatCpf(patient.cpf)} · Nascimento ${formatDate(patient.birth_date)}${patient.phone ? ` · Telefone ${patient.phone}` : ''}`;
    history.textContent = 'Carregando atendimentos...';
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const result = await request('patients.history', { id: patient.id });
      renderHistory(history, result.items);
    } catch (error) { history.textContent = ''; notifyError(error); }
  };
  document.querySelector('#closePatientDetail').onclick = () => detail.classList.add('hidden');
  const filterPatients = (rows,filters) => rows.filter(patient =>
    (!filters.code || String(patient.id)===filters.code) &&
    (!filters.name || foldName(patient.name).includes(foldName(filters.name))) &&
    (!filters.cpf || patient.cpf.includes(filters.cpf)) &&
    (!filters.birth || patient.birth_date===filters.birth) &&
    (!filters.phone || String(patient.phone||'').replace(/\D/g,'').includes(filters.phone)));
  const render = () => {
    const matching = filterPatients(patients,{
      code:document.querySelector('#patientCodeFilter').value.trim(),name:search.value.trim(),
      cpf:document.querySelector('#patientCpfFilter').value.replace(/\D/g,''),
      birth:document.querySelector('#patientBirthFilter').value,
      phone:document.querySelector('#patientPhoneFilter').value.replace(/\D/g,'')
    });
    const size=Number(document.querySelector('#patientPageSize').value)||50;
    const pages=Math.max(1,Math.ceil(matching.length/size));page=Math.min(page,pages);
    document.querySelector('#patientResultCount').textContent='('+matching.length+')';
    document.querySelector('#patientPageInfo').textContent='Página '+page+' de '+pages;
    document.querySelector('#patientPreviousPage').disabled=page<=1;
    document.querySelector('#patientNextPage').disabled=page>=pages;
    list.replaceChildren();
    const table=document.createElement('table');table.className='patient-directory-table';
    const caption=document.createElement('caption');caption.className='patient-sr-only';caption.textContent='Pacientes cadastrados';table.append(caption);
    const thead=document.createElement('thead'),head=document.createElement('tr');thead.append(head);table.append(thead);
    ['Código','Nome completo','Data de nascimento','Sexo','Celular','CPF','Cidade','Ações'].forEach(label=>{
      const cell=document.createElement('th');cell.scope='col';cell.textContent=label;head.append(cell);
    });
    const body=document.createElement('tbody');table.append(body);
    const action=(label,fn,className='outline')=>{const button=document.createElement('button');button.type='button';button.className='btn '+className;button.textContent=label;button.onclick=fn;return button;};
    matching.slice((page-1)*size,page*size).forEach(patient=>{
      const row=document.createElement('tr');row.tabIndex=0;row.setAttribute('aria-label','Abrir cadastro de '+patient.name);
      row.onclick=event=>{if(!event.target.closest('button'))openRegistration(patient);};
      row.onkeydown=event=>{if(event.target===row&&['Enter',' '].includes(event.key)){event.preventDefault();openRegistration(patient);}};
      const age=patientAge(patient.birth_date);
      [patient.id,patient.name,formatDate(patient.birth_date)+(age===null?'':' · '+age+' anos'),patient.sex||'—',patient.phone||'—',formatCpf(patient.cpf),[patient.city,patient.state].filter(Boolean).join(' / ')||'—'].forEach((value,index)=>{
        const cell=document.createElement('td');
        if(index===1)cell.append(action(value,()=>openRegistration(patient),'patient-name-link'));
        else cell.textContent=value;
        row.append(cell);
      });
      const actions=document.createElement('td');actions.className='patient-table-actions';
      const use=()=>{choosePatient(patient);selectTab('places');toast('Paciente selecionado. Clique em “Atender” no local desejado.');};
      const remove=action('Excluir',async()=>{
        const count=Number(patient.appointments)||0;
        if(!confirm('Excluir definitivamente o cadastro de '+patient.name+(count?' e '+count+' atendimento(s) salvo(s)':'')+'? Esta ação não pode ser desfeita.'))return;
        remove.disabled=true;
        try {
          await request('patients.delete',{id:patient.id});
          if(editingPatientId===patient.id)stopEditing();
          if(patientCpfInput.value.replace(/\D/g,'')===patient.cpf)clearPatient();
          detail.classList.add('hidden');await load();toast('Paciente e atendimentos vinculados excluídos.');
        } catch(error){notifyError(error);}finally{remove.disabled=false;}
      },'red');
      actions.append(action('Histórico',()=>showHistory(patient)),action('Usar paciente',use),remove);
      row.append(actions);body.append(row);
    });
    if(!matching.length){const row=document.createElement('tr'),cell=document.createElement('td');cell.colSpan=8;cell.className='patient-empty';cell.textContent='Nenhum paciente encontrado para os filtros selecionados.';row.append(cell);body.append(row);}
    list.append(table);
  };
  const load = async () => {
    patients = (await request('patients.list')).items;
    patientsLoaded = true;
    render();
    if (document.activeElement === patientNameInput) renderSuggestions();
  };
  for(const selector of ['#patientSearch','#patientCodeFilter','#patientCpfFilter','#patientBirthFilter','#patientPhoneFilter']) {
    document.querySelector(selector).addEventListener('input',()=>{page=1;render();});
  }
  document.querySelector('#patientPageSize').onchange=()=>{page=1;render();};
  document.querySelector('#patientPreviousPage').onclick=()=>{page=Math.max(1,page-1);render();};
  document.querySelector('#patientNextPage').onclick=()=>{page++;render();};
  document.addEventListener('schedule:saved', () => { patientsLoaded = false; load().catch(notifyError); });
  registrationForm.onsubmit = async event => {
    event.preventDefault();
    if (registrationButton.disabled) return;
    const data = registrationData();
    if (data.name.split(/\s+/).length < 2 || data.cpf.length !== 11 || patientAge(data.birth_date) === null) {
      registrationError.textContent='Informe nome completo, CPF com 11 dígitos e data de nascimento válida.';
      return;
    }
    registrationError.textContent='';
    const button = registrationButton;
    button.disabled = true;
    try {
      const wasEditing = editingPatientId !== null;
      await request(wasEditing ? 'patients.update' : 'patients.save', wasEditing ? { ...data, id: editingPatientId } : data);
      stopEditing();
      await load();
      detail.classList.add('hidden');
      toast(wasEditing ? 'Dados do paciente atualizados.' : 'Paciente cadastrado.');
    } catch (error) { registrationError.textContent=error.message||'Não foi possível salvar o cadastro.'; }
    finally { button.disabled = false; }
  };
  document.querySelector('#savePatient').onclick = async () => {
    if (!validPatient()) return;
    const button = document.querySelector('#savePatient');
    button.disabled = true;
    try { await request('patients.save', patientData()); await load(); toast('Paciente cadastrado.'); }
    catch (error) { notifyError(error); }
    finally { button.disabled = false; }
  };
  const recentAppointments = new Map();
  const saveAppointmentRecord = async ({ type, title, text, date, timerOnly = false }) => {
    await window.validateScheduledVisitEdit?.();
    if (!validPatient()) return null;
    const clinicalHistory = timerOnly ? '' : clinicalHistoryInput.value.trim();
    const timing = window.consultationTimer?.snapshot() || null;
    if (!selectedPlace?.id || !type || !title || (!text && !clinicalHistory && !timing) || !date) { toast('Selecione um local e preencha a data e o texto do documento, a história clínica ou inicie o cronômetro.'); return null; }
    const patient = patientData();
    const key = JSON.stringify([patient.cpf, selectedPlace.id, type, title, text, date, clinicalHistory]);
    const recent = recentAppointments.get(key);
    if (!timing && !clinicalHistory && recent && Date.now() - recent.createdAt < 5 * 60 * 1000) return recent.promise;
    const promise = (async () => {
      const saved = await request('appointments.save', { ...patient, place_id: selectedPlace.id,
        document_type: type, document_title: title, document_text: text, document_date: date, clinical_history: clinicalHistory, consultation: timing });
      if (!saved.appointment_id || !saved.patient_id) throw new Error('O servidor não confirmou o registro do atendimento.');
      try {
        await load();
        const result = await request('patients.history', { id: saved.patient_id });
        if (!result.items.some(item => String(item.id) === String(saved.appointment_id))) throw new Error('Registro não encontrado no histórico.');
        return { ...saved, historyReady: true };
      } catch (error) {
        toast('Atendimento gravado, mas não foi possível atualizar o histórico agora. Abra o cadastro do paciente novamente.');
        return { ...saved, historyReady: false };
      }
    })();
    recentAppointments.set(key, { promise, createdAt: Date.now() });
    try {
      return await promise;
    } catch (error) {
      recentAppointments.delete(key);
      throw error;
    }
  };
  window.saveAppointmentRecord = saveAppointmentRecord;
  const persistCurrentAppointment = async (finish = false) => {
    const button = document.querySelector('#saveAppointment');
    const finishButton = document.querySelector('#finishAppointment');
    if (button.disabled || finishButton.disabled) return;
    button.disabled = true; finishButton.disabled = true;
    try {
      const printed = finish ? await window.savePrintedDocuments?.() || [] : [];
      const hasCurrentContent = document.querySelector('#rxText').value.trim() || clinicalHistoryInput.value.trim() || window.consultationTimer?.snapshot();
      const saved = finish && printed.length && !hasCurrentContent ? printed[printed.length-1] : await saveAppointmentRecord({
        type: document.querySelector('.type-card.active')?.dataset.type,
        title: document.querySelector('.type-card.active')?.dataset.type === 'especial'
          ? 'Receita de Controle Especial' : document.querySelector('#paperTitle').textContent.trim(),
        text: document.querySelector('#rxText').value.trim(),
        date: document.querySelector('#rxDate').value
      });
      if (saved && finish) {
        await window.finishScheduledVisit?.();
        window.consultationTimer?.reset();
        await window.openConsultations?.();
        toast(saved.historyReady ? 'Atendimento finalizado e salvo no histórico do paciente.' : 'Atendimento finalizado. Reabra o cadastro para consultar o histórico.');
      } else if (saved?.historyReady) toast('Atendimento salvo no histórico do paciente.');
    } catch (error) { notifyError(error); }
    finally { button.disabled = false; finishButton.disabled = false; }
  };
  document.querySelector('#saveAppointment').onclick = () => persistCurrentAppointment();
  document.querySelector('#finishAppointment').onclick = () => persistCurrentAppointment(true);
  document.addEventListener('patients:load', () => { clearClinicalHistory(); recentAppointments.clear(); patients = []; patientsLoaded = false; hideSuggestions(); stopEditing(); detail.classList.add('hidden'); selectTab('places'); page=1;for(const id of ['patientSearch','patientCodeFilter','patientCpfFilter','patientBirthFilter','patientPhoneFilter'])document.querySelector('#'+id).value=''; load().catch(notifyError); });
  document.querySelector('#backPlaces').addEventListener('click', () => load().catch(notifyError));
})();
