/* Resumo dos documentos encaminhados para impressão no atendimento atual. */
let printSummaryEntries=[];
function resetPrintSummary(){printSummaryEntries=[]}
function capturePrintSummary(){
  const type=$('.type-card.active')?.dataset.type||'personalizado';
  return {
    title:type==='especial'?'Receita de Controle Especial':$('#paperTitle').textContent,
    patient:$('#patientName').value.trim()||'Não informado',cpf:$('#patientDoc').value,
    birthDate:$('#patientBirthDate').value,age:patientAge($('#patientBirthDate').value),
    text:$('#rxText').value,date:$('#rxDate').value,
    professional:$('#professionalSignature').innerText,place:selectedPlace?.name||'',
    address:selectedPlace?.address||'',phone:selectedPlace?.phone||'',
    cnpj:selectedPlace?.cnpj||'',cnes:selectedPlace?.cnes||'',
    requestedAt:new Date().toLocaleString('pt-BR')
  };
}
function printSummaryText(entry){
  const formatDate=value=>value?value.split('-').reverse().join('/'):'Não informada';
  return [entry.title,'Paciente: '+entry.patient,
    entry.cpf?'CPF: '+entry.cpf:'',entry.birthDate?'Nascimento: '+formatDate(entry.birthDate):'',
    entry.age!==null?'Idade: '+entry.age+' '+(entry.age===1?'ano':'anos'):'',
    'Data do documento: '+formatDate(entry.date),'Enviado para impressão/PDF: '+entry.requestedAt,
    '',entry.text||'(Documento sem texto)','',entry.professional,
    entry.place,entry.address,entry.phone?'Telefone: '+entry.phone:'',
    entry.cnpj?'CNPJ: '+entry.cnpj:'',entry.cnes?'CNES: '+entry.cnes:''
  ].filter(value=>value!==undefined&&value!==null&&value!=='').join('\n');
}
function printSummaryCopyText(entry){return entry.title+'\n\n'+(entry.text||'')}
async function copyPrintSummaryText(text){
  try{
    if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
    else{
      const field=document.createElement('textarea');field.value=text;field.style.position='fixed';field.style.opacity='0';document.body.append(field);
      try{field.select();if(!document.execCommand('copy'))throw Error('copy')}finally{field.remove()}
    }
    toast('Informações copiadas');
  }catch{toast('Não foi possível copiar. Selecione o texto do resumo e copie manualmente.')}
}
function renderPrintSummary(){
  const list=$('#printSummaryList');list.replaceChildren();$('#copyPrintSummary').disabled=!printSummaryEntries.length;
  if(!printSummaryEntries.length){const empty=document.createElement('div');empty.className='empty-models';empty.textContent='Nenhum documento enviado para impressão neste atendimento.';list.append(empty);return}
  printSummaryEntries.forEach((entry,index)=>{
    const card=document.createElement('article');card.className='model-card';
    const header=document.createElement('div');header.className='summary-heading';
    const title=document.createElement('h3');title.textContent=(index+1)+'. '+entry.title;
    const button=document.createElement('button');button.type='button';button.className='btn outline';button.textContent='Copiar informações';button.onclick=()=>copyPrintSummaryText(printSummaryCopyText(entry));
    const content=document.createElement('div');content.className='summary-content';content.textContent=printSummaryText(entry);
    header.append(title,button);card.append(header,content);list.append(card);
  });
}
$('#openPrintSummary').onclick=()=>{renderPrintSummary();show('#printSummaryScreen')};
$('#backFromPrintSummary').onclick=()=>show('#rxScreen');
$('#copyPrintSummary').onclick=()=>{if(printSummaryEntries.length)copyPrintSummaryText(printSummaryEntries.map(printSummaryCopyText).join('\n\n'))};
['#logoutButton','#logoutRx'].forEach(id=>$(id).addEventListener('click',resetPrintSummary));
