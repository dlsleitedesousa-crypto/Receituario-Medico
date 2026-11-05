import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function setup(production=false, secretary=false) {
  const nodes=new Map(), listeners={}, requests=[];
  class Node {
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.value='';this.children=[];this.dataset={};this.textContent='';this.classList={add(){}};}
    append(...nodes){this.children.push(...nodes);if(this.tagName==='SELECT'&&this.children.length===nodes.length)this.value=nodes[0]?.value||'';}
    replaceChildren(...nodes){this.children=[];this.append(...nodes);}
    get options(){return this.children;}
    get selectedOptions(){const selected=this.children.filter(n=>n.selected);return selected.length?selected:this.children.filter(n=>n.value===this.value);}
    querySelector(id){if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);}
    before(){} setAttribute(){} addEventListener(event,fn){this[event]=fn;}
    showModal(){this.open=true;} close(){this.open=false;} reset(){}
    createTHead(){return this;}createTBody(){return this;}
    insertRow(){const n=new Node();this.append(n);return n;}
    insertCell(){const n=new Node();this.append(n);return n;}
  }
  const document={body:new Node(),createElement:tag=>new Node(tag),querySelector:id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);},addEventListener:(e,fn)=>listeners[e]=fn,dispatchEvent(){}};
  let shown;
  const context=vm.createContext({document,formatDoctorCpf:value=>String(value).replace(/\D/g,'').slice(0,11).replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2'),location:{hostname:production?'example.test':'localhost'},Intl,Date,Event,window:{procedureCatalog:{load:async()=>[]},currentSessionUser:{secretary_owner_id:secretary?1:null}},doctor:{name:'Profissional de teste'},places:{one:{id:1,name:'Local de teste'}},show(id){shown=id;},toast(){},patientAge:()=>20,confirm:()=>true,clearPatient(){},updatePaperPatient(){},openRx(){},fetch:async(url,options)=>{requests.push({url,credentials:options.credentials,data:JSON.parse(options.body)});return {ok:true,json:async()=>({ok:true,items:[]})};}});
  vm.runInContext(readFileSync(new URL('../scheduling.js',import.meta.url),'utf8'),context);
  const screen=document.body.children[0], fields=nodes.get('#scheduleFields').children;
  const inputs=Object.fromEntries(fields.map(label=>{const input=label.children[1];return [input.name,input];}));
  return {nodes,inputs,requests,screen,listeners,context,shown:()=>shown};
}
const data={name:'Paciente Fictício',cpf:'12345678901',birth_date:'2000-01-01',date:'2026-11-01',phone:'',start:'09:00',end:'09:20',procedure:'Consulta',attendance_type:'Consulta',place_id:'1',status:'Agendado',insurance:'',notes:'<script>texto de teste</script>'};
const fill=(s,values={})=>Object.entries({...data,...values}).forEach(([key,value])=>s.inputs[key].value=value);

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
