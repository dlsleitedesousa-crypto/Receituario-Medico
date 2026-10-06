/* Cronômetro vinculado ao paciente atual; salvo com os atendimentos. */
function formatConsultationDuration(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(part => String(part).padStart(2, '0')).join(':');
}
(() => {
  const button = document.querySelector('#startConsultation');
  const elapsed = document.querySelector('#consultationElapsed');
  const label = document.querySelector('#consultationStart');
  const cpf = () => document.querySelector('#patientDoc').value.replace(/\D/g, '');
  let startedAt = null, patientCpf = '', interval = null;
  const snapshot = () => startedAt !== null && patientCpf === cpf() ? {
    started_at: new Date(startedAt).toISOString(),
    duration_seconds: Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  } : null;
  const render = () => { elapsed.textContent = formatConsultationDuration(snapshot()?.duration_seconds); };
  const reset = () => {
    if (interval !== null) clearInterval(interval);
    interval = null; startedAt = null; patientCpf = '';
    button.disabled = false; button.textContent = 'Iniciar atendimento';
    label.textContent = 'Atendimento não iniciado'; render();
  };
  button.onclick = () => {
    if (startedAt !== null) return;
    if (document.querySelector('#patientName').value.trim().split(/\s+/).length < 2 || cpf().length !== 11 || patientAge(document.querySelector('#patientBirthDate').value) === null || !selectedPlace?.id) {
      toast('Selecione um local e preencha nome completo, CPF e nascimento do paciente para iniciar o atendimento.'); return;
    }
    startedAt = Date.now(); patientCpf = cpf();
    label.textContent = 'Início: ' + new Date(startedAt).toLocaleTimeString('pt-BR', { timeZone: 'America/Fortaleza' });
    button.disabled = true; button.textContent = 'Atendimento em andamento';
    render(); interval = setInterval(render, 1000);
  };
  window.consultationTimer = { snapshot, reset };
  const originalClearPatient = clearPatient;
  clearPatient = () => { originalClearPatient(); reset(); };
  const clearButton = document.querySelector('#clearPatient');
  const originalClearClick = clearButton.onclick;
  clearButton.onclick = async event => {
    if (clearButton.disabled) return;
    clearButton.disabled = true;
    try {
      if (snapshot()) {
        const saved = await window.saveAppointmentRecord({ type: 'simples', title: 'Tempo de atendimento', text: '', date: document.querySelector('#rxDate').value, timerOnly: true });
        if (!saved) throw new Error('Salve o tempo do atendimento antes de limpar os dados do paciente.');
      }
      originalClearClick(event);
    } catch (error) { toast(error.message || 'Não foi possível salvar o tempo. Os dados do paciente foram preservados.'); }
    finally { clearButton.disabled = false; }
  };
  ['#patientName', '#patientDoc', '#patientBirthDate'].forEach(selector => document.querySelector(selector).addEventListener('input', reset));
  ['#logoutButton', '#logoutRx'].forEach(selector => document.querySelector(selector).addEventListener('click', reset));
  document.addEventListener('patients:load', reset);
  reset();
})();
