/* Dados do perfil compartilhados pela prévia local e pela integração com o servidor. */
let profileReturnScreen = '#placesScreen';
const doctorCpfDigits = value => String(value || '').replace(/\D/g, '').slice(0, 11);
const formatDoctorCpf = value => doctorCpfDigits(value)
  .replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
function validDoctorCpf(value) {
  const cpf = doctorCpfDigits(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (let length = 9; length < 11; length++) {
    const sum = [...cpf.slice(0, length)].reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
    const check = (sum * 10) % 11 % 10;
    if (check !== Number(cpf[length])) return false;
  }
  return true;
}
['#doctorCpf', '#profileCpf'].forEach(selector => {
  $(selector).addEventListener('input', event => { event.target.value = formatDoctorCpf(event.target.value); });
});
function applyUserProfile(user) {
  doctor = { title: user.title || '', name: user.name || '', cpf: doctorCpfDigits(user.cpf), specialty: user.specialty || '', crm: user.crm || '', rqe: user.rqe || '', email: user.email || '', phone: user.phone || '', specialistTitle: user.specialistTitle || '', signature: user.signature || '' };
  updateSignatureToggle(true);
  $('#userEmail').textContent = user.name || user.email;
  $('#rxUserName').textContent = user.name || user.email;
  $('#email').value = user.email || '';
}
function profileValues() {
  return { ...additionalDoctorValues('profile'), ...Object.fromEntries(['title', 'name', 'cpf', 'specialty', 'crm', 'rqe', 'email'].map(key => [key, key === 'cpf' ? doctorCpfDigits($('#profileCpf').value) : $('#profile' + key[0].toUpperCase() + key.slice(1)).value.trim()])) };
}
$$('.open-profile').forEach(button => button.onclick = () => {
  profileReturnScreen = '#' + button.closest('.screen').id;
  const user = { ...doctor, email: doctor.email || $('#email').value };
  for (const [key, value] of Object.entries(user)) {
    const input = $('#profile' + key[0].toUpperCase() + key.slice(1));
    if (input) input.value = key === 'cpf' ? formatDoctorCpf(value) : value || (key === 'title' ? 'Dr.' : '');
  }
  signatureDrafts.profile = doctor.signature || '';
  renderSignaturePreview('profile');
  show('#profileScreen');
});
$('#cancelProfile').onclick = () => show(profileReturnScreen);
$('#profileForm').onsubmit = event => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  if (!validDoctorCpf($('#profileCpf').value)) { toast('Informe um CPF válido.'); $('#profileCpf').focus(); return; }
  applyUserProfile(profileValues());
  show(profileReturnScreen);
  toast('Perfil atualizado nesta prévia.');
};

// Signature drafts are kept separate so cancelling never changes the saved profile.
const signatureDrafts = { doctor: '', profile: '' };
function additionalDoctorValues(prefix) {
  return { phone: $('#' + prefix + 'Phone').value.trim(), specialistTitle: $('#' + prefix + 'SpecialistTitle').value.trim(), signature: signatureDrafts[prefix] };
}
function renderSignaturePreview(prefix) {
  const preview = $('#' + prefix + 'SignaturePreview');
  preview.classList.toggle('hidden', !signatureDrafts[prefix]);
  if (signatureDrafts[prefix]) preview.src = signatureDrafts[prefix]; else preview.removeAttribute('src');
  $('#' + prefix + 'SignatureFile').value = '';
  $('#' + prefix + 'RemoveSignature').disabled = !signatureDrafts[prefix];
}
function updateSignatureToggle(reset = false) {
  const toggle = $('#useElectronicSignature');
  if (reset || !doctor.signature) toggle.checked = false;
  toggle.disabled = !doctor.signature;
  $('#signatureToggleHint').textContent = doctor.signature ? 'A imagem será incluída na prévia e na impressão dos documentos do receituário.' : 'Cadastre a imagem em Meu perfil para ativar.';
  $('#professionalSignature').innerHTML = doctorSignature();
}
$('#useElectronicSignature').onchange = () => updateSignatureToggle();
for (const prefix of ['doctor', 'profile']) {
  $('#' + prefix + 'RemoveSignature').onclick = () => { signatureDrafts[prefix] = ''; renderSignaturePreview(prefix); };
  $('#' + prefix + 'SignatureFile').onchange = async event => {
    const file = event.target.files[0];
    if (!file) return;
    const submit = event.target.closest('form').querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 2 * 1024 * 1024) throw new Error('Escolha uma imagem PNG ou JPG de até 2 MB.');
      const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Não foi possível ler a imagem.')); reader.readAsDataURL(file); });
      const image = new Image(); image.src = data; await image.decode();
      if (image.naturalWidth > 4096 || image.naturalHeight > 4096) throw new Error('A imagem deve ter no máximo 4096 pixels em cada lado.');
      signatureDrafts[prefix] = data;
    } catch (error) { toast(error.message || 'Não foi possível carregar a imagem.'); }
    finally { renderSignaturePreview(prefix); submit.disabled = false; }
  };
}
$('#registerForm').addEventListener('reset', () => { signatureDrafts.doctor = ''; renderSignaturePreview('doctor'); });
for (const selector of ['#logoutButton', '#logoutRx']) $(selector).addEventListener('click', () => { $('#useElectronicSignature').checked = false; updateSignatureToggle(); });
updateSignatureToggle();
