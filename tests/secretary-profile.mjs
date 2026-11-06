import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function setup(){
  const nodes=new Map(),requests=[];
  class Node {
    constructor(tag='div'){this.tagName=tag;this.children=[];this.value='';this.textContent='';this.checked=false;this.elements={name:{value:'',focus(){}},email:{value:''},password:{value:''}};}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.children=[];this.append(...children);}
    querySelector(id){if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);}
    querySelectorAll(selector){return this.children.flatMap(n=>n.children).filter(n=>n.tagName==='input'&&(selector!=='input:checked'||n.checked));}
    reset(){Object.values(this.elements).forEach(n=>n.value='');nodes.get('#secretaryPlaceChoices')?.querySelectorAll('input').forEach(n=>n.checked=false);}
    focus(){} addEventListener(){} showModal(){this.open=true;}close(){this.open=false;}
  }
  const document={body:new Node(),createElement:tag=>new Node(tag),createTextNode:text=>({textContent:text}),querySelector:id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);}};
  const context=vm.createContext({document,window:{},location:{hostname:'example.test'},toast(){},fetch:async(url,options)=>{
    const action=new URL(url,'https://example.test').searchParams.get('action');requests.push({action,data:JSON.parse(options.body)});
    return {ok:true,json:async()=>({ok:true,items:action==='places.list'?[{id:1,name:'Clínica A'},{id:2,name:'Clínica B'}]:action==='secretaries.list'?[{id:3,name:'Secretária de teste',email:'secretaria@example.test',secretary_enabled:1,place_ids:[2]}]:[]})};
  }});
  vm.runInContext(readFileSync(new URL('../secretary-profile.js',import.meta.url),'utf8'),context);
  return {nodes,requests,document};
}
test('cadastro fica em Meu perfil e edição seleciona somente os locais autorizados',async()=>{
  const s=setup();assert.equal(s.nodes.get('#profileSettings').children.length,1);
  await s.nodes.get('#manageSecretaries').onclick();
  const row=s.nodes.get('#secretaryAccessList').children[0];row.children[1].onclick();
  assert.deepEqual(s.nodes.get('#secretaryPlaceChoices').querySelectorAll('input').map(n=>n.checked),[false,true]);
  assert.equal(s.nodes.get('#secretaryAccessForm').elements.password.value,'');
  assert.equal(s.nodes.get('#secretaryAccessForm').elements.email.readOnly,true);
});
test('editar locais mantém senha vazia e envia apenas os selecionados',async()=>{
  const s=setup();await s.nodes.get('#manageSecretaries').onclick();s.nodes.get('#secretaryAccessList').children[0].children[1].onclick();
  const choices=s.nodes.get('#secretaryPlaceChoices').querySelectorAll('input');choices[0].checked=true;choices[1].checked=false;
  await s.nodes.get('#secretaryAccessForm').onsubmit({preventDefault(){}});
  const saved=s.requests.find(r=>r.action==='secretaries.save');assert.deepEqual(saved.data.place_ids,[1]);assert.equal(saved.data.password,'');
});
test('nenhum local selecionado impede gravação',async()=>{
  const s=setup();await s.nodes.get('#manageSecretaries').onclick();
  await s.nodes.get('#secretaryAccessForm').onsubmit({preventDefault(){}});
  assert.equal(s.requests.some(r=>r.action==='secretaries.save'),false);
  assert.match(s.nodes.get('#secretaryAccessError').textContent,/pelo menos um local/);
});
