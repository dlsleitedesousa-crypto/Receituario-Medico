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
    registrationButton.textContent = 'Cadastrar paciente';
    cancelEditButton.classList.add('hidden');
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
  const registrationData = () => ({
    name: document.querySelector('#newPatientName').value.trim(),
    cpf: document.querySelector('#newPatientCpf').value.replace(/\D/g, ''),
    birth_date: document.querySelector('#newPatientBirthDate').value,
    phone: document.querySelector('#newPatientPhone').value.trim()
  });
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
    card.className = 'history-card';
    const heading = document.createElement('h4');
    heading.textContent = item.document_title;
    const meta = document.createElement('small');
    meta.textContent = `Data: ${formatDate(item.document_date)} · Local de atendimento: ${item.place_name || 'Não disponível'}`;
    const content = document.createElement('pre');
    content.textContent = item.document_text;
    card.append(heading, meta, content);
    return card;
  };
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
      currentHistoryList.replaceChildren();
      if (!result.items.length) {
        const empty = document.createElement('p');
        empty.textContent = 'Nenhum atendimento salvo para este paciente.';
        currentHistoryList.append(empty);
      } else result.items.forEach(item => currentHistoryList.append(createHistoryCard(item)));
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
    patientNameInput.value = patient.name;
    patientCpfInput.value = formatCpf(patient.cpf);
    patientBirthInput.value = patient.birth_date;
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
  const showHistory = async patient => {
    detail.classList.remove('hidden');
    document.querySelector('#patientDetailName').textContent = patient.name;
    document.querySelector('#patientDetailData').textContent = `CPF ${formatCpf(patient.cpf)} · Nascimento ${formatDate(patient.birth_date)}${patient.phone ? ` · Telefone ${patient.phone}` : ''}`;
    history.textContent = 'Carregando atendimentos...';
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const result = await request('patients.history', { id: patient.id });
      history.replaceChildren();
      if (!result.items.length) {
        const empty = document.createElement('p');
        empty.textContent = 'Nenhum atendimento salvo para este paciente.';
        history.append(empty);
        return;
      }
      result.items.forEach(item => history.append(createHistoryCard(item)));
    } catch (error) { history.textContent = ''; notifyError(error); }
  };
  document.querySelector('#closePatientDetail').onclick = () => detail.classList.add('hidden');
  const render = () => {
    const query = search.value.toLocaleLowerCase('pt-BR').replace(/\D/g, '');
    const nameQuery = search.value.toLocaleLowerCase('pt-BR').trim();
    list.replaceChildren();
    const matching = patients.filter(p => !nameQuery || p.name.toLocaleLowerCase('pt-BR').includes(nameQuery) || (query && p.cpf.includes(query)));
    if (!matching.length) {
      const empty = document.createElement('p');
      empty.textContent = 'Nenhum paciente encontrado.';
      list.append(empty);
      return;
    }
    matching.forEach(patient => {
      const row = document.createElement('article');
      row.className = 'patient-row';
      row.tabIndex = 0;
      row.setAttribute('aria-label', `Ver histórico de ${patient.name}`);
      row.onclick = event => { if (!event.target.closest('button')) showHistory(patient); };
      row.onkeydown = event => { if (event.target === row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); showHistory(patient); } };
      const info = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = patient.name;
      const details = document.createElement('small');
      details.textContent = `CPF ${formatCpf(patient.cpf)} · Nascimento ${formatDate(patient.birth_date)}${patient.phone ? ` · Telefone ${patient.phone}` : ''} · ${patient.appointments} atendimento(s)`;
      info.append(title, details);
      const historyButton = document.createElement('button');
      historyButton.type = 'button';
      historyButton.className = 'btn blue';
      historyButton.textContent = 'Ver histórico';
      historyButton.onclick = () => showHistory(patient);
      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'btn outline';
      editButton.textContent = 'Editar';
      editButton.onclick = () => {
        editingPatientId = patient.id;
        document.querySelector('#newPatientName').value = patient.name;
        document.querySelector('#newPatientCpf').value = formatCpf(patient.cpf);
        document.querySelector('#newPatientBirthDate').value = patient.birth_date;
        document.querySelector('#newPatientPhone').value = patient.phone || '';
        registrationHeading.textContent = `Editar paciente: ${patient.name}`;
        registrationButton.textContent = 'Salvar alterações';
        cancelEditButton.classList.remove('hidden');
        registrationForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
        document.querySelector('#newPatientName').focus();
      };
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn outline';
      button.textContent = 'Usar paciente';
      button.onclick = () => {
        choosePatient(patient);
        selectTab('places');
        toast('Paciente selecionado. Clique em “Atender” no local desejado.');
      };
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'btn red';
      deleteButton.textContent = 'Excluir';
      deleteButton.onclick = async () => {
        const count = Number(patient.appointments) || 0;
        const warning = count ? ` e ${count} atendimento(s) salvo(s)` : '';
        if (!confirm(`Excluir definitivamente o cadastro de ${patient.name}${warning}? Esta ação não pode ser desfeita.`)) return;
        deleteButton.disabled = true;
        try {
          await request('patients.delete', { id: patient.id });
          if (editingPatientId === patient.id) stopEditing();
          if (document.querySelector('#patientDoc').value.replace(/\D/g, '') === patient.cpf) clearPatient();
          detail.classList.add('hidden');
          await load();
          toast('Paciente e atendimentos vinculados excluídos.');
        } catch (error) { notifyError(error); }
        finally { deleteButton.disabled = false; }
      };
      const actions = document.createElement('div');
      actions.className = 'patient-row-actions';
      actions.append(historyButton, editButton, button, deleteButton);
      row.append(info, actions);
      list.append(row);
    });
  };
  const load = async () => {
    patients = (await request('patients.list')).items;
    patientsLoaded = true;
    render();
    if (document.activeElement === patientNameInput) renderSuggestions();
  };
  search.addEventListener('input', render);
  registrationForm.onsubmit = async event => {
    event.preventDefault();
    const data = registrationData();
    if (data.name.split(/\s+/).length < 2 || data.cpf.length !== 11 || patientAge(data.birth_date) === null) {
      toast('Informe nome completo, CPF com 11 dígitos e data de nascimento válida.');
      return;
    }
    const button = registrationButton;
    button.disabled = true;
    try {
      const wasEditing = editingPatientId !== null;
      await request(wasEditing ? 'patients.update' : 'patients.save', wasEditing ? { ...data, id: editingPatientId } : data);
      stopEditing();
      await load();
      detail.classList.add('hidden');
      toast(wasEditing ? 'Dados do paciente atualizados.' : 'Paciente cadastrado.');
    } catch (error) { notifyError(error); }
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
  const saveAppointmentRecord = async ({ type, title, text, date }) => {
    if (!validPatient()) return null;
    if (!selectedPlace?.id || !type || !title || !text || !date) { toast('Selecione um local e preencha o texto e a data do documento.'); return null; }
    const saved = await request('appointments.save', { ...patientData(), place_id: selectedPlace.id,
      document_type: type, document_title: title, document_text: text, document_date: date });
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
  };
  window.saveAppointmentRecord = saveAppointmentRecord;
  document.querySelector('#saveAppointment').onclick = async () => {
    const button = document.querySelector('#saveAppointment');
    button.disabled = true;
    try {
      const saved = await saveAppointmentRecord({
        type: document.querySelector('.type-card.active')?.dataset.type,
        title: document.querySelector('#paperTitle').textContent.trim(),
        text: document.querySelector('#rxText').value.trim(),
        date: document.querySelector('#rxDate').value
      });
      if (saved?.historyReady) toast('Atendimento salvo no histórico do paciente.');
    } catch (error) { notifyError(error); }
    finally { button.disabled = false; }
  };
  document.addEventListener('patients:load', () => { patients = []; patientsLoaded = false; hideSuggestions(); stopEditing(); detail.classList.add('hidden'); selectTab('places'); load().catch(notifyError); });
  document.querySelector('#backPlaces').addEventListener('click', () => load().catch(notifyError));
})();
