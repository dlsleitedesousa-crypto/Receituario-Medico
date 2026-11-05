import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function setup() {
  const nodes=new Map(),requests=[],buttons=[];
  class Node {
    constructor(tag='div'){this.tagName=tag;this.children=[];this.value='';this.checked=false;this.elements=Object.fromEntries(['id','name','price','duration'].map(key=>[key,{value:''}]));}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.children=[];this.append(...children);}
    querySelector(id){if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);}
    querySelectorAll(){return this.children.flatMap(n=>n.children).filter(n=>n.tagName==='input');}
    addEventListener(type,fn){this[type]=fn;}
    reset(){Object.values(this.elements).forEach(n=>n.value='');nodes.get('#procedurePlaceChoices')?.querySelectorAll().forEach(n=>n.checked=false);}
  }
  const open=new Node();buttons.push(open);
  const document={createElement:tag=>new Node(tag),createTextNode:text=>({textContent:text}),querySelector:id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);},querySelectorAll:()=>buttons,getElementById:id=>document.querySelector('#'+id),addEventListener(){}};
  const item={id:7,name:'Consulta',price:'200.00',duration:30,place_id:1,place_ids:[1,2]};
  const c=vm.createContext({document,window:{},location:{hostname:'example.test'},places:{a:{id:1,name:'Local A'},b:{id:2,name:'Local B'}},confirm:()=>true,FormData:class{constructor(form){return Object.entries(form.elements).map(([key,input])=>[key,input.value]);}},fetch:async(url,options)=>{const action=url.split('=')[1];requests.push({action,data:JSON.parse(options.body)});return {ok:true,json:async()=>({ok:true,items:[item]})};}});
  vm.runInContext(readFileSync(new URL('../procedure-settings.js',import.meta.url),'utf8'),c);
  return {nodes,requests,open,c};
}

test('todos os locais seleciona, desmarca e acompanha seleção parcial',async()=>{
  const s=setup();await s.open.click();
  const all=s.nodes.get('#procedureAllPlaces'),choices=s.nodes.get('#procedurePlaceChoices').querySelectorAll();
  all.checked=true;all.onchange();assert.deepEqual(choices.map(n=>n.checked),[true,true]);
  choices[1].checked=false;choices[1].onchange();assert.equal(all.checked,false);assert.equal(all.indeterminate,true);
  all.checked=true;all.onchange();all.checked=false;all.onchange();assert.deepEqual(choices.map(n=>n.checked),[false,false]);
});

test('editar recupera locais e salvar envia a seleção múltipla em um único cadastro',async()=>{
  const s=setup();await s.open.click();
  await s.nodes.get('#procedureList').children[0].children[1].onclick();
  assert.equal(s.nodes.get('#procedureAllPlaces').checked,true);
  await s.nodes.get('form').onsubmit({preventDefault(){}});
  const save=s.requests.find(r=>r.action==='procedures.save');assert.deepEqual(save.data.place_ids,['1','2']);assert.equal(save.data.id,7);
  const catalog=await s.c.window.procedureCatalog.load();assert.equal(catalog.length,2);assert.notEqual(catalog[0].id,catalog[1].id);assert.equal(catalog[0].procedure_id,7);
});

test('nenhum local marcado impede salvar',async()=>{
  const s=setup();await s.open.click();await s.nodes.get('form').onsubmit({preventDefault(){}});
  assert.equal(s.requests.some(r=>r.action==='procedures.save'),false);
  assert.match(s.nodes.get('#procedureFeedback').textContent,/Selecione pelo menos um local/);
});
