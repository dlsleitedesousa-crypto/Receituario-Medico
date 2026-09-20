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
  doctor = { title: user.title || '', name: user.name || '', cpf: doctorCpfDigits(user.cpf), specialty: user.specialty || '', crm: user.crm || '', rqe: user.rqe || '', email: user.email || '' };
  $('#professionalSignature').innerHTML = doctorSignature();
  $('#userEmail').textContent = user.name || user.email;
  $('#rxUserName').textContent = user.name || user.email;
  $('#email').value = user.email || '';
}
function profileValues() {
  return Object.fromEntries(['title', 'name', 'cpf', 'specialty', 'crm', 'rqe', 'email'].map(key => [key, key === 'cpf' ? doctorCpfDigits($('#profileCpf').value) : $('#profile' + key[0].toUpperCase() + key.slice(1)).value.trim()]));
}
$$('.open-profile').forEach(button => button.onclick = () => {
  profileReturnScreen = '#' + button.closest('.screen').id;
  const user = { ...doctor, email: doctor.email || $('#email').value };
  for (const [key, value] of Object.entries(user)) {
    const input = $('#profile' + key[0].toUpperCase() + key.slice(1));
    if (input) input.value = key === 'cpf' ? formatDoctorCpf(value) : value || (key === 'title' ? 'Dr.' : '');
  }
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
