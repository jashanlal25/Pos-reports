import {getSaved,saveReport,clearSaved} from './storage.mjs';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,dp=2)=>v===null||v===undefined?'—':Number(v).toLocaleString('en-PK',{minimumFractionDigits:dp,maximumFractionDigits:dp});
const money=v=>'Rs '+fmt(v),date=v=>/^\d{8}$/.test(v)?new Date(`${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}T12:00:00`).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'Not recorded';
let report=null,tab='receivables',page=1,filtered=[],busy=false,installPrompt=null,balancesVisible=false;const perPage=30;
function renderBalances(){
 const values=report?.summary;
 for(const [id,key] of [['receivableTotal','receivable'],['payableTotal','payable'],['stockTotal','stockCost']]){
  const shown=balancesVisible&&values;
  $(id).textContent=shown?money(values[key]):'••••••';
  $(id).setAttribute('aria-label',shown?money(values[key]):'Balance hidden');
 }
 $('toggleBalances').setAttribute('aria-pressed',String(balancesVisible));
 $('toggleBalances').setAttribute('aria-label',balancesVisible?'Hide summary balances':'Show summary balances');
 $('balanceToggleLabel').textContent=balancesVisible?'Hide balances':'Show balances';
 $('eyeSlash').style.display=balancesVisible?'none':'';
}
$('toggleBalances').onclick=()=>{balancesVisible=!balancesVisible;renderBalances()};
window.addEventListener('pageshow',()=>{balancesVisible=false;renderBalances()});
const labels={receivables:'Receivables',payables:'Payables',stock:'Stock report'};
function notice(text,error=false){$('notice').textContent=text;$('notice').className=error?'error':'';$('notice').hidden=!text}
function noticeError(e){notice(e.message||String(e),true)}
function filteredRows(){if(!report)return [];const q=$('search').value.trim().toLowerCase(),f=$('filter').value,company=$('company').value,min=Number($('minimum').value)||0,field=$('sort').value,dir=$('order').value==='asc'?1:-1;
 return report[tab].filter(r=>{
  const value=tab==='stock'?r.packs:r.balance;
  if($('alphabet').value&&!r.name.trim().toUpperCase().startsWith($('alphabet').value))return false;
  if(q&&![r.name,r.code,r.phone,r.company].filter(Boolean).join(' ').toLowerCase().includes(q))return false;
  if(tab==='stock'&&company&&r.company!==company)return false;
  if(f==='positive'&&!(value>0)||f==='negative'&&!(value<0)||f==='zero'&&value!==0)return false;
  if(f==='review'&&!(tab==='stock'?(r.movementDiff!==null&&r.movementDiff!==0)||r.packs===null||(r.packs>0&&r.cost<=0):r.difference!==null&&r.difference!==0))return false;
  if(tab!=='stock'&&Math.abs(value)<min)return false;return true;
 }).sort((a,b)=>{const av=a[field],bv=b[field];if(av===null)return bv===null?0:1;if(bv===null)return -1;return dir*(typeof av==='number'&&typeof bv==='number'?av-bv:String(av??'').localeCompare(String(bv??''),undefined,{numeric:true}));});
}
function columns(){return tab==='stock'?['Item','Company','Packs','Units / pack','Avg cost / pack','Trade / pack','Stored disc. %','Cost value']:['Code',tab==='payables'?'Supplier':'Customer','Balance (Rs)','Last invoice','Check'];}
function cells(r,interactive=true){const name=interactive?`<button class="name-button" data-code="${esc(r.code)}">${esc(r.name)}</button>`:esc(r.name);
 if(tab==='stock')return [`${name}<span class="subtext">${esc(r.code)} · ${esc(r.packing)}</span>`,esc(r.company),fmt(r.packs),fmt(r.packSize,0),fmt(r.cost),fmt(r.trade),fmt(r.discount),fmt(r.value)];
 const badge=r.difference===null?'<span class="badge">Unavailable</span>':r.difference!==0?'<span class="badge review">Review</span>':'<span class="badge">Matched</span>';
 return [esc(r.code),`${name}${r.phone?`<span class="subtext">${esc(r.phone)}</span>`:''}`,`<strong${r.balance<0?' class="negative"':''}>${fmt(r.balance)}</strong>`,date(r.lastDate),badge];
}
function tableHTML(rows,interactive=true){const c=columns();return `<thead><tr>${c.map((h,i)=>`<th class="${tab==='stock'&&i>=2||tab!=='stock'&&i===2?'number':''}">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${cells(r,interactive).map((v,i)=>`<td class="${tab==='stock'&&i>=2||tab!=='stock'&&i===2?'number':''}">${v}</td>`).join('')}</tr>`).join('')}</tbody>`}
function render(){
 $('reportTitle').textContent=labels[tab];$('reportEyebrow').textContent=tab==='stock'?'INVENTORY':tab==='payables'?'SUPPLIER ACCOUNTS':'CUSTOMER ACCOUNTS';
 document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab);b.setAttribute('aria-pressed',String(b.dataset.tab===tab))});
 if(!report)return;
 filtered=filteredRows();const pages=Math.max(1,Math.ceil(filtered.length/perPage));page=Math.min(page,pages);
 $('resultCount').textContent=`${filtered.length.toLocaleString()} of ${report[tab].length.toLocaleString()} ${tab==='stock'?'items':'accounts'}`;
 const total=filtered.reduce((a,r)=>a+(tab==='stock'?r.value||0:r.balance),0);$('filteredTotal').textContent=`Filtered ${tab==='stock'?'cost value':'net balance'}: ${money(total)}`;
 $('reportNote').textContent=tab==='stock'?'Packs = stock units ÷ units per pack. Value uses stored average cost; not discounted again. Tap an item for purchase/sale discounts and raw fields.':`Stored ${tab==='payables'?'supplier':'customer'} balances. Negative amounts are ${tab==='payables'?'supplier advances':'customer credits'}. “Review” means the invoice calculation differs; it does not change the stored balance.`;
 $('empty').hidden=filtered.length>0;$('tableWrap').hidden=!filtered.length;$('pagination').hidden=!filtered.length;
 if(!filtered.length)$('empty').innerHTML='<h3>No matching records</h3><p>Try another search or change the filters.</p>';
 const html=tableHTML(filtered.slice((page-1)*perPage,page*perPage));const temp=document.createElement('table');temp.innerHTML=html;$('tableHead').innerHTML=temp.tHead.innerHTML;$('tableBody').innerHTML=temp.tBodies[0].innerHTML;
 $('pageLabel').textContent=`Page ${page} of ${pages}`;$('prev').disabled=page<=1;$('next').disabled=page>=pages;
 $('exportButton').disabled=!filtered.length;$('printButton').disabled=!filtered.length;
}
function changeTab(next){if(!Object.keys(labels).includes(next))throw Error('Unknown report');tab=next;page=1;$('search').value='';$('alphabet').value='';$('minimum').value='';$('company').value='';$('companyLabel').hidden=tab!=='stock';$('minimumLabel').hidden=tab==='stock';
 $('search').placeholder=tab==='stock'?'Medicine name, code or company':`${tab==='payables'?'Supplier':'Customer'} name, code or phone`;
 $('filter').innerHTML=tab==='stock'?'<option value="positive">In stock only</option><option value="all">All items</option><option value="zero">Out of stock</option><option value="negative">Negative stock</option><option value="review">Needs review</option>':'<option value="positive">Outstanding only</option><option value="all">All accounts</option><option value="negative">'+(tab==='payables'?'Advances only':'Credits only')+'</option><option value="zero">Zero balances</option><option value="review">Needs review</option>';
 $('sort').innerHTML=tab==='stock'?'<option value="value">Cost value</option><option value="packs">Quantity (packs)</option><option value="name">Item name (alphabetical)</option><option value="company">Company</option><option value="trade">Trade price</option><option value="discount">Stored discount</option>':'<option value="balance">Balance amount</option><option value="name">Name (alphabetical)</option><option value="code">Account code</option><option value="lastDate">Last invoice date</option>';$('order').value='desc';render();}
function setReport(next,source){report=next;page=1;const s=report.summary;
 renderBalances();
 $('receivableCount').textContent=`${report.receivables.filter(r=>r.balance>0).length} outstanding · ${report.receivables.length} customers`;
 $('payableCount').textContent=`${report.payables.filter(r=>r.balance>0).length} outstanding · ${report.payables.length} suppliers`;
 $('stockCount').textContent=`${s.inStock} in-stock items · ${s.negativeStock} negative`;
 $('backupMeta').textContent=`${report.filename} · Latest transaction ${date(report.asOf)}`;
 $('company').innerHTML='<option value="">All companies</option>'+[...new Set(report.stock.map(r=>r.company))].sort().map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
 $('clearButton').disabled=busy;$('storageStatus').textContent=source;
 const rc=report.receivables.filter(r=>r.difference!==null&&r.difference!==0).length,pc=report.payables.filter(r=>r.difference!==null&&r.difference!==0).length;
 $('checks').hidden=false;$('checkSummary').textContent=`Report notes · ${rc+pc} account differences · ${s.stockMismatches} stock movement differences`;
 $('checksBody').innerHTML=`<p>Customer credits: <strong>${money(s.customerCredits)}</strong> · Supplier advances: <strong>${money(s.supplierAdvances)}</strong>. Summary cards show positive balances without subtracting credits or advances.</p><p>Receivables use customer records (C); payables use supplier records (S). Both use stored TDBAL balances in MAST.DBF. ${rc} customer and ${pc} supplier balances differ from invoice AMOUNT minus PAID. “Last invoice” is the latest non-cancelled invoice/opening record, not a payment date or due date.</p><p>Stock uses OPSRB: opening + purchases − sales + returns + incoming − outgoing. Divide by ITEM.PKQTY for packs. Value = packs × ITEM.AVERAGE; the summary includes positive stock only. ${s.stockMismatches} items differ when purchase/sales movements are compared with item-level invoice quantities. This is a calculated backup report, not a physical stock count.</p><p>Stored discount displays ITEM.LDISC. Latest purchase and sale discounts come from their individual transaction lines and are available in item details. Fixed discount FDISC is preserved separately; its exact POS behavior is not assumed. Do not apply these discounts again to stored average cost.</p>${report.warnings.length?'<ul>'+report.warnings.map(w=>'<li>'+esc(w)+'</li>').join('')+'</ul>':''}<p>Read ${report.files.length} database tables; skipped ${report.files.reduce((a,f)=>a+f.deleted,0).toLocaleString()} deleted records. Your original ZIP is not modified.</p>`;
 render();}
async function importFile(file){if(busy||!file)return;if(!/\.zip$/i.test(file.name)){notice('Choose the actual .ZIP backup file, not a Google Drive link.',true);return}if(file.size>150*1024*1024){notice('Please choose a ZIP smaller than 150 MB.',true);return}
 busy=true;$('clearButton').disabled=true;$('importButton').disabled=true;notice('Reading your backup…');
 let worker;try{worker=new Worker('/worker.mjs',{type:'module'});const buffer=await file.arrayBuffer();const next=await new Promise((resolve,reject)=>{worker.onmessage=({data})=>{if(data.progress)notice(data.progress);if(data.error)reject(Error(data.error));if(data.report)resolve(data.report)};worker.onerror=()=>reject(Error('The backup reader could not start. Reload the app and try again.'));worker.postMessage({buffer,filename:file.name},[buffer])});
  let saved=true;try{await saveReport(next);try{localStorage.removeItem('pos-business-cleared')}catch{};navigator.storage?.persist?.().catch(()=>{})}catch{saved=false}
  setReport(next,saved?'Latest import saved on this device.':'Loaded for this session only; device storage is unavailable.');notice(saved?'Backup imported. All three reports have been refreshed.':'Reports are ready, but this browser could not save them. Keep the ZIP to import again.',!saved);
 }catch(e){noticeError(e)}finally{worker?.terminate();busy=false;$('clearButton').disabled=!report;$('importButton').disabled=false;$('fileInput').value=''}
}
function showDetails(code){const r=report[tab].find(x=>x.code===code);if(!r)return;$('detailTitle').textContent=r.name;
 const pairs=tab==='stock'?[['Item code',r.code],['Company',r.company],['Quantity (packs)',fmt(r.packs)],['Stock units',fmt(r.units)],['Units per pack',fmt(r.packSize,0)],['Packing',r.packing||'Not recorded'],['Average cost / pack',money(r.cost)],['Trade price / pack',money(r.trade)],['Retail price / pack',money(r.retail)],['Cost value',money(r.value)],['Stored discount (LDISC)',fmt(r.discount)+'%'],['Fixed discount field (FDISC)',fmt(r.fixedDiscount)],['Latest purchase discount',r.purchaseDiscount===null?'Not recorded':fmt(r.purchaseDiscount)+'%'],['Latest sale discount',r.saleDiscount===null?'Not recorded':fmt(r.saleDiscount)+'%'],['Last purchase',date(r.lastPurchase)],['Last sale',date(r.lastSale)],['Movement difference (units)',fmt(r.movementDiff)]]:[['Account code',r.code],['Stored balance',money(r.balance)],['Invoice calculation',r.calculated===null?'Unavailable':money(r.calculated)],['Difference',r.difference===null?'Unavailable':money(r.difference)],['Phone',r.phone||'Not recorded'],['Address',r.address||'Not recorded'],['Last invoice',date(r.lastDate)]];
 $('detailBody').innerHTML='<div class="detail-grid">'+pairs.map(([k,v])=>`<div><small>${esc(k)}</small><strong>${esc(v)}</strong></div>`).join('')+'</div><details><summary>Original backup fields</summary><div class="raw-grid">'+Object.entries({...r.raw,...r.stockFields}).map(([k,v])=>`<div><b>${esc(k)}</b>${esc(v===''?'—':v)}</div>`).join('')+'</div></details>';$('detailDialog').showModal();}
function csvCell(v){let s=String(v??'');if(/^[=+@\-\t\r]/.test(s)&&typeof v!=='number')s="'"+s;return '"'+s.replaceAll('"','""')+'"'}
function exportCSV(){let headers,rows;if(tab==='stock'){headers=['Code','Item','Company','Packing','Packs','Stock units','Units per pack','Average cost','Trade price','Retail price','Stored discount LDISC','FDISC','Latest purchase discount','Latest sale discount','Cost value','Movement difference'];rows=filtered.map(r=>[r.code,r.name,r.company,r.packing,r.packs,r.units,r.packSize,r.cost,r.trade,r.retail,r.discount,r.fixedDiscount,r.purchaseDiscount,r.saleDiscount,r.value,r.movementDiff])}else{headers=['Code','Name','Balance Rs','Phone','Address','Last invoice','Invoice calculation','Difference'];rows=filtered.map(r=>[r.code,r.name,r.balance,r.phone,r.address,date(r.lastDate),r.calculated,r.difference])}const blob=new Blob(['\ufeff'+[headers,...rows].map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`POS_Reports_${tab}_${report.asOf}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),10000)}
function printReport(){$('printArea').innerHTML=`<h1>POS Reports for Your Business · ${labels[tab]}</h1><p>${esc(report.filename)} · Latest transaction ${date(report.asOf)} · ${filtered.length} filtered records</p><p>${esc($('filteredTotal').textContent)}</p><p>${esc($('reportNote').textContent)}</p><table>${tableHTML(filtered,false)}</table>`;window.print()}
$('importButton').onclick=$('emptyImport').onclick=()=>$('fileInput').click();$('fileInput').onchange=e=>importFile(e.target.files[0]);document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>changeTab(b.dataset.tab));for(const id of ['search','filter','sort','order','company','minimum','alphabet'])$(id).addEventListener(id==='search'||id==='minimum'?'input':'change',()=>{page=1;render()});$('prev').onclick=()=>{page--;render()};$('next').onclick=()=>{page++;render()};$('tableBody').onclick=e=>{const b=e.target.closest('[data-code]');if(b)showDetails(b.dataset.code)};$('exportButton').onclick=exportCSV;$('printButton').onclick=printReport;$('helpButton').onclick=()=>$('helpDialog').showModal();document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());$('clearButton').onclick=async()=>{
 if(busy||!report)return;
 if(!confirm('Clear all imported data? Receivables, payables, stock and the saved backup will be removed from this browser. Your original ZIP file stays unchanged.'))return;
 busy=true;$('clearButton').disabled=true;$('importButton').disabled=true;
 try{
  await clearSaved();
  if('caches' in window)await caches.delete('pos-business-incoming');
  try{localStorage.removeItem('pos-business-cleared')}catch{}
  report=null;filtered=[];balancesVisible=false;
  $('tableHead').innerHTML='';$('tableBody').innerHTML='';$('printArea').innerHTML='';$('detailBody').innerHTML='';$('checksBody').innerHTML='';
  const target=new URL(location.href);target.searchParams.delete('shared');target.hash='';
  location.replace(target.href);
 }catch(e){noticeError(Error('Could not finish clearing saved data. Please try Clear all data again.'));busy=false;$('clearButton').disabled=!report;$('importButton').disabled=false}
};

const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
function updateInstallButton(){$('installButton').textContent=standalone()?'App installed':'Install app'}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;updateInstallButton()});
window.addEventListener('appinstalled',()=>{installPrompt=null;updateInstallButton()});
$('installButton').onclick=async()=>{
 if(installPrompt){try{const prompt=installPrompt;await prompt.prompt();await prompt.userChoice;installPrompt=null;updateInstallButton();return}catch{installPrompt=null}}
 $('installStatus').textContent=standalone()?'You are already using the installed app.':'If no install prompt appears, open the link directly in Chrome and use its menu.';
 $('installDialog').showModal();
};
updateInstallButton();
window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>{e.preventDefault();importFile(e.dataTransfer.files[0])});
async function takeShared(){if(!new URL(location.href).searchParams.has('shared'))return false;try{const cache=await caches.open('pos-business-incoming');const response=await cache.match('/incoming-backup');if(!response){notice('No ZIP file was received. Use Import backup ZIP to select the file.',true);return false}const name=response.headers.get('X-Filename')||'Shared-backup.zip';const file=new File([await response.blob()],decodeURIComponent(name),{type:'application/zip'});await importFile(file);await cache.delete('/incoming-backup');history.replaceState(null,'','/');return true}catch(e){noticeError(e);return false}}
async function init(){
 if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
 let saved;try{saved=await getSaved()}catch{notice('Device storage is unavailable; imports will last for this session only.',true)}
 if(saved?.schema===1)setReport(saved,'Latest backup saved on this device · Reloading keeps your data.');
 await takeShared();
}

init();
const ctx = document.modelContext;
if (ctx?.registerTool) {
 const tool = {
  name: 'filter_pos_report',
  description: 'Select and filter the visible report without modifying POS data.',
  inputSchema: {type:'object',properties:{report:{type:'string',enum:['receivables','payables','stock']},search:{type:'string'},order:{type:'string',enum:['asc','desc']}},required:['report'],additionalProperties:false},
  annotations: {readOnlyHint:false,untrustedContentHint:true},
  execute(input) {
   if (!input || !Object.keys(labels).includes(input.report) || (input.search!==undefined && typeof input.search!=='string') || (input.order!==undefined && !['asc','desc'].includes(input.order))) throw Error('Invalid report filter');
   if (!report) throw Error('Import a backup first');
   changeTab(input.report);
   if(input.search!==undefined) $('search').value=input.search;
   if(input.order) $('order').value=input.order;
   render();
   return {report:tab,count:filtered.length,backup:report.filename,firstRows:filtered.slice(0,5).map(r=>({name:r.name,balance:r.balance,packs:r.packs,value:r.value}))};
  }
 };
 try { Promise.resolve(ctx.registerTool(tool)).catch(()=>{}); } catch {}
}

function sortByName(order){$('sort').value='name';$('order').value=order;page=1;updateOrderLabels();render()}
function updateOrderLabels(){const alpha=['name','company','code'].includes($('sort').value);$('order').options[0].textContent=alpha?'Z–A':'Highest first';$('order').options[1].textContent=alpha?'A–Z':'Lowest first'}
$('nameAsc').onclick=()=>sortByName('asc');$('nameDesc').onclick=()=>sortByName('desc');
$('sort').addEventListener('change',()=>{if($('sort').value==='name')$('order').value='asc';updateOrderLabels();page=1;render()});
updateOrderLabels();
