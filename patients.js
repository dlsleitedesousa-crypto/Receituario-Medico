/* Cadastro de pacientes e histórico de atendimentos por profissional. */
(() => {
  const list = document.querySelector('#patientList');
  const search = document.querySelector('#patientSearch');
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
  const validPatient = () => {
    const { name, cpf, birth_date } = patientData();
    if (name.split(/\s+/).length < 2 || cpf.length !== 11 || patientAge(birth_date) === null) {
      toast('Informe nome completo, CPF com 11 dígitos e data de nascimento válida.');
      return false;
    }
    return true;
  };
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
      const info = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = patient.name;
      const details = document.createElement('small');
      details.textContent = `CPF ${patient.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')} · Nascimento ${patient.birth_date.split('-').reverse().join('/')} · ${patient.appointments} atendimento(s)`;
      info.append(title, details);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn outline';
      button.textContent = 'Usar paciente';
      button.onclick = () => {
        document.querySelector('#patientName').value = patient.name;
        document.querySelector('#patientDoc').value = patient.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
        document.querySelector('#patientBirthDate').value = patient.birth_date;
        toast('Paciente selecionado. Clique em “Atender” no local desejado.');
      };
      row.append(info, button);
      list.append(row);
    });
  };
  const load = async () => { patients = (await request('patients.list')).items; render(); };
  search.addEventListener('input', render);
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
  document.addEventListener('patients:load', () => load().catch(notifyError));
  document.querySelector('#backPlaces').addEventListener('click', () => load().catch(notifyError));
})();
