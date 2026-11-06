import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const context=vm.createContext({window:{}});vm.runInContext(readFileSync(new URL('../agenda-model.js',import.meta.url),'utf8'),context);
const model=context.window.agendaModel;
test('grade usa funcionamento e separa duração de atendimento do intervalo visual',()=>{
 const settings={...model.defaults,opening:'08:00',closing:'10:00',slot_interval:20,use_procedure_duration:false};
 assert.deepEqual(Array.from(model.slots(settings,{duration:30})),['08:00','08:20','08:40','09:00','09:20','09:40']);
 settings.use_procedure_duration=true;
 assert.deepEqual(Array.from(model.slots(settings,{duration:30})),['08:00','08:30','09:00','09:30']);
 assert.equal(model.slots({...settings,row_height:16},{duration:30}).length,model.slots({...settings,row_height:100},{duration:30}).length);
});
test('almoço bloqueia sobreposição mas aceita horários nas bordas',()=>{
 const settings={...model.defaults,lunch_enabled:true};
 assert.equal(model.available(settings,'11:30','12:00'),true);assert.equal(model.available(settings,'13:00','13:30'),true);
 assert.equal(model.available(settings,'11:50','12:10'),false);assert.equal(model.available(settings,'12:00','12:30'),false);
 assert.equal(model.available(settings,'06:30','07:30'),false);assert.equal(model.available(settings,'22:30','23:30'),false);
});
test('semana e mês abrangem dias corretos inclusive virada de ano',()=>{
 const week=Array.from(model.range('2027-01-01','week'));
 assert.equal(week[0],'2026-12-27');assert.equal(week[6],'2027-01-02');
 const month=Array.from(model.range('2026-11-05','month'));assert.equal(month.length,42);assert.equal(month[0],'2026-11-01');assert.equal(month[41],'2026-12-12');
 assert.equal(model.shift('2026-12-31',1),'2027-01-01');
});
