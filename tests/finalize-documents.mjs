import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

test('finalização recupera documentos pendentes, reutiliza os salvos e separa paciente e local',async()=>{
  const calls=[];let fail=true;
  const source=readFileSync(new URL('../print-summary.js',import.meta.url),'utf8');
  const c=vm.createContext({window:{saveAppointmentRecord:async entry=>{calls.push(entry);if(entry.title==='Pendente'&&fail)throw Error('Sem conexão');return {appointment_id:calls.length,historyReady:true};}},$:()=>({value:'123.456.789-01'}),selectedPlace:{id:1}});
  vm.runInContext(source.slice(0,source.indexOf('function printSummaryText')),c);
  vm.runInContext(`printSummaryEntries=[
    {cpf:'12345678901',placeId:1,type:'simples',title:'Salvo',text:'Receita',date:'2026-11-05'},
    {cpf:'12345678901',placeId:1,type:'apac',title:'Pendente',text:'APAC',date:'2026-11-05'},
    {cpf:'00000000000',placeId:1,title:'Outro paciente'},
    {cpf:'12345678901',placeId:2,title:'Outro local'}];`,c);
  await assert.rejects(c.window.savePrintedDocuments(),/Sem conexão/);
  fail=false;const result=await c.window.savePrintedDocuments();assert.equal(result.length,2);
  assert.equal(calls.filter(entry=>entry.title==='Salvo').length,1);
  assert.equal(calls.filter(entry=>entry.title==='Pendente').length,2);
  assert.equal(calls.length,3);await c.window.savePrintedDocuments();assert.equal(calls.length,3);
});

test('finalizar salva impressos e consulta antes de encerrar e navegar; falha mantém tela',async()=>{
  const source=readFileSync(new URL('../patients.js',import.meta.url),'utf8'),nodes=new Map(),events=[];
  const $=id=>{if(!nodes.has(id))nodes.set(id,{value:'Texto atual',textContent:'Receita',dataset:{type:'simples'},disabled:false});return nodes.get(id);};
  let fail=false;
  const c=vm.createContext({document:{querySelector:$},clinicalHistoryInput:{value:'Anamnese e história clínica'},window:{savePrintedDocuments:async()=>{events.push('impressos');if(fail)throw Error('Sem conexão');return [{historyReady:true}];},finishScheduledVisit:async()=>events.push('status'),consultationTimer:{snapshot:()=>null,reset:()=>events.push('encerrar')},openConsultations:async()=>events.push('consultas')},saveAppointmentRecord:async()=>{events.push('consulta');return {historyReady:true};},toast(){},notifyError(){}});
  vm.runInContext(source.slice(source.indexOf('  const persistCurrentAppointment'),source.indexOf("  document.addEventListener('patients:load'")),c);
  await $('#finishAppointment').onclick();assert.deepEqual(events,['impressos','consulta','status','encerrar','consultas']);
  events.length=0;fail=true;await $('#finishAppointment').onclick();assert.deepEqual(events,['impressos']);assert.equal($('#finishAppointment').disabled,false);
  events.length=0;fail=false;$('#rxText').value='';c.clinicalHistoryInput.value='';
  await $('#finishAppointment').onclick();assert.deepEqual(events,['impressos','status','encerrar','consultas']);
});
