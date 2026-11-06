/* Regras de datas e de exibição da agenda, sem dados de pacientes. */
(() => {
  const defaults={opening:'07:00',closing:'23:00',lunch_enabled:false,lunch_start:'12:00',lunch_end:'13:00',default_duration:30,slot_interval:30,use_procedure_duration:true,row_height:66};
  const minutes=time=>Number(time.slice(0,2))*60+Number(time.slice(3));
  const time=value=>String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');
  const date=value=>{const d=new Date(value+'T12:00:00');return d;};
  const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const shift=(value,days)=>{const d=date(value);d.setDate(d.getDate()+days);return iso(d);};
  function range(value,view) {
    if(view==='week'){const d=date(value);const start=shift(value,-d.getDay());return Array.from({length:7},(_,i)=>shift(start,i));}
    if(view==='month'){const d=date(value);d.setDate(1);const start=shift(iso(d),-d.getDay());return Array.from({length:42},(_,i)=>shift(start,i));}
    return [value];
  }
  const interval=(settings,procedure)=>settings.use_procedure_duration?Number(procedure?.duration||settings.default_duration):Number(settings.slot_interval);
  function slots(settings,procedure) {
    const result=[],step=Math.max(1,interval(settings,procedure));
    for(let value=minutes(settings.opening);value<minutes(settings.closing);value+=step)result.push(time(value));
    return result;
  }
  const available=(settings,start,end)=>start>=settings.opening&&end<=settings.closing&&start<end&&(!settings.lunch_enabled||end<=settings.lunch_start||start>=settings.lunch_end);
  window.agendaModel={defaults,minutes,time,date,iso,shift,range,interval,slots,available};
})();
