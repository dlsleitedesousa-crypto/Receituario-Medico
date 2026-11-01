/* Gestão da equipe e dos locais autorizados dentro de Meu perfil. */
(() => {
  const host=document.querySelector('#profileScreen');
  const section=document.createElement('section');section.className='secretary-profile-card';
  section.innerHTML='<h2>Secretárias</h2><p>Cadastre os acessos da secretaria e escolha os locais em que cada pessoa pode marcar consultas.</p><button class="btn blue" type="button" id="manageSecretaries">Cadastrar e gerenciar secretárias</button>';
  host.append(section);
  const dialog=document.createElement('dialog');dialog.id='secretaryAccessDialog';
  dialog.innerHTML='<form id="secretaryAccessForm"><h2>Cadastro de secretárias</h2><label class="field"><span>Nome</span><input name="name" maxlength="180" required></label><label class="field"><span>E-mail de acesso</span><input name="email" type="email" maxlength="190" required autocomplete="off"></label><label class="field"><span>Senha inicial / nova senha</span><input name="password" type="password" minlength="8" maxlength="72" autocomplete="new-password"><small>Obrigatória para novo acesso. Deixe em branco ao editar para manter a senha atual.</small></label><fieldset><legend>Locais em que pode marcar consultas</legend><div id="secretaryPlaceChoices"></div></fieldset><p id="secretaryAccessError" role="alert"></p><div class="schedule-form-actions"><button type="button" class="btn outline" id="secretaryNew">Novo cadastro</button><button class="btn blue" type="submit">Salvar secretária</button><button type="button" class="btn outline" id="secretaryAccessClose">Fechar</button></div><h3>Secretárias cadastradas</h3><div id="secretaryAccessList"></div></form>';
  document.body.append(dialog);
  const q=id=>dialog.querySelector('#'+id),form=q('secretaryAccessForm');let availablePlaces=[];
  const request=async(action,data={})=>{
    const response=await fetch('api/index.php?action='+encodeURIComponent(action),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'Não foi possível salvar o acesso.');return result;
  };
  const reset=()=>{form.reset();form.elements.email.readOnly=false;q('secretaryAccessError').textContent='';};
  function edit(person) {
    reset();form.elements.name.value=person.name;form.elements.email.value=person.email;form.elements.email.readOnly=true;
    q('secretaryPlaceChoices').querySelectorAll('input').forEach(input=>input.checked=person.place_ids===null||person.place_ids.map(String).includes(input.value));
    form.elements.name.focus();
  }
  async function load() {
    const [placeResult,result]=await Promise.all([request('places.list'),request('secretaries.list')]);availablePlaces=placeResult.items;
    q('secretaryPlaceChoices').replaceChildren();
    availablePlaces.forEach(place=>{const label=document.createElement('label'),input=document.createElement('input');label.className='secretary-place-choice';input.type='checkbox';input.value=String(place.id);input.name='place_ids';label.append(input,document.createTextNode(place.name));q('secretaryPlaceChoices').append(label);});
    if(!availablePlaces.length)q('secretaryPlaceChoices').textContent='Cadastre um local de atendimento antes de adicionar secretárias.';
    q('secretaryAccessList').replaceChildren();
    result.items.forEach(person=>{
      const row=document.createElement('article');row.className='secretary-access-row';const label=document.createElement('p');
      const names=availablePlaces.filter(p=>person.place_ids===null||person.place_ids.map(String).includes(String(p.id))).map(p=>p.name);
      label.textContent=`${person.name} · ${person.email} · ${Number(person.secretary_enabled)?'Ativa':'Desativada'} · Locais: ${names.join(', ')||'Nenhum local disponível'}`;
      const editButton=document.createElement('button');editButton.type='button';editButton.className='btn outline';editButton.textContent=Number(person.secretary_enabled)?'Editar locais e cadastro':'Editar / reativar';editButton.onclick=()=>edit(person);row.append(label,editButton);
      if(Number(person.secretary_enabled)){const disable=document.createElement('button');disable.type='button';disable.className='btn outline';disable.textContent='Desativar acesso';disable.onclick=async()=>{disable.disabled=true;try{await request('secretaries.disable',{id:person.id});await load();reset();}catch(e){q('secretaryAccessError').textContent=e.message;}finally{disable.disabled=false;}};row.append(disable);}
      q('secretaryAccessList').append(row);
    });
    if(!result.items.length)q('secretaryAccessList').textContent='Nenhuma secretária cadastrada.';
  }
  document.querySelector('#manageSecretaries').onclick=async()=>{
    if(window.currentSessionUser?.secretary_owner_id)return;
    if(['localhost','127.0.0.1'].includes(location.hostname)){toast('O cadastro de acessos está disponível no site com PHP/MySQL.');return;}
    reset();q('secretaryPlaceChoices').replaceChildren();q('secretaryAccessList').replaceChildren();dialog.showModal();try{await load();}catch(e){q('secretaryAccessError').textContent=e.message;}
  };
  q('secretaryNew').onclick=reset;q('secretaryAccessClose').onclick=()=>{reset();dialog.close();};
  form.onsubmit=async event=>{
    event.preventDefault();const place_ids=[...q('secretaryPlaceChoices').querySelectorAll('input:checked')].map(input=>Number(input.value));
    if(!place_ids.length){q('secretaryAccessError').textContent='Selecione pelo menos um local permitido.';return;}
    const submit=form.querySelector('[type=submit]');submit.disabled=true;
    try{await request('secretaries.save',{name:form.elements.name.value.trim(),email:form.elements.email.value.trim(),password:form.elements.password.value,place_ids});await load();reset();toast('Cadastro e locais da secretária salvos.');}catch(e){q('secretaryAccessError').textContent=e.message;}finally{submit.disabled=false;}
  };
  ['logoutButton','logoutRx'].forEach(id=>document.querySelector('#'+id).addEventListener('click',()=>{reset();q('secretaryAccessList').replaceChildren();q('secretaryPlaceChoices').replaceChildren();if(dialog.open)dialog.close();}));
})();
