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
      result.items.forEach(item => {
        const card = document.createElement('article');
        card.className = 'history-card';
        const heading = document.createElement('h4');
        heading.textContent = item.document_title;
        const meta = document.createElement('small');
        meta.textContent = `${formatDate(item.document_date)} · ${item.place_name || 'Local removido'}`;
        const content = document.createElement('pre');
        content.textContent = item.document_text;
        card.append(heading, meta, content);
        history.append(card);
      });
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
        document.querySelector('#patientName').value = patient.name;
        document.querySelector('#patientDoc').value = formatCpf(patient.cpf);
        document.querySelector('#patientBirthDate').value = patient.birth_date;
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
  const load = async () => { patients = (await request('patients.list')).items; render(); };
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
  document.querySelector('#saveAppointment').onclick = async () => {
    if (!validPatient()) return;
    const type = document.querySelector('.type-card.active')?.dataset.type;
    const text = document.querySelector('#rxText').value.trim();
    const date = document.querySelector('#rxDate').value;
    if (!selectedPlace?.id || !type || !text || !date) { toast('Selecione um local e preencha o texto e a data do documento.'); return; }
    const button = document.querySelector('#saveAppointment');
    button.disabled = true;
    try {
      await request('appointments.save', { ...patientData(), place_id: selectedPlace.id,
        document_type: type, document_title: document.querySelector('#paperTitle').textContent.trim(),
        document_text: text, document_date: date });
      await load();
      toast('Atendimento salvo no banco de dados.');
    } catch (error) { notifyError(error); }
    finally { button.disabled = false; }
  };
  document.addEventListener('patients:load', () => { stopEditing(); detail.classList.add('hidden'); selectTab('places'); load().catch(notifyError); });
  document.querySelector('#backPlaces').addEventListener('click', () => load().catch(notifyError));
})();
