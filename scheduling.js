/* Agenda administrativa e fila de consultas. Dados reais permanecem na API autenticada. */
(() => {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const statuses = ['Agendado', 'Confirmado', 'Aguardando', 'Em atendimento', 'Finalizado', 'Cancelado', 'Faltou'];
  const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Fortaleza', year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  let items = [], memory = [], patients = [], mode = 'agenda', sequence = 0;
  const screen = document.createElement('section');
  screen.id = 'schedulingScreen'; screen.className = 'screen hidden';
  screen.innerHTML = `<header class="top"><div class="logo"><div class="mark">FR</div><div><b>Flow Receita</b><small>Agenda e consultas</small></div></div><button class="btn outline" id="scheduleBack">← Início</button></header><main class="page"><nav class="home-tabs" aria-label="Agenda e consultas"><button class="home-tab" id="scheduleAgenda">Agendamentos</button><button class="home-tab" id="scheduleConsultations">Consultas</button></nav><div class="schedule-title"><div><span class="eyebrow">Organização dos atendimentos</span><h1 id="scheduleHeading">Agendamentos</h1><p id="scheduleProfessional"></p></div><button class="btn blue" id="scheduleNew">+ Novo agendamento</button></div><div class="schedule-toolbar"><button class="btn outline" id="schedulePrevious" aria-label="Dia anterior">‹</button><button class="btn outline" id="scheduleToday">Hoje</button><button class="btn outline" id="scheduleNext" aria-label="Próximo dia">›</button><label class="field"><span>Data</span><input type="date" id="scheduleDate" required></label><label class="field"><span>Local</span><select id="schedulePlaceFilter"><option value="">Todos os locais</option></select></label><label class="field"><span>Buscar paciente</span><input id="scheduleSearch" type="search" placeholder="Nome ou CPF"></label><label id="scheduleFinishedFilter"><input type="checkbox" id="scheduleFinished"> Mostrar finalizados e cancelados</label></div><p id="scheduleFeedback" role="status" aria-live="polite"></p><div id="scheduleBody"></div><dialog id="scheduleDialog"><form id="scheduleForm"><div class="schedule-title"><h2 id="scheduleFormHeading">Novo agendamento</h2><button class="btn outline" type="button" id="scheduleClose" aria-label="Fechar cadastro">✕</button></div><p>Busque um paciente cadastrado ou preencha os dados para cadastrá-lo junto ao agendamento.</p><div class="schedule-fields" id="schedulePatientField"></div><div class="schedule-fields" id="scheduleFields"></div><p id="scheduleFormError" role="alert"></p><div class="schedule-form-actions"><button class="btn outline" type="button" id="scheduleCancel">Voltar</button><button class="btn blue" type="submit" id="scheduleSave">Salvar agendamento</button></div></form></dialog></main>`;
  document.body.append(screen);
  const q = id => screen.querySelector('#' + id);
  const detailsDialog=document.createElement('dialog');detailsDialog.id='scheduleDetailsDialog';
  detailsDialog.setAttribute('aria-labelledby','scheduleDetailsHeading');
  detailsDialog.innerHTML='<form id="scheduleStatusForm"><div class="schedule-title"><h2 id="scheduleDetailsHeading">Visualizar agendamento</h2><button type="button" class="btn outline" id="scheduleDetailsClose" aria-label="Fechar agendamento">✕</button></div><h3 id="scheduleDetailsPatient"></h3><p id="scheduleDetailsSummary"></p><label class="field"><span>Alterar status</span><select id="scheduleStatus" required aria-label="Alterar status do agendamento"></select></label><p id="scheduleStatusError" role="alert"></p><div class="schedule-form-actions"><button type="button" class="btn outline" id="scheduleDetailsEdit">Editar agendamento</button><button type="submit" class="btn blue" id="scheduleStatusSave">Salvar status</button></div></form>';
  screen.append(detailsDialog);
  const model=window.agendaModel;
  let settings={...model.defaults},view='day',monthCursor=null;
  const shell=document.createElement('div');shell.className='agenda-workspace';
  const panel=document.createElement('section');panel.className='agenda-main';
  const controls=document.createElement('div');controls.className='agenda-viewbar';
  controls.innerHTML='<h2 id="agendaDateHeading"></h2><div class="agenda-view-buttons" aria-label="Visualização da agenda"><button type="button" data-view="day">Dia</button><button type="button" data-view="week">Semana</button><button type="button" data-view="month">Mês</button><button type="button" data-view="list">Compromissos</button></div>';
  const aside=document.createElement('aside');aside.className='agenda-sidebar';
  aside.innerHTML='<button type="button" class="agenda-sidebar-toggle" id="agendaCollapse">› Recolher painel</button><b id="agendaCount"></b><label class="agenda-toggle"><input type="checkbox" id="agendaOnlyValid"> Somente válidos</label><button class="agenda-side-action" id="agendaSearchFocus" type="button">⌕ Buscar agendamento</button><button class="agenda-side-action" id="agendaWaiting" type="button">◷ Pacientes aguardando <b id="agendaWaitingCount">0</b></button><section class="agenda-mini-calendar"><h3>▦ Calendário</h3><div class="agenda-calendar-nav"><button type="button" id="agendaMonthPrevious" aria-label="Mês anterior">‹</button><b id="agendaMonthHeading"></b><button type="button" id="agendaMonthNext" aria-label="Próximo mês">›</button></div><div id="agendaCalendarDays"></div></section><div class="agenda-legend" aria-label="Cores dos status"></div><button class="agenda-side-action" id="agendaConfigure" type="button">⚙ Configurações de agendamentos</button><button class="agenda-side-action" id="agendaProcedures" type="button">◇ Configurações de procedimentos</button><button class="agenda-side-action" id="agendaPrint" type="button">▤ Imprimir agenda</button><button class="agenda-side-action" id="agendaExport" type="button">↓ Exportar agenda</button>';
  q('scheduleBody').before(shell);panel.append(controls,q('scheduleBody'));shell.append(panel,aside);
  const isSecretary = () => !!window.currentSessionUser?.secretary_owner_id;
  const originalShow = show;
  show = id => {
    if(isSecretary()&&!['#loginScreen','#forgotPasswordScreen','#resetPasswordScreen','#schedulingScreen'].includes(id)) {
      originalShow('#schedulingScreen');refreshPlaces();load();return;
    }
    originalShow(id);
  };
  const fields = [
    ['name','Paciente / nome completo','text',180,true],['place_id','Local','select',null,true],['date','Data do atendimento','date',null,true],['start','Hora inicial','time',null,true],['end','Hora final','time',null,true],['status','Status','select',null,true],['procedure','Procedimento','select',null,true],['visit_mode','Modalidade do atendimento','select',null,true],['price','Valor (R$)','number',null,true],['cpf','CPF','text',14,true],['birth_date','Data de nascimento','date',null,true],['sex','Sexo biológico','select',null,false],['phone','Telefone celular','tel',15,false],['email','E-mail','email',190,false],['city','Cidade','text',180,false],['notes','Observações do agendamento','textarea',4000,false]
  ];
  const inputs = {};
  const option = (value, label=value) => { const el=document.createElement('option'); el.value=value; el.textContent=label; return el; };
  fields.forEach(([name,label,type,max,required]) => {
    const wrapper=document.createElement('label'); wrapper.className='field'+(['name','place_id','notes'].includes(name)?' wide':'');
    const caption=document.createElement('span'); caption.textContent=label+(required?' *':'');
    const input=document.createElement(type==='select'?'select':type==='textarea'?'textarea':'input');
    if (input.tagName==='INPUT') input.type=type;
    input.name=name; input.required=required; if(max) input.maxLength=max;
    if(name==='cpf') { input.inputMode='numeric'; input.placeholder='000.000.000-00'; input.pattern='[0-9]{3}\\.[0-9]{3}\\.[0-9]{3}-[0-9]{2}'; }
    inputs[name]=input; wrapper.append(caption,input);
    if(name==='name')q('schedulePatientField').append(wrapper);else q('scheduleFields').append(wrapper);
  });
  const digits = value => String(value||'').replace(/\D/g,'');
  const formatPhone = value => {
    const d=digits(value).slice(0,11);
    return d.length<3?d:'('+d.slice(0,2)+') '+(d.length>10?d.slice(2,7)+(d.length>7?'-'+d.slice(7):''):d.slice(2,6)+(d.length>6?'-'+d.slice(6):''));
  };
  inputs.cpf.oninput=()=>inputs.cpf.value=formatDoctorCpf(inputs.cpf.value);
  inputs.phone.oninput=()=>inputs.phone.value=formatPhone(inputs.phone.value);
  inputs.phone.placeholder='(00) 00000-0000';inputs.phone.pattern='\\([0-9]{2}\\) [0-9]{4,5}-[0-9]{4}';
  inputs.price.min='0';inputs.price.max='99999999.99';inputs.price.step='0.01';
  let catalog=[];
  let activeVisit=null;
  const drafts=new Map();
  const gridProcedure=document.createElement('select');gridProcedure.id='scheduleProcedureFilter';
  const gridLabel=document.createElement('label');gridLabel.className='field';
  const gridCaption=document.createElement('span');gridCaption.textContent='Procedimento / duração dos horários';
  gridLabel.append(gridCaption,gridProcedure);q('scheduleDate').parentNode?.parentNode.append(gridLabel);
  const professionalLabel=document.createElement('label');professionalLabel.className='field';
  const professionalCaption=document.createElement('span');professionalCaption.textContent='Profissional';
  const professionalInput=document.createElement('input');professionalInput.readOnly=true;professionalInput.setAttribute('aria-label','Profissional responsável');professionalLabel.append(professionalCaption,professionalInput);q('scheduleDate').parentNode?.parentNode.append(professionalLabel);
  const gridSelection=()=>catalog.find(p=>String(p.id)===gridProcedure.value);
  function refreshGridProcedures() {
    const previous=gridProcedure.value;
    gridProcedure.replaceChildren(option('','Selecione o procedimento'));
    const available=catalog.filter(p=>!q('schedulePlaceFilter').value||String(p.place_id)===q('schedulePlaceFilter').value);
    available.forEach(p=>{
      const place=Object.entries(places).find(([key,l])=>String(l.id||key)===String(p.place_id))?.[1];
      gridProcedure.append(option(String(p.id),`${p.name} · ${p.duration} min · ${place?.name||'Local removido'}`));
    });
    gridProcedure.value=available.some(p=>String(p.id)===previous)?previous:String(available[0]?.id||'');
  }
  gridProcedure.onchange=render;
  const selectedProcedure=()=>catalog.find(p=>String(p.id)===inputs.procedure.selectedOptions[0]?.dataset.id);
  function updateEnd() {
    const p=selectedProcedure();if(!p||!inputs.start.value)return;
    const [hour,minute]=inputs.start.value.split(':').map(Number),end=hour*60+minute+Number(p.duration);
    inputs.end.value=end<1440?String(Math.floor(end/60)).padStart(2,'0')+':'+String(end%60).padStart(2,'0'):'';
  }
  inputs.procedure.onchange=()=>{const p=selectedProcedure();if(p){inputs.price.value=Number(p.price).toFixed(2);inputs.place_id.value=String(p.place_id);updateEnd();}};
  inputs.start.onchange=updateEnd;
  ['Não informado','Feminino','Masculino','Intersexo'].forEach(value=>inputs.sex.append(option(value)));
  const patientOptions=document.createElement('datalist');patientOptions.id='schedulePatientOptions';
  q('schedulePatientField').append(patientOptions);
  inputs.name.setAttribute('list','schedulePatientOptions');inputs.name.autocomplete='off';
  inputs.name.placeholder='Buscar por nome ou CPF, ou digitar o nome de um novo paciente';
  let selectedPatientCpf='';
  const patientLabel=patient=>`${patient.name} · ${patient.cpf}`;
  inputs.name.oninput=()=>{
    const patient=patients.find(p=>patientLabel(p)===inputs.name.value);
    if(patient){
      for(const name of ['name','cpf','birth_date','phone'])inputs[name].value=name==='cpf'?formatDoctorCpf(patient[name]):name==='phone'?formatPhone(patient[name]):patient[name]||'';
      selectedPatientCpf=patient.cpf;
    } else if(selectedPatientCpf){
      for(const name of ['cpf','birth_date','phone'])inputs[name].value='';
      selectedPatientCpf='';
    }
  };
  const statusBadge=status=>{const badge=document.createElement('span');badge.className='schedule-status-badge';badge.dataset.scheduleStatus=status;badge.textContent=status;return badge;};
  screen.querySelector('.agenda-legend').replaceChildren(...statuses.map(statusBadge));
  for(const select of [inputs.status,q('scheduleStatus')]) {
    statuses.forEach(status=>{const entry=option(status);entry.dataset.scheduleStatus=status;select.append(entry);});
    select.onchange=()=>select.dataset.scheduleStatus=select.value;
  }
  ['Presencial','On-line'].forEach(s=>inputs.visit_mode.append(option(s)));
  const visitMode=item=>item.visit_mode||(item.attendance_type==='Teleconsulta'?'On-line':'Presencial');
  const request = async (action,data={}) => {
    const response=await fetch('api/index.php?action='+encodeURIComponent(action),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const result=await response.json(); if(!response.ok||!result.ok) throw new Error(result.error||'Não foi possível carregar a agenda.'); return result;
  };
  let onlyWaiting=false;
  const visible = () => items.filter(i=>(!q('schedulePlaceFilter').value||String(i.place_id)===q('schedulePlaceFilter').value)&&(mode==='agenda'||!['Finalizado','Cancelado','Faltou'].includes(i.status)||q('scheduleFinished').checked)&&(!q('agendaOnlyValid').checked||!['Cancelado','Faltou'].includes(i.status))&&(!onlyWaiting||i.status==='Aguardando')&&(i.name+' '+i.cpf).toLocaleLowerCase('pt-BR').includes(q('scheduleSearch').value.trim().toLocaleLowerCase('pt-BR')));
  const button = (label, action) => { const el=document.createElement('button');el.type='button';el.className='btn outline';el.textContent=label;el.onclick=action;return el; };
  const actualStart = item => item.actual_started_at ? new Date(item.actual_started_at).toLocaleTimeString('pt-BR',{timeZone:'America/Fortaleza',hour:'2-digit',minute:'2-digit',second:'2-digit'}) : 'Não registrado';
  const actualDuration = item => {
    if(item.actual_duration_seconds==null)return 'Não registrado';
    const seconds=Math.max(0,Math.floor(Number(item.actual_duration_seconds)||0));
    const text=[Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
    return !item.actual_ended_at&&item.status==='Em atendimento'?text+' (em andamento)':text;
  };
  function eventCard(item) {
    const card=button(`${item.start}–${item.end} · ${item.name} · ${item.procedure} · ${Number(item.price||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} · ${visitMode(item)} · ${item.status}`,()=>showDetails(item));
    card.classList.add('schedule-event');card.dataset.status=item.status;return card;
  }
  function renderCalendar() {
    const selected=q('scheduleDate').value,cursor=monthCursor||selected;
    q('agendaMonthHeading').textContent=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(model.date(cursor));
    const days=q('agendaCalendarDays');days.replaceChildren();
    ['D','S','T','Q','Q','S','S'].forEach(day=>{const label=document.createElement('span');label.textContent=day;days.append(label);});
    model.range(cursor,'month').forEach(date=>{
      const day=button(String(Number(date.slice(-2))),()=>{q('scheduleDate').value=date;monthCursor=date;return load();});
      day.className='agenda-calendar-day';day.setAttribute('aria-label',date.split('-').reverse().join('/'));
      day.setAttribute('aria-current',date===selected?'date':'false');
      if(date.slice(0,7)!==cursor.slice(0,7))day.classList.add('agenda-outside');
      days.append(day);
    });
  }
  function render() {
    const body=q('scheduleBody');body.replaceChildren();
    shell.className=mode==='agenda'?'agenda-workspace':'agenda-workspace agenda-consultations';
    q('scheduleHeading').textContent=mode==='agenda'?'Agendamentos':'Consultas';
    q('scheduleAgenda').setAttribute('aria-current',mode==='agenda'?'page':'false'); q('scheduleConsultations').setAttribute('aria-current',mode==='consultas'?'page':'false');
    q('scheduleProfessional').textContent='Profissional: '+(doctor.name||document.querySelector('#userEmail').textContent);
    if(isSecretary())q('scheduleProfessional').textContent='Secretaria · Agenda do profissional responsável';
    professionalInput.value=isSecretary()?'Profissional responsável':doctor.name||'Profissional';
    q('scheduleBack').textContent=isSecretary()?'Sair':'← Início';
    q('scheduleFinishedFilter').hidden=mode==='agenda';
    aside.hidden=mode!=='agenda';controls.hidden=mode!=='agenda';gridLabel.hidden=mode!=='agenda';
    controls.querySelectorAll?.('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===view)));
    q('agendaDateHeading').textContent=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(model.date(q('scheduleDate').value));
    q('agendaConfigure').hidden=q('agendaProcedures').hidden=isSecretary();
    q('agendaCount').textContent=items.length+' agendamento(s)';q('agendaWaitingCount').textContent=items.filter(i=>i.status==='Aguardando').length;
    renderCalendar();
    const rows=visible(); q('scheduleFeedback').textContent=`${rows.length} atendimento(s) em ${q('scheduleDate').value.split('-').reverse().join('/')}.`+(local?' Prévia local: dados temporários, apagados ao recarregar.':'');
    if(mode==='agenda'&&view==='month') {
      const month=document.createElement('div');month.className='agenda-month-grid';
      ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].forEach(day=>{const heading=document.createElement('b');heading.textContent=day;month.append(heading);});
      model.range(q('scheduleDate').value,'month').forEach(date=>{
        const cell=document.createElement('div');cell.className='agenda-month-day'+(date.slice(0,7)!==q('scheduleDate').value.slice(0,7)?' agenda-outside':'');
        cell.append(button(String(Number(date.slice(-2))),()=>{q('scheduleDate').value=date;view='day';return load();}));
        rows.filter(i=>i.date===date).forEach(item=>cell.append(eventCard(item)));month.append(cell);
      });body.append(month);
    } else if(mode==='agenda'&&view==='list') {
      const list=document.createElement('div');list.className='agenda-commitments';
      rows.forEach(item=>list.append(eventCard(item)));
      if(!rows.length)list.textContent='Nenhum compromisso para esta data.';body.append(list);
    } else if(mode==='agenda') {
      const grid=document.createElement('div');grid.className='schedule-grid';
      grid.style?.setProperty('--agenda-row-height',settings.row_height+'px');
      const duration=model.interval(settings,gridSelection());
      const times=new Set(model.slots(settings,gridSelection()));
      q('scheduleFeedback').textContent+=` Horários a cada ${duration} minutos.`;
      rows.forEach(i=>times.add(i.start));
      const dates=model.range(q('scheduleDate').value,view);
      if(view==='week'){
        grid.classList.add('agenda-week-grid');grid.style?.setProperty('--agenda-days',dates.length);
        const head=document.createElement('div');head.className='agenda-week-heading';head.append(document.createElement('span'));
        dates.forEach(date=>{const label=document.createElement('b');label.textContent=new Intl.DateTimeFormat('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'}).format(model.date(date));head.append(label);});grid.append(head);
      }
      [...times].sort().forEach(time=>{
        const row=document.createElement('div');row.className='schedule-slot';
        const timeButton=button(time,()=>edit(null,time));
        timeButton.disabled=!model.available(settings,time,model.time(Math.min(1439,model.minutes(time)+Number(gridSelection()?.duration||settings.default_duration))));row.append(timeButton);
        dates.forEach(date=>{
          const content=document.createElement('div');content.className='schedule-slot-content';
          const end=model.time(Math.min(1439,model.minutes(time)+Number(gridSelection()?.duration||settings.default_duration)));
          const available=model.available(settings,time,end);
          if(!available)content.classList.add('agenda-unavailable');
          const create=()=>{if(available)return edit(null,time,date);};
          content.onclick=event=>{if(event.target===content)create();};
          content.setAttribute('role','button');content.setAttribute('tabindex',available?'0':'-1');content.setAttribute('aria-label',(available?'Agendar ':'Indisponível ')+date+' às '+time);
          content.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();create();}};
          rows.filter(i=>i.start===time&&i.date===date).forEach(i=>content.append(eventCard(i)));
          if(!available&&!content.children.length){const label=document.createElement('small');label.textContent=settings.lunch_enabled&&time>=settings.lunch_start&&time<settings.lunch_end?'Almoço':'Indisponível';content.append(label);}
          row.append(content);
        });grid.append(row);
      }); body.append(grid);
    } else {
      const wrap=document.createElement('div');wrap.className='schedule-table-wrap';const table=document.createElement('table');table.className='schedule-table';
      const thead=document.createElement('thead'),head=document.createElement('tr');thead.append(head);table.append(thead);['Ações','Paciente','Horário agendado','Início real','Tempo da consulta','Procedimento','Local','Status','Modalidade'].forEach(t=>{const th=document.createElement('th');th.textContent=t;head.append(th);});
      const tbody=document.createElement('tbody');table.append(tbody);rows.forEach(i=>{const row=document.createElement('tr'),actions=document.createElement('td');tbody.append(row);row.append(actions);if(isSecretary())actions.append(button('Editar agendamento',()=>edit(i)));else{const back=button('Voltar para a consulta',()=>attend(i,true));back.disabled=i.date!==today()||!['Em atendimento','Finalizado'].includes(i.status);back.title=i.date!==today()?'Dispon\u00edvel somente no mesmo dia da consulta':'Reabrir os dados salvos para edi\u00e7\u00e3o';actions.append(back);}if(!isSecretary()&&!['Cancelado','Faltou','Finalizado'].includes(i.status))actions.append(button('Atender',()=>attend(i)));[i.name,`${i.start}–${i.end}`,actualStart(i),actualDuration(i),i.procedure,i.place_name,i.status,visitMode(i)].forEach((t,index)=>{const cell=document.createElement('td');if(index===6)cell.append(statusBadge(t));else cell.textContent=t;row.append(cell);});});
      if(!rows.length){const row=document.createElement('tr'),cell=document.createElement('td');row.append(cell);tbody.append(row);cell.colSpan=9;cell.textContent='Nenhuma consulta encontrada para os filtros selecionados.';} wrap.append(table);body.append(wrap);
    }
  }
  async function load() {
    const current=++sequence; q('scheduleBody').replaceChildren();q('scheduleFeedback').textContent='Carregando agenda…';
    const dates=model.range(q('scheduleDate').value,mode==='agenda'?view:'day');
    try { const [loaded,procedures,configuration]=await Promise.all([local?memory.filter(i=>i.date>=dates[0]&&i.date<=dates[dates.length-1]):request('schedule.list',{date:dates[0],end_date:dates[dates.length-1]}).then(result=>result.items),window.procedureCatalog.load(),window.agendaSettings?.load()||settings]); if(current!==sequence)return;items=loaded;catalog=procedures;settings=configuration;refreshGridProcedures();render(); }
    catch(e){if(current===sequence){items=[];q('scheduleFeedback').textContent=e.message;}}
  }
  function refreshPlaces() {
    const previous=q('schedulePlaceFilter').value;q('schedulePlaceFilter').replaceChildren(option('','Todos os locais'));inputs.place_id.replaceChildren(option('','Selecione…'));
    Object.entries(places).forEach(([key,p])=>{const id=String(p.id||key);inputs.place_id.append(option(id,p.name));q('schedulePlaceFilter').append(option(id,p.name));});q('schedulePlaceFilter').value=previous;
  }
  let editingId=null,editingAttendanceType='Consulta';
  let detailsItem=null,statusSaving=false;
  function showDetails(item) {
    detailsItem=item;q('scheduleDetailsPatient').textContent=item.name;
    q('scheduleDetailsSummary').textContent=`${item.date.split('-').reverse().join('/')} · ${item.start}–${item.end} · ${item.procedure} · ${visitMode(item)} · ${item.place_name||'Local não informado'}`;
    q('scheduleStatus').value=item.status;q('scheduleStatus').onchange();q('scheduleStatusError').textContent='';
    detailsDialog.showModal();
  }
  function closeDetails() {if(!statusSaving){detailsDialog.close();detailsItem=null;}}
  q('scheduleDetailsClose').onclick=closeDetails;
  detailsDialog.addEventListener('cancel',event=>{if(statusSaving)event.preventDefault();});
  q('scheduleDetailsEdit').onclick=()=>{const item=detailsItem;if(!item||statusSaving)return;closeDetails();return edit(item);};
  q('scheduleStatusForm').onsubmit=async event=>{
    event.preventDefault();if(!detailsItem||statusSaving)return;
    const item=detailsItem,status=q('scheduleStatus').value;
    if(status===item.status){closeDetails();return;}
    if(!statuses.includes(status)){q('scheduleStatusError').textContent='Selecione um status válido.';return;}
    statusSaving=true;q('scheduleStatusError').textContent='';
    const controls=['scheduleStatus','scheduleStatusSave','scheduleDetailsEdit','scheduleDetailsClose'];
    controls.forEach(id=>q(id).disabled=true);
    try {
      await save({...item,status});detailsDialog.close();detailsItem=null;
      await load();document.dispatchEvent(new Event('schedule:saved'));toast('Status do agendamento atualizado.');
    } catch(e){q('scheduleStatusError').textContent=e.message;}
    finally{statusSaving=false;controls.forEach(id=>q(id).disabled=false);}
  };
  async function edit(item=null,time=settings.opening,date=q('scheduleDate').value) {
    q('scheduleForm').reset();q('scheduleFormError').textContent='';editingId=item?.id||null;editingAttendanceType=item?.attendance_type||'Consulta';
    selectedPatientCpf=item?.cpf||'';patientOptions.replaceChildren();
    refreshPlaces();q('scheduleFormHeading').textContent=item?'Editar agendamento':'Novo agendamento';
    const minutes=model.minutes(time)+Number(settings.default_duration);
    const defaults={date,start:time,end:minutes<1440?model.time(minutes):'',procedure:'Consulta',visit_mode:item?visitMode(item):'Presencial',status:'Agendado'};
    fields.forEach(([name])=>inputs[name].value=String(item?.[name]??defaults[name]??''));
    inputs.status.onchange();
    inputs.cpf.value=formatDoctorCpf(inputs.cpf.value);inputs.phone.value=formatPhone(inputs.phone.value);
    inputs.price.value=item?.price??'0.00';
    inputs.procedure.replaceChildren(option('','Selecione o procedimento'));
    q('scheduleSave').disabled=true;
    q('scheduleDialog').showModal();
    try {
      catalog=await window.procedureCatalog.load();
      catalog.forEach(p=>{const place=Object.entries(places).find(([key,l])=>String(l.id||key)===String(p.place_id))?.[1];const el=option(p.name,p.name+' · '+Number(p.price).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})+' · '+p.duration+' min · '+(place?.name||'Local removido'));el.dataset.id=p.id;inputs.procedure.append(el);});
      if(item){const match=[...inputs.procedure.options].find(o=>o.value===item.procedure&&String(catalog.find(p=>String(p.id)===o.dataset.id)?.place_id)===String(item.place_id));if(match)match.selected=true;else{const old=option(item.procedure,item.procedure+' (agendamento existente)');inputs.procedure.append(old);old.selected=true;}}
      else {const p=gridSelection()||catalog.find(p=>!q('schedulePlaceFilter').value||String(p.place_id)===q('schedulePlaceFilter').value);if(p){[...inputs.procedure.options].find(o=>o.dataset.id===String(p.id)).selected=true;inputs.procedure.onchange();}else q('scheduleFormError').textContent='Cadastre os procedimentos em Meu perfil → Configurações de agendamentos.';}
      q('scheduleSave').disabled=false;
    } catch(e){q('scheduleFormError').textContent=e.message;return;}
    try { patients=local?[]:(await request('patients.list')).items;patients.forEach(p=>patientOptions.append(option(patientLabel(p)))); }
    catch(e){q('scheduleFormError').textContent='Busca de pacientes indisponível: '+e.message;}
  }
  async function save(value) {
    if(!local)return request('schedule.save',value);
    const previous=memory.find(i=>i.id===value.id);
    if(!['Cancelado','Faltou'].includes(value.status)&&(!previous||previous.start!==value.start||previous.end!==value.end||previous.date!==value.date)&&!model.available(settings,value.start,value.end))throw Error('Escolha um horário dentro do funcionamento e fora do almoço.');
    if(!['Cancelado','Faltou'].includes(value.status)&&memory.some(i=>i.id!==value.id&&i.date===value.date&&!['Cancelado','Faltou'].includes(i.status)&&i.start<value.end&&i.end>value.start))throw new Error('Já existe um atendimento nesse horário.');
    const place=Object.entries(places).find(([key,p])=>String(p.id||key)===String(value.place_id))?.[1];
    const item={...value,id:value.id||Date.now(),place_name:place?.name||''};memory=memory.filter(i=>i.id!==item.id);memory.push(item);return {ok:true,id:item.id};
  }
  q('scheduleForm').onsubmit=async event=>{
    event.preventDefault(); const value=Object.fromEntries(fields.map(([name])=>[name,inputs[name].value.trim()]));value.id=editingId;value.attendance_type=editingAttendanceType;value.cpf=digits(value.cpf);value.phone=digits(value.phone);
    if(value.start>=value.end||patientAge(value.birth_date)===null||value.name.split(/\s+/).length<2){q('scheduleFormError').textContent='Confira nome completo, nascimento e horário final posterior ao inicial.';return;}
    q('scheduleSave').disabled=true;
    try {await save(value);q('scheduleDialog').close();await load();document.dispatchEvent(new Event('schedule:saved'));toast('Agendamento salvo.');}
    catch(e){q('scheduleFormError').textContent=e.message;}finally{q('scheduleSave').disabled=false;}
  };
  async function attend(item,returning=false) {
    if(returning&&item.date!==today()){toast('Só é possível voltar para editar a consulta no mesmo dia do atendimento.');return;}
    const key=Object.keys(places).find(k=>String(places[k].id||k)===String(item.place_id));
    if(!key){toast('Local indisponível. Atualize a agenda.');return;}
    if(window.consultationTimer?.snapshot()){toast('Salve e encerre o atendimento atual antes de abrir outra consulta.');return;}
    if((document.querySelector('#rxText').value.trim()||document.querySelector('#clinicalHistory').value.trim())&&!confirm('Abrir esta consulta e limpar os textos do atendimento anterior?'))return;
    try {
      const restored=returning?(local?drafts.get(item.id)||{}:await request('schedule.return',{id:item.id})):null;
      let startedAt=item.actual_started_at;
      if(!returning){
        await save({...item,status:'Em atendimento'});
        startedAt=local?(startedAt||new Date().toISOString()):(await request('schedule.start',{id:item.id})).started_at;
        if(local)memory=memory.map(i=>i.id===item.id?{...i,actual_started_at:startedAt,actual_duration_seconds:0}:i);
      }
      clearPatient();document.querySelector('#rxText').value='';
      for(const [id,name] of [['patientName','name'],['patientDoc','cpf'],['patientBirthDate','birth_date']]){const input=document.querySelector('#'+id);input.value=item[name];input.dispatchEvent(new Event('input',{bubbles:true}));}
      document.querySelector('#rxDate').value=item.date;updatePaperPatient();openRx(key);
      if(restored){
        const doc=restored.document;
        if(doc){
          const type=/^[a-z_]+$/.test(doc.document_type)?doc.document_type:'simples';
          document.querySelector('.type-card[data-type="'+type+'"]')?.click?.();
          document.querySelector('#paperTitle').textContent=doc.document_title;
          if(type==='personalizado')document.querySelector('#documentTitle').value=doc.document_title;
          document.querySelector('#rxText').value=doc.document_text;
        }
        document.querySelector('#clinicalHistory').value=restored.clinical_history||'';
      }
      activeVisit={...item,actual_started_at:startedAt,status:returning?item.status:'Em atendimento',returning};
      if(!returning||item.status==='Em atendimento')window.consultationTimer?.start?.(startedAt);
    }catch(e){toast(e.message);}
  }
  window.validateScheduledVisitEdit=async()=>{
    if(!activeVisit?.returning)return;
    if(activeVisit.date!==today())throw Error('O prazo para editar esta consulta terminou. A edição é permitida somente no mesmo dia.');
    if(!local)await request('schedule.return',{id:activeVisit.id});
  };
  window.finishScheduledVisit=async()=>{
    if(!activeVisit)return;
    const cpf=digits(document.querySelector('#patientDoc').value);
    if(cpf!==digits(activeVisit.cpf)||String(selectedPlace.id)!==String(activeVisit.place_id))throw Error('Confira o paciente e o local do agendamento antes de finalizar.');
    if(local){
      drafts.set(activeVisit.id,{document:{document_type:document.querySelector('.type-card.active')?.dataset.type||'simples',document_title:document.querySelector('#paperTitle').textContent,document_text:document.querySelector('#rxText').value},clinical_history:document.querySelector('#clinicalHistory').value});
      memory=memory.map(i=>i.id===activeVisit.id?{...i,status:'Finalizado',actual_ended_at:i.actual_ended_at||new Date().toISOString(),actual_duration_seconds:i.actual_ended_at?i.actual_duration_seconds:i.actual_started_at?Math.max(0,Math.floor((Date.now()-Date.parse(i.actual_started_at))/1000)):null}:i);
    }
    else await request('schedule.finish',{id:activeVisit.id,cpf,place_id:activeVisit.place_id});
    activeVisit=null;q('scheduleFinished').checked=false;await load();
  };
  const originalClearPatient=clearPatient;
  clearPatient=()=>{originalClearPatient();activeVisit=null;};
  ['patientName','patientDoc','patientBirthDate'].forEach(id=>document.querySelector('#'+id).addEventListener('input',()=>{activeVisit=null;}));
  document.addEventListener('patients:load',()=>{activeVisit=null;catalog=[];drafts.clear();});
  ['logoutButton','logoutRx'].forEach(id=>document.querySelector('#'+id).addEventListener('click',()=>{activeVisit=null;catalog=[];drafts.clear();}));
  function open(target) {mode=target;if(target==='consultas'){onlyWaiting=false;monthCursor=null;q('scheduleDate').value=today();q('scheduleSearch').value='';q('schedulePlaceFilter').value='';}refreshPlaces();show('#schedulingScreen');return load();}
  window.openConsultations=()=>open('consultas');
  controls.querySelectorAll?.('[data-view]').forEach(button=>button.onclick=()=>{view=button.dataset.view;return load();});
  q('agendaOnlyValid').onchange=render;
  q('agendaSearchFocus').onclick=()=>q('scheduleSearch').focus();
  q('agendaWaiting').onclick=()=>{onlyWaiting=!onlyWaiting;render();};
  q('agendaConfigure').onclick=()=>window.agendaSettings.open();
  q('agendaProcedures').onclick=()=>window.procedureSettings.open();
  q('agendaPrint').onclick=()=>window.print();
  q('agendaCollapse').onclick=()=>{const collapsed=aside.classList.toggle('agenda-sidebar-collapsed');q('agendaCollapse').textContent=collapsed?'‹ Expandir painel':'› Recolher painel';};
  for(const [id,step]of [['agendaMonthPrevious',-1],['agendaMonthNext',1]])q(id).onclick=()=>{const date=model.date(monthCursor||q('scheduleDate').value);date.setDate(1);date.setMonth(date.getMonth()+step);monthCursor=model.iso(date);renderCalendar();};
  q('agendaExport').onclick=()=>{
    const escape=value=>'"'+String(value??'').replace(/"/g,'""').replace(/^[=+@-]/,"'")+'"';
    const rows=[['Data','Início','Fim','Paciente','Procedimento','Local','Status','Modalidade','Valor'],...visible().map(i=>[i.date,i.start,i.end,i.name,i.procedure,i.place_name,i.status,visitMode(i),i.price])];
    const blob=new Blob(['\uFEFF'+rows.map(row=>row.map(escape).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='agenda-'+q('scheduleDate').value+'.csv';link.click();URL.revokeObjectURL(url);
  };
  document.addEventListener('agenda-settings:saved',()=>{monthCursor=null;load();});
  document.addEventListener('procedures:saved',()=>load());
  for(const host of [document.querySelector('#placesScreen .home-tabs'),document.querySelector('#patientsScreen .top'),document.querySelector('.rx-nav')]) {
    if(!host)continue;host.append(button('Agendamentos',()=>open('agenda')),button('Consultas',()=>open('consultas')));
  }
  q('scheduleDate').value=today();q('scheduleDate').onchange=()=>{monthCursor=null;return load();};
  q('scheduleBack').onclick=()=>{if(isSecretary())document.querySelector('#logoutButton').click();else show('#placesScreen');};q('scheduleNew').onclick=()=>edit();
  q('scheduleClose').onclick=q('scheduleCancel').onclick=()=>q('scheduleDialog').close();
  q('scheduleAgenda').onclick=()=>open('agenda');q('scheduleConsultations').onclick=()=>open('consultas');
  q('scheduleToday').onclick=()=>{q('scheduleDate').value=today();monthCursor=null;return load();};
  for(const [id,delta] of [['schedulePrevious',-1],['scheduleNext',1]])q(id).onclick=()=>{const date=model.date(q('scheduleDate').value);if(mode==='agenda'&&view==='month'){date.setDate(1);date.setMonth(date.getMonth()+delta);}else date.setDate(date.getDate()+delta*(mode==='agenda'&&view==='week'?7:1));q('scheduleDate').value=model.iso(date);monthCursor=null;return load();};
  q('schedulePlaceFilter').onchange=()=>{refreshGridProcedures();render();};q('scheduleFinished').onchange=render;q('scheduleSearch').oninput=render;
  document.addEventListener('patients:load',()=>{sequence++;items=[];memory=[];patients=[];q('scheduleBody').replaceChildren();q('scheduleForm').reset();if(q('scheduleDialog').open)q('scheduleDialog').close();});
  ['logoutButton','logoutRx'].forEach(id=>document.querySelector('#'+id).addEventListener('click',()=>{sequence++;items=[];memory=[];patients=[];detailsItem=null;detailsDialog.close();q('scheduleBody').replaceChildren();q('scheduleForm').reset();if(q('scheduleDialog').open)q('scheduleDialog').close();}));
})();
