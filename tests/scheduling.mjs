import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function setup(production=false, secretary=false) {
  const nodes=new Map(), listeners={}, requests=[];
  class Node {
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.value='';this.children=[];this.textContent='';this.classList={add(){}};}
    append(...nodes){this.children.push(...nodes);if(this.tagName==='SELECT'&&this.children.length===nodes.length)this.value=nodes[0]?.value||'';}
    replaceChildren(...nodes){this.children=[];this.append(...nodes);}
    querySelector(id){if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);}
    before(){} setAttribute(){} addEventListener(event,fn){this[event]=fn;}
    showModal(){this.open=true;} close(){this.open=false;} reset(){}
    createTHead(){return this;}createTBody(){return this;}
    insertRow(){const n=new Node();this.append(n);return n;}
    insertCell(){const n=new Node();this.append(n);return n;}
  }
  const document={body:new Node(),createElement:tag=>new Node(tag),querySelector:id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);},addEventListener:(e,fn)=>listeners[e]=fn,dispatchEvent(){}};
  let shown;
  const context=vm.createContext({document,location:{hostname:production?'example.test':'localhost'},Intl,Date,Event,window:{currentSessionUser:{secretary_owner_id:secretary?1:null}},doctor:{name:'Profissional de teste'},places:{one:{id:1,name:'Local de teste'}},show(id){shown=id;},toast(){},patientAge:()=>20,confirm:()=>true,clearPatient(){},updatePaperPatient(){},openRx(){},fetch:async(url,options)=>{requests.push({url,credentials:options.credentials,data:JSON.parse(options.body)});return {ok:true,json:async()=>({ok:true,items:[]})};}});
  vm.runInContext(readFileSync(new URL('../scheduling.js',import.meta.url),'utf8'),context);
  const screen=document.body.children[0], fields=nodes.get('#scheduleFields').children;
  const inputs=Object.fromEntries(fields.map(label=>{const input=label.children[1];return [input.name,input];}));
  return {nodes,inputs,requests,screen,listeners,context,shown:()=>shown};
}
const data={name:'Paciente Fictício',cpf:'12345678901',birth_date:'2000-01-01',date:'2026-11-01',phone:'',start:'09:00',end:'09:20',procedure:'Consulta',attendance_type:'Consulta',place_id:'1',status:'Agendado',insurance:'',notes:'<script>texto de teste</script>'};
const fill=(s,values={})=>Object.entries({...data,...values}).forEach(([key,value])=>s.inputs[key].value=value);
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
