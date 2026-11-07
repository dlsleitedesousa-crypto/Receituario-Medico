import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function setup(production=false, secretary=false) {
  const nodes=new Map(), listeners={}, requests=[], created=[];
  class Node {
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.value='';this.children=[];this.dataset={};this.textContent='';this.classList={add(){}};}
    append(...nodes){this.children.push(...nodes);if(this.tagName==='SELECT'&&this.children.length===nodes.length)this.value=nodes[0]?.value||'';}
    replaceChildren(...nodes){this.children=[];this.append(...nodes);}
    get options(){return this.children;}
    get selectedOptions(){const selected=this.children.filter(n=>n.selected);return selected.length?selected:this.children.filter(n=>n.value===this.value);}
    querySelector(id){if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);}
    before(){} setAttribute(){} addEventListener(event,fn){this[event]=fn;}
    dispatchEvent(event){this[event.type]?.(event);}
    showModal(){this.open=true;} close(){this.open=false;} reset(){}
    createTHead(){return this;}createTBody(){return this;}
    insertRow(){const n=new Node();this.append(n);return n;}
    insertCell(){const n=new Node();this.append(n);return n;}
  }
  const document={body:new Node(),createElement:tag=>{const node=new Node(tag);created.push(node);return node;},querySelector:id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);},addEventListener:(e,fn)=>listeners[e]=fn,dispatchEvent(){}};
  let shown;
  const context=vm.createContext({document,formatDoctorCpf:value=>String(value).replace(/\D/g,'').slice(0,11).replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2'),location:{hostname:production?'example.test':'localhost'},Intl,Date,Event,window:{procedureCatalog:{load:async()=>[]},currentSessionUser:{secretary_owner_id:secretary?1:null}},doctor:{name:'Profissional de teste'},places:{one:{id:1,name:'Local de teste'}},show(id){shown=id;},toast(){},patientAge:()=>20,confirm:()=>true,clearPatient(){},updatePaperPatient(){},openRx(){},fetch:async(url,options)=>{requests.push({url,credentials:options.credentials,data:JSON.parse(options.body)});return {ok:true,json:async()=>({ok:true,items:[]})};}});
  vm.runInContext(readFileSync(new URL('../agenda-model.js',import.meta.url),'utf8'),context);
  vm.runInContext(readFileSync(new URL('../scheduling.js',import.meta.url),'utf8'),context);
  context.selectedPlace={id:1};
  const screen=document.body.children[0];
  const inputs=Object.fromEntries(created.filter(input=>input.name).map(input=>[input.name,input]));
  return {nodes,inputs,requests,screen,listeners,context,created,shown:()=>shown};
}
const data={name:'Paciente Fictício',cpf:'12345678901',birth_date:'2000-01-01',date:'2026-11-01',phone:'',start:'09:00',end:'09:20',procedure:'Consulta',attendance_type:'Consulta',visit_mode:'Presencial',place_id:'1',status:'Agendado',notes:'<script>texto de teste</script>'};
const fill=(s,values={})=>Object.entries({...data,...values}).filter(([key])=>key!=='attendance_type').forEach(([key,value])=>s.inputs[key].value=value);

const detailsDialog=s=>s.created.find(node=>node.id==='scheduleDetailsDialog');
const eventCard=s=>s.created.find(node=>node.dataset.status);

test('campo único seleciona paciente pelo nome e CPF e limpa dados ao trocar de pessoa',async()=>{
  const s=setup(true),patients=[{...data,id:1},{...data,id:2,cpf:'00000000002',birth_date:'1990-02-03',phone:'00900000002'}];
  s.context.fetch=async()=>({ok:true,json:async()=>({ok:true,items:patients})});
  await s.nodes.get('#scheduleNew').onclick();
  const suggestions=s.created.find(node=>node.id==='schedulePatientOptions');
  assert.equal(suggestions.children.length,2);
  s.inputs.name.value=suggestions.children[1].value;s.inputs.name.oninput();
  assert.equal(s.inputs.name.value,data.name);assert.equal(s.inputs.cpf.value,'000.000.000-02');assert.equal(s.inputs.birth_date.value,'1990-02-03');
  assert.equal(s.nodes.get('#scheduleFields').children.some(label=>label.children[1]?.name==='name'),false);
  s.inputs.name.value='Outra Pessoa';s.inputs.name.oninput();
  assert.equal(s.inputs.cpf.value,'');assert.equal(s.inputs.birth_date.value,'');assert.equal(s.inputs.phone.value,'');
});

test('modalidade on-line é salva, aparece no resumo e permanece ao editar',async()=>{
  const s=setup();s.nodes.get('#scheduleDate').value=data.date;
  assert.equal(s.inputs.insurance,undefined);
  assert.equal(s.inputs.attendance_type,undefined);
  assert.deepEqual(s.inputs.visit_mode.options.map(option=>option.value),['Presencial','On-line']);
  fill(s,{visit_mode:'On-line'});
  await s.nodes.get('#scheduleForm').onsubmit({preventDefault(){}});
  assert.match(eventCard(s).textContent,/On-line/);eventCard(s).onclick();
  assert.match(s.nodes.get('#scheduleDetailsSummary').textContent,/On-line/);
  await s.nodes.get('#scheduleDetailsEdit').onclick();assert.equal(s.inputs.visit_mode.value,'On-line');
});

test('agendamentos antigos continuam editáveis e teleconsulta usa modalidade on-line',async()=>{
  for(const attendance_type of ['Consulta','Teleconsulta']) {
    const s=setup(true),item={...data,id:20,attendance_type};delete item.visit_mode;
    s.nodes.get('#scheduleDate').value=data.date;
    s.context.fetch=async()=>({ok:true,json:async()=>({ok:true,items:[item]})});
    await s.nodes.get('.rx-nav').children[0].onclick();eventCard(s).onclick();
    await s.nodes.get('#scheduleDetailsEdit').onclick();
    assert.equal(s.inputs.visit_mode.value,attendance_type==='Teleconsulta'?'On-line':'Presencial');
  }
});

test('clique no agendamento permite salvar cada status para profissional e secretaria',async()=>{
  for(const secretary of [false,true]) {
    const s=setup(true,secretary),saved=[];let item={...data,id:12,place_name:'Local de teste'};
    s.context.fetch=async(url,options)=>{
      const action=new URL(url,'https://example.test').searchParams.get('action');
      if(action==='schedule.save'){item=JSON.parse(options.body);saved.push(item);assert.equal(options.credentials,'same-origin');}
      return {ok:true,json:async()=>({ok:true,items:[item]})};
    };
    s.nodes.get('#scheduleDate').value=data.date;
    await s.nodes.get('.rx-nav').children[0].onclick();
    const selector=s.nodes.get('#scheduleStatus');
    for(const status of ['Confirmado','Aguardando','Em atendimento','Finalizado','Cancelado','Faltou','Agendado']) {
      s.created.filter(node=>node.dataset.status).at(-1).onclick();
      assert.equal(detailsDialog(s).open,true);assert.equal(selector.value,item.status);
      assert.equal(s.nodes.get('#scheduleDetailsPatient').textContent,data.name);
      selector.value=status;await s.nodes.get('#scheduleStatusForm').onsubmit({preventDefault(){}});
      assert.equal(detailsDialog(s).open,false);assert.equal(item.status,status);
      assert.equal(item.id,12);assert.equal(item.date,data.date);assert.equal(item.notes,data.notes);
      assert.equal(s.created.filter(node=>node.dataset.status).at(-1).dataset.status,status);
    }
    assert.equal(saved.length,7);
  }
});

test('falha ao alterar status mantém janela e permite tentar novamente sem duplicar envio',async()=>{
  const s=setup(true);let fail=true,release,saves=0;
  s.context.fetch=async(url)=>{
    if(url.includes('schedule.save')){saves++;await new Promise(resolve=>release=resolve);return {ok:!fail,json:async()=>fail?{ok:false,error:'Sem conexão'}:{ok:true}};}
    return {ok:true,json:async()=>({ok:true,items:[{...data,id:12}]})};
  };
  s.nodes.get('#scheduleDate').value=data.date;
  await s.nodes.get('.rx-nav').children[0].onclick();eventCard(s).onclick();
  s.nodes.get('#scheduleStatus').value='Confirmado';
  const submit=()=>s.nodes.get('#scheduleStatusForm').onsubmit({preventDefault(){}});
  const pending=submit();await submit();s.nodes.get('#scheduleDetailsClose').onclick();
  assert.equal(saves,1);assert.equal(detailsDialog(s).open,true);assert.equal(s.nodes.get('#scheduleStatusSave').disabled,true);
  release();await pending;
  assert.equal(detailsDialog(s).open,true);assert.equal(s.nodes.get('#scheduleStatusError').textContent,'Sem conexão');
  assert.equal(s.nodes.get('#scheduleStatus').value,'Confirmado');assert.equal(s.nodes.get('#scheduleStatusSave').disabled,false);
  fail=false;const retry=submit();release();await retry;assert.equal(detailsDialog(s).open,false);
});

test('resumo permite editar cadastro e fecha sem gravar quando o status não muda',async()=>{
  const s=setup(true);s.context.fetch=async(url)=>{assert.equal(url.includes('schedule.save'),false);return {ok:true,json:async()=>({ok:true,items:[{...data,id:12}]})};};
  s.nodes.get('#scheduleDate').value=data.date;
  await s.nodes.get('.rx-nav').children[0].onclick();eventCard(s).onclick();
  await s.nodes.get('#scheduleStatusForm').onsubmit({preventDefault(){}});assert.equal(detailsDialog(s).open,false);
  eventCard(s).onclick();await s.nodes.get('#scheduleDetailsEdit').onclick();
  assert.equal(detailsDialog(s).open,false);assert.equal(s.nodes.get('#scheduleDialog').open,true);
  assert.equal(s.inputs.name.value,data.name);assert.equal(s.inputs.status.value,data.status);
});

test('Consultas separa horário agendado, início real e tempo realizado',async()=>{
  const s=setup(true);
  s.context.fetch=async()=>({ok:true,json:async()=>({ok:true,items:[
    {...data,id:1,actual_started_at:'2026-11-05T12:07:00Z',actual_ended_at:'2026-11-05T12:32:10Z',actual_duration_seconds:1510,status:'Finalizado'},
    {...data,id:2,actual_started_at:null,actual_duration_seconds:null}
  ]})});
  s.nodes.get('#scheduleFinished').checked=true;await s.nodes.get('.rx-nav').children[1].onclick();
  const rows=s.nodes.get('#scheduleBody').children[0].children[0].children[1].children;
  assert.equal(rows[0].children[2].textContent,'09:00–09:20');assert.equal(rows[0].children[3].textContent,'09:07:00');assert.equal(rows[0].children[4].textContent,'00:25:10');
  assert.equal(rows[1].children[3].textContent,'Não registrado');assert.equal(rows[1].children[4].textContent,'Não registrado');
});

test('Atender registra início no servidor e inicia cronômetro com o mesmo instante',async()=>{
  const s=setup(true),starts=[],requests=[];
  s.context.window.consultationTimer={snapshot:()=>null,start:value=>starts.push(value)};
  s.context.fetch=async(url)=>{const action=new URL(url,'https://example.test').searchParams.get('action');requests.push(action);return {ok:true,json:async()=>action==='schedule.start'?{ok:true,started_at:'2026-11-05T12:07:00Z'}:{ok:true,items:[{...data,id:1}]}};};
  await s.nodes.get('.rx-nav').children[1].onclick();
  const actions=s.nodes.get('#scheduleBody').children[0].children[0].children[1].children[0].children[0];
  await actions.children[1].onclick();assert.deepEqual(starts,['2026-11-05T12:07:00Z']);assert.ok(requests.indexOf('schedule.start')>requests.indexOf('schedule.save'));
});

test('voltar para consulta do dia restaura documento e história sem reabrir status',async()=>{
  const s=setup(true),calls=[];let denied=false;
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  s.context.fetch=async(url,options)=>{
    const action=new URL(url,'https://example.test').searchParams.get('action');calls.push(action);
    if(action==='schedule.return')return {ok:!denied,json:async()=>denied?{ok:false,error:'Prazo encerrado'}:{ok:true,document:{document_type:'simples',document_title:'Receita salva',document_text:'Prescrição anterior'},clinical_history:'História anterior'}};
    return {ok:true,json:async()=>({ok:true,items:[{...data,id:8,date,status:'Finalizado'}]})};
  };
  s.nodes.get('#scheduleFinished').checked=true;
  await s.nodes.get('.rx-nav').children[1].onclick();
  const actions=s.nodes.get('#scheduleBody').children[0].children[0].children[1].children[0].children[0];
  assert.equal(actions.children[0].textContent,'Voltar para a consulta');assert.equal(actions.children[0].disabled,false);
  await actions.children[0].onclick();
  assert.equal(s.nodes.get('#rxText').value,'Prescrição anterior');assert.equal(s.nodes.get('#clinicalHistory').value,'História anterior');
  assert.equal(calls.includes('schedule.save'),false);
  await s.context.window.validateScheduledVisitEdit();denied=true;
  await assert.rejects(s.context.window.validateScheduledVisitEdit(),/Prazo encerrado/);
});

test('consulta de outro dia bloqueia retorno inclusive chamada direta do botão',async()=>{
  const s=setup(true),calls=[];
  s.context.fetch=async(url)=>{calls.push(url);return {ok:true,json:async()=>({ok:true,items:[{...data,id:8,date:'2001-01-01',status:'Finalizado'}]})};};
  s.nodes.get('#scheduleFinished').checked=true;await s.nodes.get('.rx-nav').children[1].onclick();
  const back=s.nodes.get('#scheduleBody').children[0].children[0].children[1].children[0].children[0].children[0];
  assert.equal(back.disabled,true);const before=calls.length;await back.onclick();assert.equal(calls.length,before);
  assert.equal(s.nodes.get('#rxText'),undefined);
});

test('grade usa 20 ou 30 minutos do procedimento e mantém agendamentos fora da grade',async()=>{
  const s=setup(true);
  s.context.window.procedureCatalog.load=async()=>[{id:1,name:'Consulta',duration:20,place_id:1},{id:2,name:'Retorno',duration:30,place_id:1}];
  s.context.fetch=async()=>({ok:true,json:async()=>({ok:true,items:[{...data,id:9,start:'09:15',end:'09:35'}]})});
  await s.nodes.get('.rx-nav').children[0].onclick();
  const times=()=>s.nodes.get('#scheduleBody').children[0].children.map(row=>row.children[0].textContent);
  assert.deepEqual(times().slice(0,4),['07:00','07:20','07:40','08:00']);assert.ok(times().includes('09:15'));
  const filter=s.created.find(n=>n.id==='scheduleProcedureFilter');filter.value='2';filter.onchange();
  assert.deepEqual(times().slice(0,3),['07:00','07:30','08:00']);assert.ok(times().includes('09:15'));
});

test('finaliza somente a consulta aberta e preserva vínculo após falha para tentar novamente',async()=>{
  const s=setup(true);const calls=[];let fail=false,status='Agendado';
  s.context.fetch=async(url,options)=>{
    const action=new URL(url,'https://example.test').searchParams.get('action'),value=JSON.parse(options.body);calls.push({action,value});
    if(action==='schedule.finish'&&fail)return {ok:false,json:async()=>({ok:false,error:'Sem conexão'})};
    if(action==='schedule.save')status=value.status;
    if(action==='schedule.finish')status='Finalizado';
    return {ok:true,json:async()=>({ok:true,items:[{...data,id:9,status}]})};
  };
  await s.nodes.get('.rx-nav').children[1].onclick();
  const actions=s.nodes.get('#scheduleBody').children[0].children[0].children[1].children[0].children[0];
  await actions.children[1].onclick();
  fail=true;await assert.rejects(s.context.window.finishScheduledVisit(),/Sem conexão/);
  assert.equal(status,'Em atendimento');
  fail=false;await s.context.window.finishScheduledVisit();assert.equal(status,'Finalizado');
  assert.equal(calls.find(c=>c.action==='schedule.finish').value.id,9);
  assert.equal(s.nodes.get('#scheduleFinished').checked,false);
  const count=calls.length;await s.context.window.finishScheduledVisit();assert.equal(calls.length,count);
});

test('finalizados continuam em Agendamentos e saem somente da fila de Consultas',async()=>{
  const s=setup(true);
  s.nodes.get('#scheduleDate').value=data.date;
  s.context.fetch=async()=>({ok:true,json:async()=>({ok:true,items:[{...data,id:1,status:'Finalizado'},{...data,id:2,name:'Paciente Aguardando',status:'Agendado'}]})});
  await s.nodes.get('.rx-nav').children[0].onclick();
  const grid=s.nodes.get('#scheduleBody').children[0];
  const cards=grid.children.flatMap(row=>row.children[1].children);
  assert.equal(cards.length,2);assert.ok(cards.some(card=>card.textContent.includes('Finalizado')));
  assert.equal(s.nodes.get('#scheduleFinishedFilter').hidden,true);
  s.nodes.get('#scheduleDate').value='2000-01-01';s.nodes.get('#scheduleSearch').value='busca antiga';s.nodes.get('#schedulePlaceFilter').value='99';
  await s.nodes.get('#scheduleConsultations').onclick();
  assert.equal(s.nodes.get('#scheduleSearch').value,'');assert.equal(s.nodes.get('#schedulePlaceFilter').value,'');
  assert.equal(s.nodes.get('#scheduleDate').value,new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));
  const rows=()=>s.nodes.get('#scheduleBody').children[0].children[0].children[1].children;
  assert.equal(rows().length,1);assert.equal(rows()[0].children[1].textContent,'Paciente Aguardando');
  s.nodes.get('#scheduleFinished').checked=true;s.nodes.get('#scheduleFinished').onchange();assert.equal(rows().length,2);
});

test('máscaras brasileiras aceitam CPF e telefone e enviam somente dígitos',async()=>{
  const s=setup(true);fill(s,{cpf:'12345678901',phone:'85912345678'});
  s.inputs.cpf.oninput();s.inputs.phone.oninput();
  assert.equal(s.inputs.cpf.value,'123.456.789-01');
  assert.equal(s.inputs.phone.value,'(85) 91234-5678');
  assert.ok(new RegExp('^(?:'+s.inputs.cpf.pattern+')$').test(s.inputs.cpf.value));
  assert.ok(new RegExp('^(?:'+s.inputs.phone.pattern+')$').test(s.inputs.phone.value));
  await s.nodes.get('#scheduleForm').onsubmit({preventDefault(){}});
  assert.equal(s.requests[0].data.cpf,'12345678901');assert.equal(s.requests[0].data.phone,'85912345678');
  s.inputs.phone.value='8533334444';s.inputs.phone.oninput();assert.equal(s.inputs.phone.value,'(85) 3333-4444');
});

test('clicar no horário aplica procedimento, valor, local e duração',async()=>{
  const s=setup();
  s.context.window.procedureCatalog.load=async()=>[{id:'7',name:'Consulta',price:'250.50',duration:45,place_id:1}];
  s.nodes.get('#scheduleDate').value=data.date;
  await s.nodes.get('#scheduleNew').onclick();
  assert.equal(s.inputs.price.value,'250.50');assert.equal(s.inputs.place_id.value,'1');assert.equal(s.inputs.end.value,'07:45');
  s.inputs.start.value='10:30';s.inputs.start.onchange();assert.equal(s.inputs.end.value,'11:15');
  s.inputs.start.value='23:30';s.inputs.start.onchange();assert.equal(s.inputs.end.value,'');
});
test('agenda local impede sobreposição, permite cancelar e liberar horário',async()=>{
  const s=setup();s.nodes.get('#scheduleDate').value=data.date;
  fill(s);await s.nodes.get('#scheduleForm').onsubmit({preventDefault(){}});
  fill(s,{start:'09:10',end:'09:30'});await s.nodes.get('#scheduleForm').onsubmit({preventDefault(){}});
  assert.match(s.nodes.get('#scheduleFormError').textContent,/Já existe/);
  fill(s,{status:'Cancelado'});await s.nodes.get('#scheduleForm').onsubmit({preventDefault(){}});
  assert.equal(s.requests.length,0);
});
test('produção envia cadastro à API autenticada e consulta a data selecionada',async()=>{
  const s=setup(true);s.nodes.get('#scheduleDate').value=data.date;fill(s);
  await s.nodes.get('#scheduleForm').onsubmit({preventDefault(){}});
  assert.match(s.requests[0].url,/schedule.save/);assert.equal(s.requests[0].data.cpf,data.cpf);
  assert.equal(s.requests[0].credentials,'same-origin');
  assert.match(s.requests[1].url,/schedule.list/);assert.equal(s.requests[1].data.date,data.date);
});
test('secretaria é direcionada à agenda ao tentar abrir receituário ou histórico',async()=>{
  const s=setup(true,true);s.context.show('#rxScreen');
  assert.equal(s.shown(),'#schedulingScreen');
  s.context.show('#patientsScreen');assert.equal(s.shown(),'#schedulingScreen');
  s.context.show('#loginScreen');assert.equal(s.shown(),'#loginScreen');
});
test('falha de gravação preserva o formulário para nova tentativa',async()=>{
  const s=setup(true);fill(s);s.screen.querySelector('#scheduleDialog').open=true;
  s.context.fetch=async()=>({ok:false,json:async()=>({ok:false,error:'Sem permissão'})});
  await s.nodes.get('#scheduleForm').onsubmit({preventDefault(){}});
  assert.equal(s.nodes.get('#scheduleDialog').open,true);
  assert.equal(s.inputs.name.value,data.name);assert.equal(s.nodes.get('#scheduleSave').disabled,false);
  assert.equal(s.nodes.get('#scheduleFormError').textContent,'Sem permissão');
});
test('não grava horário invertido; sair limpa formulário e fecha cadastro',async()=>{
  const s=setup();fill(s,{end:'08:00'});await s.nodes.get('#scheduleForm').onsubmit({preventDefault(){}});
  assert.match(s.nodes.get('#scheduleFormError').textContent,/horário final/);
  s.screen.querySelector('#scheduleDialog').open=true;s.nodes.get('#logoutButton').click();
  assert.equal(s.nodes.get('#scheduleDialog').open,false);
});
