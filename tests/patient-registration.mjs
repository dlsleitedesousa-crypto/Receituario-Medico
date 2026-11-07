import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../patients.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('cadastro exige somente nome, CPF e nascimento',()=>{
  const form=html.match(/<form id="patientRegistrationForm"[\s\S]*?<\/form>/)[0];
  const required=[...form.matchAll(/<input\b[^>]*\brequired\b[^>]*>/g)].map(match=>match[0].match(/id="([^"]+)"/)[1]);
  assert.deepEqual(required,['newPatientName','newPatientBirthDate','newPatientCpf']);
  assert.ok(form.includes('id="newPatientEmail" type="email"'));
});

test('filtros de pacientes combinam nome sem acentos, CPF, código, nascimento e telefone',()=>{
  const context=vm.createContext({foldName:value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()});
  vm.runInContext(source.slice(source.indexOf('  const filterPatients'),source.indexOf('  const render ='))+'\nglobalThis.filter=filterPatients;',context);
  const rows=[{id:1,name:'Paciente Fictícia',cpf:'00000000001',birth_date:'2000-01-02',phone:'(00) 90000-0001'},
    {id:2,name:'Outro Teste',cpf:'00000000002',birth_date:'1990-02-03',phone:''}];
  assert.equal(context.filter(rows,{name:'ficticia',cpf:'001',code:'1',birth:'2000-01-02',phone:'90000'}).length,1);
  assert.equal(context.filter(rows,{name:'ficticia',code:'2'}).length,0);
  assert.equal(context.filter(rows,{phone:'90000'}).length,1);
  assert.equal(context.filter(rows,{}).length,2);
});

test('cadastro mínimo salva opcionais vazios; erro preserva os dados para tentar novamente',async()=>{
  const submissions=[];let fail=false,closed=false;
  const data={name:'Paciente Fictício',cpf:'00000000001',birth_date:'2000-01-01',phone:'',email:'',sex:'',city:''};
  const context=vm.createContext({registrationForm:{},registrationData:()=>data,registrationError:{textContent:''},registrationButton:{disabled:false},
    patientAge:value=>value==='2000-01-01'?26:null,editingPatientId:null,load:async()=>{},detail:{classList:{add(){}}},toast(){},
    stopEditing:()=>closed=true,request:async(action,value)=>{submissions.push({action,value});if(fail)throw Error('Sem conexão');}});
  vm.runInContext(source.slice(source.indexOf('  registrationForm.onsubmit'),source.indexOf("  document.querySelector('#savePatient').onclick")),context);
  await context.registrationForm.onsubmit({preventDefault(){}});
  assert.equal(submissions[0].action,'patients.save');assert.equal(submissions[0].value.email,'');assert.equal(closed,true);
  fail=true;closed=false;context.editingPatientId=3;data.city='Cidade de teste';
  await context.registrationForm.onsubmit({preventDefault(){}});
  assert.equal(submissions[1].action,'patients.update');assert.equal(submissions[1].value.id,3);
  assert.equal(context.registrationError.textContent,'Sem conexão');assert.equal(closed,false);assert.equal(data.city,'Cidade de teste');
  assert.equal(context.registrationButton.disabled,false);
  data.cpf='';await context.registrationForm.onsubmit({preventDefault(){}});assert.equal(submissions.length,2);
});
