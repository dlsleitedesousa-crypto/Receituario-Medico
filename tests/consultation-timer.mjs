import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const timerSource=readFileSync(new URL('../consultation-timer.js',import.meta.url),'utf8');
const patientSource=readFileSync(new URL('../patients.js',import.meta.url),'utf8');
function setup(){
 const nodes=new Map(); const $=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',disabled:false,listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}});return nodes.get(id);};
 $('#patientName').value='Paciente Teste';$('#patientDoc').value='00000000000';$('#patientBirthDate').value='2000-01-01';$('#rxDate').value='2026-10-05';
 let now=Date.parse('2026-10-05T15:00:00Z'),tick,clears=0;const requests=[];
 class Clock extends Date{static now(){return now;}}
 const context=vm.createContext({Date:Clock,window:{saveAppointmentRecord:async data=>{requests.push(data);return {historyReady:true};}},document:{querySelector:$,addEventListener(){}},patientAge:()=>26,selectedPlace:{id:1},toast(){},setInterval(fn){tick=fn;return 1;},clearInterval(){tick=null;},clearPatient(){clears++;$('#patientDoc').value='';}});
 $('#clearPatient').onclick=()=>context.clearPatient();
 vm.runInContext(timerSource,context);
 return {context,$,requests,advance(ms){now+=ms;tick?.();},get clears(){return clears;}};
}
test('conta pelo tempo real, evita reinício e salva duração antes de limpar',async()=>{
 const s=setup();s.$('#startConsultation').onclick();const start=s.context.window.consultationTimer.snapshot().started_at;
 s.advance(65000);assert.equal(s.$('#consultationElapsed').textContent,'00:01:05');
 s.$('#startConsultation').onclick();assert.equal(s.context.window.consultationTimer.snapshot().started_at,start);
 await s.$('#clearPatient').onclick();assert.equal(s.requests[0].timerOnly,true);assert.equal(s.clears,1);
 assert.equal(s.$('#consultationElapsed').textContent,'00:00:00');assert.equal(s.context.window.consultationTimer.snapshot(),null);
});
test('falha ao gravar preserva paciente e cronômetro para tentar novamente',async()=>{
 const s=setup();s.context.window.saveAppointmentRecord=async()=>{throw Error('Sem conexão');};s.$('#startConsultation').onclick();s.advance(5000);
 await s.$('#clearPatient').onclick();assert.equal(s.clears,0);assert.equal(s.$('#patientDoc').value,'00000000000');assert.equal(s.context.window.consultationTimer.snapshot().duration_seconds,5);
 assert.equal(s.$('#clearPatient').disabled,false);
});
test('mudar paciente ou sair zera cronômetro e não reutiliza início anterior',()=>{
 const s=setup();s.$('#startConsultation').onclick();s.$('#patientDoc').listeners.input();assert.equal(s.context.window.consultationTimer.snapshot(),null);
 s.$('#startConsultation').onclick();s.$('#logoutRx').listeners.click();assert.equal(s.$('#consultationElapsed').textContent,'00:00:00');
});
test('salva somente tempo e atualiza duração mesmo durante janela de deduplicação',async()=>{
 const requests=[];let duration=20;
 const context=vm.createContext({window:{consultationTimer:{snapshot:()=>({started_at:'2026-10-05T15:00:00.000Z',duration_seconds:duration})}},clinicalHistoryInput:{value:''},validPatient:()=>true,selectedPlace:{id:1},patientData:()=>({cpf:'00000000000'}),toast(){},load:async()=>{},request:async(action,data)=>{requests.push({action,data});return action==='appointments.save'?{appointment_id:1,patient_id:1}:{items:[{id:1}]};}});
 vm.runInContext(patientSource.slice(patientSource.indexOf('  const recentAppointments'),patientSource.indexOf("  document.querySelector('#saveAppointment').onclick")),context);
 const entry={type:'simples',title:'Tempo de atendimento',text:'',date:'2026-10-05',timerOnly:true};
 await context.window.saveAppointmentRecord(entry);duration=45;await context.window.saveAppointmentRecord(entry);
 const saves=requests.filter(r=>r.action==='appointments.save');assert.equal(saves.length,2);assert.equal(saves[1].data.consultation.duration_seconds,45);assert.equal(saves[1].data.document_text,'');
});
test('histórico mostra início no fuso local e duração sem contar como documento',()=>{
 const node=()=>({children:[],append(...items){this.children.push(...items);},replaceChildren(){this.children=[];}});
 const durationFn=timerSource.slice(0,timerSource.indexOf('(() =>'));
 const c=vm.createContext({document:{createElement:node}});vm.runInContext(durationFn+patientSource.slice(patientSource.indexOf('  const formatDate'),patientSource.indexOf('  const clinicalHistoryInput'))+'\nglobalThis.render=renderHistory;',c);
 const root=node();c.render(root,[{document_type:'tempo_atendimento',document_title:'Tempo de atendimento',document_date:'2026-10-05',consultation_started_at:'2026-10-05 15:00:00',consultation_duration_seconds:65}]);
 assert.ok(root.children[0].children[0].textContent.includes('0 documentos'));
 const content=root.children[0].children[1].children[0].children[2].textContent;
 assert.ok(content.includes('12:00:00'));assert.ok(content.includes('00:01:05'));
});
