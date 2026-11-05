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
    return items;
  }};
  const section = document.createElement('section');
  section.className = 'secretary-profile-card';
  section.innerHTML = `<h2>Configurações da agenda</h2><p>Cadastre cada procedimento com valor, duração e local de atendimento. Para oferecer em outro local, crie outro cadastro. Os locais são cadastrados na tela inicial.</p><form id="procedureForm"><input name="id" type="hidden"><div class="schedule-fields"><label class="field"><span>Procedimento</span><input name="name" maxlength="180" required></label><label class="field"><span>Valor (R$)</span><input name="price" type="number" min="0" max="99999999.99" step="0.01" required></label><label class="field"><span>Duração (minutos)</span><input name="duration" type="number" min="1" max="720" step="1" value="30" required></label><label class="field"><span>Local de atendimento</span><select name="place_id" required></select></label></div><div class="schedule-form-actions"><button type="button" class="btn outline" id="procedureNew">Limpar / novo</button><button class="btn blue" type="submit">Salvar procedimento</button></div></form><p id="procedureFeedback" role="status"></p><div id="procedureList"></div>`;
  document.querySelector('#profileScreen').append(section);
  const form = section.querySelector('form'), feedback = section.querySelector('#procedureFeedback');
  const money = value => Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  function render() {
    const list=section.querySelector('#procedureList');list.replaceChildren();
    items.forEach(item => {
      const row=document.createElement('article');row.className='secretary-access-row';
      const text=document.createElement('p');
      const place=Object.entries(places).find(([key,p])=>String(p.id||key)===String(item.place_id))?.[1];
      text.textContent=`${item.name} · ${money(item.price)} · ${item.duration} min · ${place?.name||'Local removido'}`;
      row.append(text);
      for (const label of ['Editar','Excluir']) {
        const button=document.createElement('button');button.type='button';button.className='btn outline';button.textContent=label;
        button.onclick=async()=>{
          if(label==='Editar'){for(const key of ['id','name','price','duration','place_id'])form.elements[key].value=item[key];return;}
          if(!confirm('Excluir este procedimento? Os agendamentos existentes serão preservados.'))return;
          button.disabled=true;
          try {if(!local)await request('procedures.delete',{id:item.id});items=items.filter(p=>p.id!==item.id);form.reset();render();feedback.textContent='Procedimento excluído.';}
          catch(e){feedback.textContent=e.message;}finally{button.disabled=false;}
        };
        row.append(button);
      }
      list.append(row);
    });
    if(!items.length)list.textContent='Nenhum procedimento cadastrado.';
  }
  document.querySelectorAll('.open-profile').forEach(button=>button.addEventListener('click',async()=>{
    form.reset();feedback.textContent='Carregando procedimentos…';form.elements.place_id.replaceChildren();
    const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Selecione o local';form.elements.place_id.append(placeholder);
    Object.entries(places).forEach(([key,p])=>{const option=document.createElement('option');option.value=p.id||key;option.textContent=p.name;form.elements.place_id.append(option);});
    try{await window.procedureCatalog.load();render();feedback.textContent=local?'Prévia local: cadastros temporários.':'';}catch(e){feedback.textContent=e.message;}
  }));
  section.querySelector('#procedureNew').onclick=()=>{form.reset();feedback.textContent='';};
  form.onsubmit=async event=>{
    event.preventDefault();const value=Object.fromEntries(new FormData(form));const button=form.querySelector('[type=submit]');button.disabled=true;
    try{
      if(local){value.id=value.id||String(Date.now());items=items.filter(p=>String(p.id)!==String(value.id));items.push(value);}
      else{await request('procedures.save',value);await window.procedureCatalog.load();}
      form.reset();render();feedback.textContent='Procedimento salvo.';
    }catch(e){feedback.textContent=e.message;}finally{button.disabled=false;}
  };
  document.addEventListener('patients:load',()=>{items=[];form.reset();section.querySelector('#procedureList').replaceChildren();});
  ['logoutButton','logoutRx'].forEach(id=>document.getElementById(id).addEventListener('click',()=>{items=[];form.reset();section.querySelector('#procedureList').replaceChildren();}));
})();
