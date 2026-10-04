import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const backend = readFileSync(new URL('../backend.js', import.meta.url), 'utf8');
function setup(production = false) {
  const nodes = new Map(), storage = new Map(), requests = [];
  let rows = [], screen, selectedType;
  const makeNode = () => ({value:'', textContent:'', innerHTML:'', dataset:{},
    classList:{add(){},remove(){}}, focus(){}, scrollIntoView(){}, reset(){},
    insertAdjacentElement(){}, addEventListener(name, fn){this.listener = fn;},
    closest(){return {querySelector:()=>makeNode()};},
    click(){selectedType='orcamento';}
  });
  const $ = selector => {if(!nodes.has(selector)) nodes.set(selector,makeNode()); return nodes.get(selector);};
  const context = vm.createContext({$, document:{createElement:makeNode},
    physioModelsButton:makeNode(), localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},
    alphabeticModels:models=>[...models].sort((a,b)=>a.name.localeCompare(b.name)),
    safe:value=>String(value).replaceAll('<','&lt;'), toast(){}, confirm:()=>true,
    show:value=>screen=value, fail:error=>{throw error;},
    api:async(action,data)=>{
      requests.push({action,data});
      if(action==='models.save') {
        const row={...data,id:data.id||String(rows.length+1)};
        rows=rows.filter(item=>item.id!==row.id); rows.push(row);
      }
      if(action==='models.delete') rows=rows.filter(item=>item.id!==data.id);
      return {items:rows};
    }
  });
  vm.runInContext(html.slice(html.indexOf('const budgetModelsButton='),html.indexOf("$('#rxText').placeholder=")),context);
  if(production) {
    const config=backend.split('\n').find(line=>line.includes("category: 'orcamento'"));
    const handlers=backend.slice(backend.indexOf('  const loadModels ='), backend.indexOf("  api('status')"));
    vm.runInContext(`const modelConfigs=[${config}];\n${handlers}`,context);
  }
  const action = async (name,id) => {
    const card={dataset:{budgetModel:id}};
    const button={disabled:false,closest:()=>card};
    const target={closest:selector=>selector==='.delete'?(name==='delete'?button:null):selector==='[data-budget-model]'?card:{dataset:{budgetAction:name}}};
    const event={target,preventDefault(){},stopImmediatePropagation(){}};
    if(production && name==='delete') await $('#budgetModelList').listener(event);
    else $('#budgetModelList').onclick(event);
  };
  return {$,context,requests,storage,action,get screen(){return screen;},get selectedType(){return selectedType;}};
}
for(const production of [false,true]) test(`orçamento: cadastrar, editar, aplicar e excluir (${production?'servidor':'local'})`,async()=>{
  const t=setup(production);
  t.$('#newBudgetModel').onclick();
  t.$('#budgetModelName').value='Procedimento';
  t.$('#budgetModelText').value='Serviço: R$ 100\nValidade: 30 dias';
  await t.$('#budgetModelForm').onsubmit({preventDefault(){}});
  const id=vm.runInContext('budgetModels[0].id',t.context);
  assert.ok(t.$('#budgetModelList').innerHTML.includes('Procedimento'));
  await t.action('edit',id);
  assert.equal(t.$('#budgetModelText').value,'Serviço: R$ 100\nValidade: 30 dias');
  t.$('#budgetModelText').value='Serviço: R$ 150';
  await t.$('#budgetModelForm').onsubmit({preventDefault(){}});
  assert.equal(vm.runInContext('budgetModels.length',t.context),1);
  await t.action('apply',id);
  assert.equal(t.selectedType,'orcamento');
  assert.equal(t.$('#paperTitle').textContent,'Orçamento');
  assert.equal(t.$('#rxText').value,'Serviço: R$ 150');
  assert.equal(t.screen,'#rxScreen');
  await t.action('delete',id);
  assert.equal(vm.runInContext('budgetModels.length',t.context),0);
  if(production) {
    assert.ok(t.requests.some(r=>r.action==='models.save'&&r.data.category==='orcamento'));
    assert.ok(t.requests.some(r=>r.action==='models.delete'&&r.data.id===id));
  } else assert.equal(t.storage.get('clinicaFlowBudgetModels'),'[]');
});
test('scripts válidos e IDs únicos',()=>{
  for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
  const markup=html.slice(0,html.indexOf('<script>'));
  const ids=[...markup.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(new Set(ids).size,ids.length);
});
