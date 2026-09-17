/* Recuperação de senha pela API; o link não é enviado ao servidor ao abrir a página. */
(() => {
  let token = '';
  const match = location.hash.match(/^#reset-password=([a-f0-9]{64})$/);
  if (location.hash.startsWith('#reset-password=')) {
    token = match ? match[1] : '';
    history.replaceState(null, '', location.pathname + location.search);
    show('#resetPasswordScreen');
    if (!token) $('#resetStatus').textContent = 'Link inválido. Solicite uma nova recuperação.';
  }
  const request = async (action, data) => {
    if (['localhost', '127.0.0.1'].includes(location.hostname) || location.protocol === 'file:') {
      throw new Error('Para recuperar sua senha, acesse o site publicado: https://receita.drdanielleite.com.br/');
    }
    const response = await fetch(`api/index.php?action=${action}`, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || 'Não foi possível conectar ao servidor. Tente novamente.');
    return result;
  };
  $('#backLoginFromReset').onclick = () => { token = ''; $('#resetPasswordForm').reset(); show('#loginScreen'); };
  $('#forgotPasswordForm').onsubmit = async event => {
    event.preventDefault();
    const button = $('#sendResetEmail'), status = $('#forgotStatus');
    button.disabled = true; status.textContent = 'Enviando solicitação…';
    try {
      const result = await request('forgot', { email: $('#forgotEmail').value.trim() });
      status.textContent = result.message;
      $('#email').value = $('#forgotEmail').value.trim();
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  };
  $('#resetPasswordForm').onsubmit = async event => {
    event.preventDefault();
    const status = $('#resetStatus'), button = $('#saveNewPassword');
    if ($('#newPassword').value !== $('#confirmNewPassword').value) { status.textContent = 'As senhas devem ser iguais.'; return; }
    if (!token) { status.textContent = 'Link inválido. Solicite uma nova recuperação.'; return; }
    button.disabled = true; status.textContent = 'Salvando…';
    try {
      const result = await request('reset-password', { token, password: $('#newPassword').value });
      token = ''; $('#resetPasswordForm').reset(); $('#password').value = '';
      show('#loginScreen'); toast(result.message);
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  };
})();
