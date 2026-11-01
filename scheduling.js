/* Agenda administrativa e fila de consultas. Dados reais permanecem na API autenticada. */
(() => {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const statuses = ['Agendado', 'Confirmado', 'Aguardando', 'Em atendimento', 'Finalizado', 'Cancelado', 'Faltou'];
  const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Fortaleza', year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  let items = [], memory = [], patients = [], mode = 'agenda', sequence = 0;
  const screen = document.createElement('section');
  screen.id = 'schedulingScreen'; screen.className = 'screen hidden';
  screen.innerHTML = `<header class="top"><div class="logo"><div class="mark">FR</div><div><b>Flow Receita</b><small>Agenda e consultas</small></div></div><button class="btn outline" id="scheduleBack">← Início</button></header><main class="page"><nav class="home-tabs" aria-label="Agenda e consultas"><button class="home-tab" id="scheduleAgenda">Agendamentos</button><button class="home-tab" id="scheduleConsultations">Consultas</button></nav><div class="schedule-title"><div><span class="eyebrow">Organização dos atendimentos</span><h1 id="scheduleHeading">Agendamentos</h1><p id="scheduleProfessional"></p></div><button class="btn blue" id="scheduleNew">+ Novo agendamento</button></div><div class="schedule-toolbar"><button class="btn outline" id="schedulePrevious" aria-label="Dia anterior">‹</button><button class="btn outline" id="scheduleToday">Hoje</button><button class="btn outline" id="scheduleNext" aria-label="Próximo dia">›</button><label class="field"><span>Data</span><input type="date" id="scheduleDate" required></label><label class="field"><span>Local</span><select id="schedulePlaceFilter"><option value="">Todos os locais</option></select></label><label class="field"><span>Buscar paciente</span><input id="scheduleSearch" type="search" placeholder="Nome ou CPF"></label><label><input type="checkbox" id="scheduleFinished"> Mostrar finalizados e cancelados</label></div><p id="scheduleFeedback" role="status" aria-live="polite"></p><div id="scheduleBody"></div><dialog id="scheduleDialog"><form id="scheduleForm"><div class="schedule-title"><h2 id="scheduleFormHeading">Novo agendamento</h2><button class="btn outline" type="button" id="scheduleClose" aria-label="Fechar cadastro">✕</button></div><p>Busque um paciente cadastrado ou preencha os dados para cadastrá-lo junto ao agendamento.</p><div class="schedule-fields"><label class="field wide"><span>Paciente cadastrado</span><select id="schedulePatient"><option value="">Novo paciente / selecionar cadastro</option></select></label></div><div class="schedule-fields" id="scheduleFields"></div><p id="scheduleFormError" role="alert"></p><div class="schedule-form-actions"><button class="btn outline" type="button" id="scheduleCancel">Voltar</button><button class="btn blue" type="submit" id="scheduleSave">Salvar agendamento</button></div></form></dialog></main>`;
  document.body.append(screen);
  const q = id => screen.querySelector('#' + id);
  const isSecretary = () => !!window.currentSessionUser?.secretary_owner_id;
  const originalShow = show;
  show = id => {
    if(isSecretary()&&!['#loginScreen','#forgotPasswordScreen','#resetPasswordScreen','#schedulingScreen'].includes(id)) {
      originalShow('#schedulingScreen');refreshPlaces();load();return;
    }
    originalShow(id);
  };
  const fields = [
    ['name','Nome completo','text',180,true],['cpf','CPF','text',11,true],['birth_date','Data de nascimento','date',null,true],['phone','Telefone celular','tel',30,false],
    ['date','Data do atendimento','date',null,true],['start','Hora inicial','time',null,true],['end','Hora final','time',null,true],['procedure','Procedimento','text',180,true],['attendance_type','Tipo de atendimento','select',null,true],['place_id','Local','select',null,true],['status','Status','select',null,true],['insurance','Convênio / particular','text',120,false],['notes','Observações do agendamento','textarea',4000,false]
  ];
  const inputs = {};
  const option = (value, label=value) => { const el=document.createElement('option'); el.value=value; el.textContent=label; return el; };
  fields.forEach(([name,label,type,max,required]) => {
    const wrapper=document.createElement('label'); wrapper.className='field'+(name==='notes'?' wide':'');
    const caption=document.createElement('span'); caption.textContent=label+(required?' *':'');
    const input=document.createElement(type==='select'?'select':type==='textarea'?'textarea':'input');
    if (input.tagName==='INPUT') input.type=type;
    input.name=name; input.required=required; if(max) input.maxLength=max;
    if(name==='cpf') { input.inputMode='numeric'; input.pattern='[0-9]{11}'; }
    inputs[name]=input; wrapper.append(caption,input); q('scheduleFields').append(wrapper);
  });
  statuses.forEach(s=>inputs.status.append(option(s)));
  ['Consulta','Retorno','Exame','Procedimento','Teleconsulta','Outro'].forEach(s=>inputs.attendance_type.append(option(s)));
  const request = async (action,data={}) => {
    const response=await fetch('api/index.php?action='+encodeURIComponent(action),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const result=await response.json(); if(!response.ok||!result.ok) throw new Error(result.error||'Não foi possível carregar a agenda.'); return result;
  };
  const visible = () => items.filter(i=>(!q('schedulePlaceFilter').value||String(i.place_id)===q('schedulePlaceFilter').value)&&(!['Finalizado','Cancelado','Faltou'].includes(i.status)||q('scheduleFinished').checked)&&(i.name+' '+i.cpf).toLocaleLowerCase('pt-BR').includes(q('scheduleSearch').value.trim().toLocaleLowerCase('pt-BR')));
  const button = (label, action) => { const el=document.createElement('button');el.type='button';el.className='btn outline';el.textContent=label;el.onclick=action;return el; };
  function render() {
    const body=q('scheduleBody');body.replaceChildren();
    q('scheduleHeading').textContent=mode==='agenda'?'Agendamentos':'Consultas';
    q('scheduleAgenda').setAttribute('aria-current',mode==='agenda'?'page':'false'); q('scheduleConsultations').setAttribute('aria-current',mode==='consultas'?'page':'false');
    q('scheduleProfessional').textContent='Profissional: '+(doctor.name||document.querySelector('#userEmail').textContent);
    if(isSecretary())q('scheduleProfessional').textContent='Secretaria · Agenda do profissional responsável';
    q('scheduleBack').textContent=isSecretary()?'Sair':'← Início';
    const rows=visible(); q('scheduleFeedback').textContent=`${rows.length} atendimento(s) em ${q('scheduleDate').value.split('-').reverse().join('/')}.`+(local?' Prévia local: dados temporários, apagados ao recarregar.':'');
    if(mode==='agenda') {
      const grid=document.createElement('div');grid.className='schedule-grid';
      const times=new Set(Array.from({length:67},(_,i)=>{const m=420+i*10;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');}));
      rows.forEach(i=>times.add(i.start));
      [...times].sort().forEach(time=>{
        const row=document.createElement('div');row.className='schedule-slot';row.append(button(time,()=>edit(null,time)));
        const content=document.createElement('div');content.className='schedule-slot-content';
        rows.filter(i=>i.start===time).forEach(i=>{const card=button(`${i.start}–${i.end} · ${i.name} · ${i.procedure} · ${i.attendance_type} · ${i.status}`,()=>edit(i));card.classList.add('schedule-event');content.append(card);});
        row.append(content);grid.append(row);
      }); body.append(grid);
    } else {
      const wrap=document.createElement('div');wrap.className='schedule-table-wrap';const table=document.createElement('table');table.className='schedule-table';
      const thead=document.createElement('thead'),head=document.createElement('tr');thead.append(head);table.append(thead);['Ações','Paciente','Horário','Procedimento / tipo','Local','Status','Convênio'].forEach(t=>{const th=document.createElement('th');th.textContent=t;head.append(th);});
      const tbody=document.createElement('tbody');table.append(tbody);rows.forEach(i=>{const row=document.createElement('tr'),actions=document.createElement('td');tbody.append(row);row.append(actions);actions.append(button('Editar',()=>edit(i)));if(!isSecretary()&&!['Cancelado','Faltou','Finalizado'].includes(i.status))actions.append(button('Atender',()=>attend(i)));[i.name,`${i.start}–${i.end}`,`${i.procedure} / ${i.attendance_type}`,i.place_name,i.status,i.insurance||'Particular'].forEach(t=>{const cell=document.createElement('td');cell.textContent=t;row.append(cell);});});
      if(!rows.length){const row=document.createElement('tr'),cell=document.createElement('td');row.append(cell);tbody.append(row);cell.colSpan=7;cell.textContent='Nenhuma consulta encontrada para os filtros selecionados.';} wrap.append(table);body.append(wrap);
    }
  }
  async function load() {
    const current=++sequence; q('scheduleBody').replaceChildren();q('scheduleFeedback').textContent='Carregando agenda…';
    try { const loaded=local?memory.filter(i=>i.date===q('scheduleDate').value):(await request('schedule.list',{date:q('scheduleDate').value})).items; if(current!==sequence)return;items=loaded;render(); }
    catch(e){if(current===sequence){items=[];q('scheduleFeedback').textContent=e.message;}}
  }
  function refreshPlaces() {
    const previous=q('schedulePlaceFilter').value;q('schedulePlaceFilter').replaceChildren(option('','Todos os locais'));inputs.place_id.replaceChildren(option('','Selecione…'));
    Object.entries(places).forEach(([key,p])=>{const id=String(p.id||key);inputs.place_id.append(option(id,p.name));q('schedulePlaceFilter').append(option(id,p.name));});q('schedulePlaceFilter').value=previous;
  }
  let editingId=null;
  async function edit(item=null,time='07:00') {
    q('scheduleForm').reset();q('scheduleFormError').textContent='';editingId=item?.id||null;
    refreshPlaces();q('scheduleFormHeading').textContent=item?'Editar agendamento':'Novo agendamento';
    const minutes=Number(time.slice(0,2))*60+Number(time.slice(3))+10;
    const defaults={date:q('scheduleDate').value,start:time,end:`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`,procedure:'Consulta',attendance_type:'Consulta',status:'Agendado'};
    fields.forEach(([name])=>inputs[name].value=String(item?.[name]??defaults[name]??''));
    q('schedulePatient').replaceChildren(option('','Novo paciente / selecionar cadastro'));
    q('scheduleDialog').showModal();
    try { patients=local?[]:(await request('patients.list')).items;patients.forEach(p=>q('schedulePatient').append(option(p.id,`${p.name} · ${p.cpf}`))); }
    catch(e){q('scheduleFormError').textContent='Busca de pacientes indisponível: '+e.message;}
  }
  q('schedulePatient').onchange=()=>{const p=patients.find(p=>String(p.id)===q('schedulePatient').value);if(p)for(const name of ['name','cpf','birth_date','phone'])inputs[name].value=p[name]||'';};
  async function save(value) {
    if(!local)return request('schedule.save',value);
    if(!['Cancelado','Faltou'].includes(value.status)&&memory.some(i=>i.id!==value.id&&i.date===value.date&&!['Cancelado','Faltou'].includes(i.status)&&i.start<value.end&&i.end>value.start))throw new Error('Já existe um atendimento nesse horário.');
    const place=Object.entries(places).find(([key,p])=>String(p.id||key)===String(value.place_id))?.[1];
    const item={...value,id:value.id||Date.now(),place_name:place?.name||''};memory=memory.filter(i=>i.id!==item.id);memory.push(item);return {ok:true,id:item.id};
  }
  q('scheduleForm').onsubmit=async event=>{
    event.preventDefault(); const value=Object.fromEntries(fields.map(([name])=>[name,inputs[name].value.trim()]));value.id=editingId;
    if(value.start>=value.end||patientAge(value.birth_date)===null||value.name.split(/\s+/).length<2){q('scheduleFormError').textContent='Confira nome completo, nascimento e horário final posterior ao inicial.';return;}
    q('scheduleSave').disabled=true;
    try {await save(value);q('scheduleDialog').close();await load();document.dispatchEvent(new Event('schedule:saved'));toast('Agendamento salvo.');}
    catch(e){q('scheduleFormError').textContent=e.message;}finally{q('scheduleSave').disabled=false;}
  };
  async function attend(item) {
    const key=Object.keys(places).find(k=>String(places[k].id||k)===String(item.place_id));
    if(!key){toast('Local indisponível. Atualize a agenda.');return;}
    if(window.consultationTimer?.snapshot()){toast('Salve e encerre o atendimento atual antes de abrir outra consulta.');return;}
    if((document.querySelector('#rxText').value.trim()||document.querySelector('#clinicalHistory').value.trim())&&!confirm('Abrir esta consulta e limpar os textos do atendimento anterior?'))return;
    try {await save({...item,status:'Em atendimento'});clearPatient();document.querySelector('#rxText').value='';
      for(const [id,name] of [['patientName','name'],['patientDoc','cpf'],['patientBirthDate','birth_date']]){const input=document.querySelector('#'+id);input.value=item[name];input.dispatchEvent(new Event('input',{bubbles:true}));}
      document.querySelector('#rxDate').value=item.date;updatePaperPatient();openRx(key);
    }catch(e){toast(e.message);}
  }
  function open(target) {mode=target;refreshPlaces();show('#schedulingScreen');load();}
  for(const host of [document.querySelector('#placesScreen .home-tabs'),document.querySelector('#patientsScreen .top'),document.querySelector('.rx-nav')]) {
    if(!host)continue;host.append(button('Agendamentos',()=>open('agenda')),button('Consultas',()=>open('consultas')));
  }
  q('scheduleDate').value=today();q('scheduleDate').onchange=load;
  q('scheduleBack').onclick=()=>{if(isSecretary())document.querySelector('#logoutButton').click();else show('#placesScreen');};q('scheduleNew').onclick=()=>edit();
  q('scheduleClose').onclick=q('scheduleCancel').onclick=()=>q('scheduleDialog').close();
  q('scheduleAgenda').onclick=()=>{mode='agenda';render();};q('scheduleConsultations').onclick=()=>{mode='consultas';render();};
  q('scheduleToday').onclick=()=>{q('scheduleDate').value=today();load();};
  for(const [id,delta] of [['schedulePrevious',-1],['scheduleNext',1]])q(id).onclick=()=>{const date=new Date(q('scheduleDate').value+'T12:00:00');date.setDate(date.getDate()+delta);q('scheduleDate').value=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;load();};
  ['schedulePlaceFilter','scheduleFinished'].forEach(id=>q(id).onchange=render);q('scheduleSearch').oninput=render;
  document.addEventListener('patients:load',()=>{sequence++;items=[];memory=[];patients=[];q('scheduleBody').replaceChildren();q('scheduleForm').reset();if(q('scheduleDialog').open)q('scheduleDialog').close();});
  ['logoutButton','logoutRx'].forEach(id=>document.querySelector('#'+id).addEventListener('click',()=>{sequence++;items=[];memory=[];patients=[];q('scheduleBody').replaceChildren();q('scheduleForm').reset();if(q('scheduleDialog').open)q('scheduleDialog').close();}));
})();
