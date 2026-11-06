/* Catálogo por profissional; os cadastros permanecem na API autenticada. */
(() => {
  const local = ['localhost','127.0.0.1'].includes(location.hostname);
  let items = [];
  const request = async (action, data = {}) => {
    const response = await fetch('api/index.php?action='+action, {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const result = await response.json();
    if (!response.ok || !result.ok) throw Error(result.error || 'Não foi possível carregar os procedimentos.');
    return result;
  };
  window.procedureCatalog = {load: async () => {
    if (!local) items = (await request('procedures.list')).items;
    return items.flatMap(item => (item.place_ids || [item.place_id]).map(place_id => ({...item, procedure_id:item.id, id:String(item.id)+':'+String(place_id), place_id})));
  }};
  const section = document.createElement('dialog');
  section.id='procedureSettingsDialog';
  section.className = 'settings-dialog';
  section.innerHTML = `<header class="agenda-settings-heading"><h2>Configurações de procedimentos</h2><button class="btn outline" type="button" id="procedureSettingsClose">Voltar</button></header><nav class="agenda-settings-tabs"><button class="btn outline" type="button" id="procedureAgendaSettings">Configurações de agendamentos</button><b>Procedimentos</b></nav><p>Cadastre cada procedimento com valor, duração e locais de atendimento. Selecione um ou mais locais, ou marque todos. Os locais são cadastrados na tela inicial.</p><form id="procedureForm"><input name="id" type="hidden"><div class="schedule-fields"><label class="field"><span>Procedimento</span><input name="name" maxlength="180" required></label><label class="field"><span>Valor (R$)</span><input name="price" type="number" min="0" max="99999999.99" step="0.01" required></label><label class="field"><span>Duração (minutos)</span><input name="duration" type="number" min="1" max="720" step="1" value="30" required></label><fieldset class="wide"><legend>Locais de atendimento</legend><label class="secretary-place-choice"><input type="checkbox" id="procedureAllPlaces"> Todos os locais</label><div id="procedurePlaceChoices"></div></fieldset></div><div class="schedule-form-actions"><button type="button" class="btn outline" id="procedureNew">Limpar / novo</button><button class="btn blue" type="submit">Salvar procedimento</button></div></form><p id="procedureFeedback" role="status"></p><div id="procedureList"></div>`;
  document.body.append(section);
  const card=document.createElement('section');card.id='profileProcedureSettings';card.className='secretary-profile-card profile-settings-card';
  card.innerHTML='<h2>Configurações de procedimentos</h2><p>Procedimentos, valores, duração e locais de atendimento.</p><button class="btn blue" type="button">Abrir configurações</button>';
  (document.querySelector('#profileSettings')||document.querySelector('#profileScreen')).append(card);
  const form = section.querySelector('form'), feedback = section.querySelector('#procedureFeedback');
  const choices=section.querySelector('#procedurePlaceChoices'),allPlaces=section.querySelector('#procedureAllPlaces');
  const placeInputs=()=>[...choices.querySelectorAll('input')];
  const syncAll=()=>{const inputs=placeInputs();allPlaces.checked=inputs.length>0&&inputs.every(input=>input.checked);allPlaces.indeterminate=inputs.some(input=>input.checked)&&!allPlaces.checked;};
  allPlaces.onchange=()=>{placeInputs().forEach(input=>input.checked=allPlaces.checked);syncAll();};
  const reset=()=>{form.reset();syncAll();};
  const money = value => Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  function render() {
    const list=section.querySelector('#procedureList');list.replaceChildren();
    items.forEach(item => {
      const row=document.createElement('article');row.className='secretary-access-row';
      const text=document.createElement('p');
      const ids=(item.place_ids||[item.place_id]).map(String);
      const names=Object.entries(places).filter(([key,p])=>ids.includes(String(p.id||key))).map(([,p])=>p.name);
      text.textContent=`${item.name} · ${money(item.price)} · ${item.duration} min · ${names.join(', ')||'Local removido'}`;
      row.append(text);
      for (const label of ['Editar','Excluir']) {
        const button=document.createElement('button');button.type='button';button.className='btn outline';button.textContent=label;
        button.onclick=async()=>{
          if(label==='Editar'){for(const key of ['id','name','price','duration'])form.elements[key].value=item[key];placeInputs().forEach(input=>input.checked=ids.includes(input.value));syncAll();return;}
          if(!confirm('Excluir este procedimento? Os agendamentos existentes serão preservados.'))return;
          button.disabled=true;
          try {if(!local)await request('procedures.delete',{id:item.id});items=items.filter(p=>p.id!==item.id);reset();render();feedback.textContent='Procedimento excluído.';document.dispatchEvent(new Event('procedures:saved'));}
          catch(e){feedback.textContent=e.message;}finally{button.disabled=false;}
        };
        row.append(button);
      }
      list.append(row);
    });
    if(!items.length)list.textContent='Nenhum procedimento cadastrado.';
  }
  async function load() {
    reset();feedback.textContent='Carregando procedimentos…';choices.replaceChildren();
    Object.entries(places).forEach(([key,p])=>{
      const label=document.createElement('label'),input=document.createElement('input');label.className='secretary-place-choice';
      input.type='checkbox';input.name='place_ids';input.value=String(p.id||key);input.onchange=syncAll;
      label.append(input,document.createTextNode(p.name));choices.append(label);
    });
    allPlaces.disabled=!placeInputs().length;syncAll();
    if(!placeInputs().length)choices.textContent='Cadastre um local na tela inicial.';
    try{await window.procedureCatalog.load();render();feedback.textContent=local?'Prévia local: cadastros temporários.':'';}catch(e){feedback.textContent=e.message;}
  }
  window.procedureSettings={open:async()=>{
    if(window.currentSessionUser?.secretary_owner_id)return;
    section.showModal();await load();
  }};
  card.querySelector('button').onclick=()=>window.procedureSettings.open();
  section.querySelector('#procedureSettingsClose').onclick=()=>section.close();
  section.querySelector('#procedureAgendaSettings').onclick=()=>{section.close();window.agendaSettings.open();};
  section.querySelector('#procedureNew').onclick=()=>{reset();feedback.textContent='';};
  form.onsubmit=async event=>{
    event.preventDefault();const value=Object.fromEntries(new FormData(form));
    value.place_ids=placeInputs().filter(input=>input.checked).map(input=>input.value);value.place_id=value.place_ids[0];
    if(!value.place_ids.length){feedback.textContent='Selecione pelo menos um local de atendimento.';return;}
    const button=form.querySelector('[type=submit]');button.disabled=true;
    try{
      if(local){value.id=value.id||String(Date.now());items=items.filter(p=>String(p.id)!==String(value.id));items.push(value);}
      else{await request('procedures.save',value);await window.procedureCatalog.load();}
      reset();render();feedback.textContent='Procedimento salvo.';document.dispatchEvent(new Event('procedures:saved'));
    }catch(e){feedback.textContent=e.message;}finally{button.disabled=false;}
  };
  document.addEventListener('patients:load',()=>{items=[];form.reset();section.close();section.querySelector('#procedureList').replaceChildren();});
  ['logoutButton','logoutRx'].forEach(id=>document.getElementById(id).addEventListener('click',()=>{items=[];form.reset();section.close();section.querySelector('#procedureList').replaceChildren();}));
})();
