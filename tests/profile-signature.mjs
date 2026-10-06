import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const profile = readFileSync(new URL('../profile.js', import.meta.url), 'utf8');
function setup() {
  const nodes = new Map();
  const $ = key => {
    if (!nodes.has(key)) nodes.set(key, { value:'', checked:false, disabled:false, innerHTML:'', classList:{toggle(){}}, addEventListener(type,fn){this[type]=fn;}, removeAttribute(){}, closest(){return {id:'rxScreen'};} });
    return nodes.get(key);
  };
  const button = $('#openProfile');
  const context = vm.createContext({ $, $$:()=>[button], doctor:{}, safe:value=>String(value||'').replaceAll('<','&lt;').replaceAll('"','&quot;'), toast(){}, show(){} });
  const fn = html.split('\n').find(line=>line.startsWith('function doctorSignature()'));
  vm.runInContext(fn+'\n'+profile, context);
  return {context,$,button};
}
const user = {name:'Profissional teste',title:'Dr.',specialty:'Ortopedia',crm:'CRM 123-UF',rqe:'456',phone:'(00) 00000-0000',specialistTitle:'Especialista <teste>', signature:'data:image/png;base64,aGVsbG8='};
test('assinatura depende da chave e título aparece depois do CRM/RQE',()=>{
  const {context,$}=setup(); context.applyUserProfile(user);
  assert.equal($('#useElectronicSignature').checked,false);
  assert.equal($('#useElectronicSignature').disabled,false);
  let output=context.doctorSignature(); assert.ok(!output.includes('<img'));
  assert.ok(output.indexOf('RQE 456')<output.indexOf('Especialista &lt;teste>'));
  $('#useElectronicSignature').checked=true; $('#useElectronicSignature').onchange();
  assert.ok($('#professionalSignature').innerHTML.includes('<img class="signature-image"'));
  $('#useElectronicSignature').checked=false;
  assert.ok(!context.doctorSignature().includes('<img'));
});
test('abrir e cancelar edição preserva assinatura; remoção é enviada no perfil',()=>{
  const {context,$,button}=setup(); context.applyUserProfile(user); button.onclick();
  assert.equal(context.profileValues().signature,user.signature);
  assert.equal(context.profileValues().phone,user.phone);
  $('#profileRemoveSignature').onclick(); $('#cancelProfile').onclick();
  assert.equal(context.doctor.signature,user.signature);
  button.onclick(); assert.equal(context.profileValues().signature,user.signature);
  $('#profileRemoveSignature').onclick(); const values=context.profileValues();
  assert.equal(values.signature,''); context.applyUserProfile(values);
  assert.equal($('#useElectronicSignature').disabled,true);
});
test('perfil antigo e nova sessão deixam a chave desligada',()=>{
  const {context,$}=setup(); context.applyUserProfile(user); $('#useElectronicSignature').checked=true;
  context.applyUserProfile({...user,signature:''});
  assert.equal($('#useElectronicSignature').checked,false);
  assert.equal($('#useElectronicSignature').disabled,true);
});
test('URL externa e SVG não são inseridos como assinatura',()=>{
  const {context,$}=setup();
  for(const signature of ['https://example.test/sign.png','data:image/svg+xml;base64,aGVsbG8=']) {
    context.applyUserProfile({...user,signature}); $('#useElectronicSignature').checked=true;
    assert.ok(!context.doctorSignature().includes('<img'));
  }
});

test('upload rejeita formato/tamanho e restaura botão após falha',async()=>{
  const {context,$}=setup(); const messages=[]; context.toast=message=>messages.push(message);
  const submit={disabled:false};
  for(const file of [{type:'image/svg+xml',size:20},{type:'image/png',size:3*1024*1024}]) {
    await $('#profileSignatureFile').onchange({target:{files:[file],closest:()=>({querySelector:()=>submit})}});
    assert.equal(submit.disabled,false); assert.equal(context.profileValues().signature,'');
  }
  assert.equal(messages.length,2);
});
test('upload válido entra no rascunho e pode ser removido antes de salvar',async()=>{
  const {context,$}=setup();
  context.FileReader=class { readAsDataURL(){this.result=user.signature;this.onload();} };
  context.Image=class { naturalWidth=400; naturalHeight=100; async decode(){} };
  const submit={disabled:false};
  await $('#profileSignatureFile').onchange({target:{files:[{type:'image/png',size:100}],closest:()=>({querySelector:()=>submit})}});
  assert.equal(context.profileValues().signature,user.signature);
  assert.equal($('#profileSignaturePreview').src,user.signature);
  assert.equal(submit.disabled,false);
  $('#profileRemoveSignature').onclick(); assert.equal(context.profileValues().signature,'');
});
