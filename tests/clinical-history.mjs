import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../patients.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('história clínica vem antes dos documentos somente na data correspondente',()=>{
 const element=tag=>({tag,children:[],append(...items){this.children.push(...items);},replaceChildren(){this.children=[];}});
 const context=vm.createContext({document:{createElement:element}});
 vm.runInContext(source.slice(source.indexOf('  const formatDate'),source.indexOf('  const clinicalHistoryInput'))+'\nglobalThis.render=renderHistory;',context);
 const root=element('div');
 context.render(root,[
  {document_type:'simples',document_date:'2026-10-04',document_title:'Receita',document_text:'Documento'},
  {document_type:'historia_clinica',document_date:'2026-10-04',document_title:'História clínica',document_text:'Evolução'},
  {document_type:'simples',document_date:'2026-10-03',document_title:'Anterior',document_text:'Outro dia'}
 ]);
 assert.equal(root.children.length,2);
 assert.equal(root.children[0].children[0].textContent,'04/10/2026 · 1 documento · História clínica');
 const cards=root.children[0].children[1].children;
 assert.equal(cards[0].children[0].textContent,'História clínica');
 assert.equal(cards[0].children[2].textContent,'Evolução');
 assert.equal(cards[1].children[0].textContent,'Receita');
 assert.equal(root.children[1].children[1].children.length,1);
});
test('salva história sem receita e envia alterações posteriores sem usar resultado antigo',async()=>{
 const requests=[];
 const clinicalHistoryInput={value:'Primeira evolução'};
 const context=vm.createContext({window:{},clinicalHistoryInput,validPatient:()=>true,selectedPlace:{id:1},
  patientData:()=>({cpf:'00000000000'}),toast(){},load:async()=>{},
  request:async(action,data)=>{
   requests.push({action,data});
   return action==='appointments.save'?{appointment_id:5,patient_id:2}:{items:[{id:5}]};
  }
 });
 vm.runInContext(source.slice(source.indexOf('  const recentAppointments'),source.indexOf("  document.querySelector('#saveAppointment').onclick")),context);
 const entry={type:'simples',title:'Receita',text:'',date:'2026-10-04'};
 assert.equal((await context.window.saveAppointmentRecord(entry)).historyReady,true);
 clinicalHistoryInput.value='Evolução atualizada';
 await context.window.saveAppointmentRecord(entry);
 const saves=requests.filter(r=>r.action==='appointments.save');
 assert.equal(saves.length,2);
 assert.equal(saves[0].data.clinical_history,'Primeira evolução');
 assert.equal(saves[1].data.clinical_history,'Evolução atualizada');
 assert.equal(saves[1].data.document_date,'2026-10-04');
 clinicalHistoryInput.value='';
 assert.equal(await context.window.saveAppointmentRecord(entry),null);
});
test('história fica fora da folha impressa e é limpa ao limpar paciente',()=>{
 const paper=html.match(/<article class="paper">([\s\S]*?)<\/article>/)[1];
 assert.ok(!paper.includes('clinicalHistory'));
 assert.ok(html.includes('@media print{.clinical-history{display:none!important}}'));
 const clear=html.match(/function clearPatient\(\)\{[^\n]+/)[0];
 assert.ok(clear.includes("'#clinicalHistory'"));
});
