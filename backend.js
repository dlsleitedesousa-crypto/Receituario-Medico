/* Integração de produção com o backend PHP/MySQL da Hostinger. */
(() => {
  if (['127.0.0.1', 'localhost'].includes(location.hostname)) return;

  const api = async (action, data = {}) => {
    const response = await fetch(`api/index.php?action=${encodeURIComponent(action)}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || 'Não foi possível concluir a operação.');
    return result;
  };
  const fail = error => toast(error?.message || 'Não foi possível conectar ao servidor.');
  const populateUser = applyUserProfile;
  $('#profileForm').onsubmit = async event => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const button = $('#saveProfile');
    button.disabled = true;
    try {
      const result = await api('profile.update', profileValues());
      populateUser(result.user);
      show(profileReturnScreen);
      toast('Perfil atualizado com sucesso.');
    } catch (error) { fail(error); }
    finally { button.disabled = false; }
  };
  const loadPlaces = async () => {
    const result = await api('places.list');
    Object.keys(places).forEach(key => delete places[key]);
    result.items.forEach(item => { places[String(item.id)] = item; });
    renderPlaces();
  };

  $('#registerPassword').minLength = 8;
  $('#loginForm').onsubmit = async event => {
    event.preventDefault();
    try {
      const result = await api('login', { email: $('#email').value.trim(), password: $('#password').value });
      populateUser(result.user);
      await loadPlaces();
      show('#placesScreen');
    } catch (error) { fail(error); }
  };
  $('#registerForm').onsubmit = async event => {
    event.preventDefault();
    try {
      await api('register', {
        title: $('#doctorTitle').value,
        name: $('#doctorName').value.trim(),
        specialty: $('#doctorSpecialty').value.trim(),
        crm: $('#doctorCrm').value.trim(),
        rqe: $('#doctorRqe').value.trim(),
        email: $('#registerEmail').value.trim(),
        password: $('#registerPassword').value
      });
      $('#email').value = $('#registerEmail').value.trim();
      $('#registerForm').reset();
      show('#loginScreen');
      toast('Cadastro concluído. Entre com seu e-mail e senha.');
    } catch (error) { fail(error); }
  };
  $('#forgotPasswordForm').onsubmit = async event => {
    event.preventDefault();
    try {
      await api('forgot', { email: $('#forgotEmail').value.trim() });
      show('#loginScreen');
      toast('Solicitação recebida.');
    } catch (error) { fail(error); }
  };
  const logout = async () => {
    try { await api('logout'); } catch (_) {}
    $('#password').value = '';
    show('#loginScreen');
    toast('Você saiu da sua conta.');
  };
  $('#logoutButton').onclick = logout;
  $('#logoutRx').onclick = logout;

  $('#placeForm').onsubmit = async event => {
    event.preventDefault();
    const payload = {
      id: editingKey || null,
      name: $('#placeName').value.trim(),
      cnes: $('#placeCnes').value.trim(),
      cnpj: $('#placeCnpj').value.trim(),
      address: $('#placeAddress').value.trim(),
      phone: $('#placePhone').value.trim(),
      logo: pendingLogo
    };
    if (!payload.name) return;
    try {
      const wasEditing = Boolean(editingKey);
      await api('places.save', payload);
      $('#placeForm').classList.add('hidden');
      resetPlaceForm();
      await loadPlaces();
      toast(wasEditing ? 'Local atualizado com sucesso' : 'Local cadastrado com sucesso');
    } catch (error) { fail(error); }
  };
  $('#placeGrid').onclick = async event => {
    if (event.target.closest('#showPlaceForm')) { showNewPlace(); return; }
    const card = event.target.closest('[data-place]');
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!card || !action) return;
    const key = card.dataset.place;
    if (action === 'attend') openRx(key);
    if (action === 'edit') editPlace(key);
    if (action === 'delete' && confirm(`Excluir o local “${places[key].name}”?`)) {
      try { await api('places.delete', { id: key }); await loadPlaces(); toast('Local excluído'); }
      catch (error) { fail(error); }
    }
  };

  const modelConfigs = [
    { category: 'receita', button: modelsButton, list: '#modelList', form: '#modelForm', name: '#modelName', text: '#modelText', type: '#modelType', get: () => recipeModels, set: v => recipeModels = v, editing: () => editingModelId, clear: () => editingModelId = null, render: renderModels, showForm: showModelForm },
    { category: 'laudo', button: reportModelsButton, list: '#reportModelList', form: '#reportModelForm', name: '#reportModelName', text: '#reportModelText', get: () => reportModels, set: v => reportModels = v, editing: () => editingReportModelId, clear: () => editingReportModelId = null, render: renderReportModels, showForm: showReportModelForm },
    { category: 'atestado', button: certificateModelsButton, list: '#certificateModelList', form: '#certificateModelForm', name: '#certificateModelName', text: '#certificateModelText', get: () => certificateModels, set: v => certificateModels = v, editing: () => editingCertificateModelId, clear: () => editingCertificateModelId = null, render: renderCertificateModels, showForm: showCertificateModelForm },
    { category: 'exame', button: examModelsButton, list: '#examModelList', form: '#examModelForm', name: '#examModelName', text: '#examModelText', get: () => examModels, set: v => examModels = v, editing: () => editingExamModelId, clear: () => editingExamModelId = null, render: renderExamModels, showForm: showExamModelForm },
    { category: 'fisioterapia', button: physioModelsButton, list: '#physioModelList', form: '#physioModelForm', name: '#physioModelName', text: '#physioModelText', get: () => physioModels, set: v => physioModels = v, editing: () => editingPhysioModelId, clear: () => editingPhysioModelId = null, render: renderPhysioModels, showForm: showPhysioModelForm }
  ];
  const loadModels = async config => {
    const result = await api('models.list', { category: config.category });
    config.set(result.items.map(item => ({ ...item, id: String(item.id) })));
    config.render();
  };
  modelConfigs.forEach(config => {
    const originalOpen = config.button.onclick;
    config.button.onclick = async event => {
      try { await loadModels(config); originalOpen.call(config.button, event); }
      catch (error) { fail(error); }
    };
    $(config.form).onsubmit = async event => {
      event.preventDefault();
      try {
        await api('models.save', {
          id: config.editing() || null,
          category: config.category,
          name: $(config.name).value.trim(),
          text: $(config.text).value.trim(),
          type: config.type ? $(config.type).value : 'simples'
        });
        config.clear();
        $(config.form).reset();
        $(config.form).classList.add('hidden');
        await loadModels(config);
        toast('Modelo salvo com sucesso');
      } catch (error) { fail(error); }
    };
    $(config.list).addEventListener('click', async event => {
      const deleteButton = event.target.closest('.delete');
      if (!deleteButton) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (deleteButton.disabled) return;
      const card = deleteButton.closest('article');
      const id = card?.dataset.model || card?.dataset.reportModel || card?.dataset.certificateModel || card?.dataset.examModel || card?.dataset.physioModel;
      const model = config.get().find(item => item.id === id);
      if (!model || !confirm(`Excluir o modelo “${model.name}”?`)) return;
      deleteButton.disabled = true;
      try {
        await api('models.delete', { id, category: config.category });
        if (config.editing() === id) {
          config.clear();
          $(config.form).reset();
          $(config.form).classList.add('hidden');
        }
        await loadModels(config);
        toast('Modelo excluído');
      }
      catch (error) { fail(error); }
      finally { deleteButton.disabled = false; }
    }, true);
  });

  api('status').then(result => {
    if (result.authenticated && result.user) {
      populateUser(result.user);
      loadPlaces().then(() => show('#placesScreen')).catch(fail);
    }
  }).catch(() => {});
})();
