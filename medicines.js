/* Biblioteca de medicamentos do profissional, com seleção para o receituário. */
(() => {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  let medicines = [], localMedicines = [], editing = null;
  const selection = new Set();
  $('#medicineIngredient').required = false;
  const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const api = async (action, payload = {}) => {
    if (local) {
      if (action === 'list') return { items: localMedicines.map(item => ({ ...item })) };
      if (action === 'save') {
        const id = payload.id || crypto.randomUUID();
        localMedicines = localMedicines.filter(item => item.id !== id);
        localMedicines.push({ ...payload, id });
      }
      if (action === 'delete') localMedicines = localMedicines.filter(item => item.id !== payload.id);
      return { ok: true };
    }
    const response = await fetch(`api/index.php?action=medicines.${action}`, {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || 'Não foi possível acessar os medicamentos.');
    return result;
  };
  function updateSelection() {
    const chosen = medicines.filter(item => selection.has(String(item.id)));
    const special = chosen.some(item => item.type === 'especial') || ($('#rxText').value.trim() && $('.type-card.active').dataset.type === 'especial');
    $('#medicineSelectionStatus').textContent = `${chosen.length} selecionado(s)${chosen.length ? ' · ' + (special ? 'Receita Especial' : 'Receita Simples') : ''}`;
    $('#insertMedicines').disabled = !chosen.length;
  }
  function render() {
    const query = normalize($('#medicineSearch').value.trim());
    const visible = medicines.filter(item => normalize(item.name + ' ' + item.ingredient).includes(query));
    $('#medicineList').innerHTML = visible.map(item => `<article class="model-card medicine-card" data-medicine="${safe(String(item.id))}"><div class="model-card-head"><h3>${safe(item.name)}</h3><span class="model-type ${item.type === 'especial' ? 'special' : ''}">${item.type === 'especial' ? 'Receita Especial' : 'Receita Simples'}</span></div><p><b>Princípio ativo:</b> ${safe(item.ingredient)}<br><b>Quantidade:</b> ${safe(item.quantity)}</p><p>${safe(item.prescription)}</p><label class="medicine-select"><input type="checkbox" ${selection.has(String(item.id)) ? 'checked' : ''}><span>Selecionar ${safe(item.name)}</span></label><div class="model-actions"><button type="button" data-medicine-action="edit">Editar</button><button type="button" class="delete" data-medicine-action="delete">Excluir</button></div></article>`).join('');
    if (!visible.length) $('#medicineList').innerHTML = '<div class="empty-models">' + (query ? 'Nenhum medicamento encontrado.' : 'Nenhum medicamento cadastrado. Clique em “Cadastrar medicamento” para começar.') + '</div>';
    updateSelection();
  }
  async function load() {
    const result = await api('list');
    medicines = result.items.map(item => ({ ...item, id: String(item.id) }));
    for (const id of selection) if (!medicines.some(item => item.id === id)) selection.delete(id);
    render();
  }
  function closeForm() { editing = null; $('#medicineForm').reset(); $('#medicineFormStatus').textContent = ''; $('#medicineForm').classList.add('hidden'); }
  function openForm(item) {
    closeForm(); editing = item?.id || null;
    $('#medicineFormTitle').textContent = item ? 'Editar medicamento' : 'Cadastrar medicamento';
    if (item) for (const key of ['name', 'ingredient', 'quantity', 'prescription', 'type']) $('#medicine' + key[0].toUpperCase() + key.slice(1)).value = item[key];
    $('#medicineForm').classList.remove('hidden'); $('#medicineName').focus();
  }
  $('#openMedicines').onclick = async () => {
    $('#medicineStatus').textContent = 'Carregando medicamentos…';
    $('#medicineList').replaceChildren(); $('#insertMedicines').disabled = true;
    closeForm(); show('#medicinesScreen');
    try { await load(); $('#medicineStatus').textContent = ''; }
    catch (error) { medicines = []; selection.clear(); updateSelection(); $('#medicineStatus').textContent = error.message; }
  };
  $('#backFromMedicines').onclick = () => show('#rxScreen');
  $('#newMedicine').onclick = () => openForm();
  $('#cancelMedicine').onclick = closeForm;
  $('#medicineSearch').oninput = render;
  $('#medicineList').onchange = event => {
    const checkbox = event.target.closest('input[type="checkbox"]'), card = checkbox?.closest('[data-medicine]');
    if (!card) return;
    if (checkbox.checked) selection.add(card.dataset.medicine); else selection.delete(card.dataset.medicine);
    updateSelection();
  };
  $('#medicineList').onclick = async event => {
    const button = event.target.closest('[data-medicine-action]'), card = button?.closest('[data-medicine]');
    if (!card) return;
    const item = medicines.find(item => item.id === card.dataset.medicine); if (!item) return;
    if (button.dataset.medicineAction === 'edit') { openForm(item); return; }
    if (!confirm(`Excluir o medicamento “${item.name}”?`)) return;
    button.disabled = true;
    try { await api('delete', { id: item.id }); selection.delete(item.id); if (editing === item.id) closeForm(); await load(); $('#medicineStatus').textContent = 'Medicamento excluído.'; }
    catch (error) { $('#medicineStatus').textContent = error.message; }
    finally { button.disabled = false; }
  };
  $('#medicineForm').onsubmit = async event => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
    const payload = { id: editing };
    for (const key of ['name', 'ingredient', 'quantity', 'prescription', 'type']) payload[key] = $('#medicine' + key[0].toUpperCase() + key.slice(1)).value.trim();
    if (['name', 'quantity', 'prescription'].some(key => payload[key] === '')) { $('#medicineFormStatus').textContent = 'Preencha nome, quantidade e posologia.'; return; }
    const button = $('#saveMedicine'); button.disabled = true;
    try { await api('save', payload); await load(); closeForm(); $('#medicineStatus').textContent = 'Medicamento salvo.'; }
    catch (error) { $('#medicineFormStatus').textContent = error.message; }
    finally { button.disabled = false; }
  };
  $('#insertMedicines').onclick = () => {
    const chosen = medicines.filter(item => selection.has(item.id)); if (!chosen.length) return;
    const previous = $('#rxText').value.trimEnd();
    const special = chosen.some(item => item.type === 'especial') || (previous.trim() && $('.type-card.active').dataset.type === 'especial');
    $(`.type-card[data-type="${special ? 'especial' : 'simples'}"]`).click();
    const blocks = chosen.map(item => `${item.name}-----------${item.quantity}\n${item.prescription}`);
    $('#rxText').value = [previous, ...blocks].filter(Boolean).join('\n\n');
    selection.clear(); updateSelection(); show('#rxScreen'); toast('Medicamentos incluídos no receituário.');
  };
  for (const id of ['#clearPatient', '#clearRx']) $(id).addEventListener('click', () => { selection.clear(); updateSelection(); });
  for (const id of ['#logoutButton', '#logoutRx']) $(id).addEventListener('click', () => { medicines = []; localMedicines = []; selection.clear(); closeForm(); $('#medicineSearch').value = ''; render(); });
})();
