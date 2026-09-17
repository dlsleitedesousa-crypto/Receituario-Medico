/* Dados do perfil compartilhados pela prévia local e pela integração com o servidor. */
let profileReturnScreen = '#placesScreen';
function applyUserProfile(user) {
  doctor = { title: user.title || '', name: user.name || '', specialty: user.specialty || '', crm: user.crm || '', rqe: user.rqe || '', email: user.email || '' };
  $('#professionalSignature').innerHTML = doctorSignature();
  $('#userEmail').textContent = user.name || user.email;
  $('#rxUserName').textContent = user.name || user.email;
  $('#email').value = user.email || '';
}
function profileValues() {
  return Object.fromEntries(['title', 'name', 'specialty', 'crm', 'rqe', 'email'].map(key => [key, $('#profile' + key[0].toUpperCase() + key.slice(1)).value.trim()]));
}
$$('.open-profile').forEach(button => button.onclick = () => {
  profileReturnScreen = '#' + button.closest('.screen').id;
  const user = { ...doctor, email: doctor.email || $('#email').value };
  for (const [key, value] of Object.entries(user)) {
    const input = $('#profile' + key[0].toUpperCase() + key.slice(1));
    if (input) input.value = value || (key === 'title' ? 'Dr.' : '');
  }
  show('#profileScreen');
});
$('#cancelProfile').onclick = () => show(profileReturnScreen);
$('#profileForm').onsubmit = event => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  applyUserProfile(profileValues());
  show(profileReturnScreen);
  toast('Perfil atualizado nesta prévia.');
};
