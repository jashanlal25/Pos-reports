const decoder = new TextDecoder('windows-1252');
const wanted = new Set(['MAST.DBF','ITEM.DBF','OPSRB.DBF','SAL1.DBF','COPEN.DBF','PUR1.DBF','SOPEN.DBF','SAL2.DBF','PUR2.DBF']);
const round = x => Math.round((x + Number.EPSILON) * 100) / 100;
const num = x => Number(x || 0);
const sum = (rows,fn) => round(rows.reduce((a,r)=>a+fn(r),0));
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0}
export async function unzipBackup(buffer,onProgress=()=>{}) {
 if(buffer.byteLength>150*1024*1024)throw Error('Please use a ZIP smaller than 150 MB.');
 const v=new DataView(buffer),bytes=new Uint8Array(buffer);let e=-1;
 for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)if(v.getUint32(p,true)===0x06054b50){e=p;break}
 if(e<0)throw Error('This is not a supported ZIP file. Please choose your original POS backup ZIP.');
 if(v.getUint16(e+4,true)||v.getUint16(e+6,true))throw Error('Multi-part ZIP backups are not supported.');
 const count=v.getUint16(e+10,true);let pos=v.getUint32(e+16,true),total=0;const result={};
 if(count===65535||pos===0xffffffff)throw Error('ZIP64 backups are not supported.');
 for(let i=0;i<count;i++){
  if(pos+46>bytes.length||v.getUint32(pos,true)!==0x02014b50)throw Error('The ZIP directory is damaged.');
  const flags=v.getUint16(pos+8,true),method=v.getUint16(pos+10,true),crc=v.getUint32(pos+16,true),packed=v.getUint32(pos+20,true),size=v.getUint32(pos+24,true),nl=v.getUint16(pos+28,true),xl=v.getUint16(pos+30,true),cl=v.getUint16(pos+32,true),offset=v.getUint32(pos+42,true);
  const full=decoder.decode(bytes.subarray(pos+46,pos+46+nl));pos+=46+nl+xl+cl;
  const name=full.split(/[\\/]/).pop().toUpperCase();if(!wanted.has(name))continue;
  if(result[name])throw Error('More than one '+name+' was found. Choose a ZIP containing one backup only.');
  if(flags&1)throw Error('Password-protected backups are not supported.');
  total+=size;if(size>80*1024*1024||total>250*1024*1024)throw Error('The extracted database is too large for this reader.');
  if(offset+30>bytes.length||v.getUint32(offset,true)!==0x04034b50)throw Error(name+': invalid ZIP entry.');
  const start=offset+30+v.getUint16(offset+26,true)+v.getUint16(offset+28,true);if(start+packed>bytes.length)throw Error(name+': incomplete data.');
  onProgress('Reading '+name);
  let data;
  if(method===0)data=bytes.slice(start,start+packed);
  else if(method===8){
   let ds;try{ds=new DecompressionStream('deflate-raw')}catch{throw Error('Please open this app in an updated Chrome, Edge, Firefox or Safari browser to read ZIP backups.')}
   const reader=new Blob([bytes.slice(start,start+packed)]).stream().pipeThrough(ds).getReader();const chunks=[];let length=0;
   for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>size){await reader.cancel();throw Error(name+': invalid extracted size.')}chunks.push(value)}
   data=new Uint8Array(length);let at=0;for(const c of chunks){data.set(c,at);at+=c.length}
  }else throw Error('This ZIP compression method is unsupported. Use a standard ZIP backup.');
  if(data.length!==size||crc32(data)!==crc)throw Error(name+': data integrity check failed. Please export a fresh backup.');
  result[name]=parseDBF(data,name);
 }
 for(const name of ['MAST.DBF','ITEM.DBF','OPSRB.DBF'])if(!result[name])throw Error('Missing '+name+'. Choose the complete POS backup ZIP.');
 return result;
}
export function parseDBF(bytes,name='DBF'){
 if(bytes.length<33)throw Error(name+': incomplete database header.');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=v.getUint32(4,true),header=v.getUint16(8,true),length=v.getUint16(10,true);
 if(header<33||length<1||header+n*length>bytes.length)throw Error(name+': incomplete database records.');
 const fields=[];let width=1;
 for(let p=32;p<header-1;p+=32){if(bytes[p]===13)break;if(p+32>header)throw Error(name+': malformed field.');const field=decoder.decode(bytes.subarray(p,p+11)).split('\0')[0],type=String.fromCharCode(bytes[p+11]),size=bytes[p+16];fields.push({field,type,size,offset:width});width+=size}
 if(width!==length)throw Error(name+': unsupported record layout.');
 const rows=[];let deleted=0;
 for(let i=0;i<n;i++){
  const p=header+i*length;if(bytes[p]===42){deleted++;continue}if(bytes[p]!==32)throw Error(name+': invalid record marker.');
  const row={};for(const f of fields){let value=decoder.decode(bytes.subarray(p+f.offset,p+f.offset+f.size)).replace(/\0/g,'').trim();if(f.type==='N'||f.type==='F'){if(value&&!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value))throw Error(name+': invalid number in '+f.field);value=Number(value||0)}else if(!['C','D','L','M'].includes(f.type))throw Error(name+': unsupported field type '+f.type);row[f.field]=value}rows.push(row)
 }
 return {rows,fields:fields.map(f=>f.field),deleted,headerDate:`${1900+bytes[1]}-${String(bytes[2]).padStart(2,'0')}-${String(bytes[3]).padStart(2,'0')}`};
}
function requireFields(tables,file,fields){const t=tables[file];if(!t)return;for(const f of fields)if(!t.fields.includes(f))throw Error(file+' is missing '+f+'. This backup uses a different POS format.')}
export function makeReport(tables,filename='Backup.zip'){
 requireFields(tables,'MAST.DBF',['MODE','CODE','NAME','TDBAL']);requireFields(tables,'ITEM.DBF',['CODE','NAME','PKQTY','AVERAGE','TRP1','LDISC']);requireFields(tables,'OPSRB.DBF',['CODE','OQTY','PQTY','SQTY','RQTY','IN','OUT']);
 const get=f=>tables[f]?.rows||[],master=get('MAST.DBF'),warnings=[];
 const companies=Object.fromEntries(master.filter(r=>r.MODE==='P').map(r=>[r.CODE,r.NAME]));
 function accounts(mode,files,key){
  const checkAvailable=files.every(f=>tables[f]);if(!checkAvailable)warnings.push((mode==='C'?'Customer':'Supplier')+' invoice checks unavailable: supporting invoice tables missing.');
  const balances=new Map(),dates=new Map();
  for(const f of files){requireFields(tables,f,[key,'AMOUNT','PAID','CAN','IDATE']);for(const r of get(f)){if(r.CAN)continue;balances.set(r[key],(balances.get(r[key])||0)+num(r.AMOUNT)-num(r.PAID));if(/^\d{8}$/.test(r.IDATE))dates.set(r[key],[dates.get(r[key])||'',r.IDATE].sort().pop())}}
  const seen=new Set();return master.filter(r=>r.MODE===mode).map(r=>{
   if(seen.has(r.CODE))throw Error('Duplicate account code '+r.CODE+' in '+mode+' accounts.');seen.add(r.CODE);
   const calculated=checkAvailable?round(balances.get(r.CODE)||0):null;
   return {code:r.CODE,name:r.NAME,balance:round(num(r.TDBAL)),phone:[r.PH1,r.PH2].filter(Boolean).join(' / '),address:[r.ADD1,r.ADD2,r.ADD3].filter(Boolean).join(', '),lastDate:dates.get(r.CODE)||'',calculated,difference:calculated===null?null:round(num(r.TDBAL)-calculated),raw:r};
  });
 }
 const receivables=accounts('C',['SAL1.DBF','COPEN.DBF'],'CCODE'),payables=accounts('S',['PUR1.DBF','SOPEN.DBF'],'SCODE');
 const ops=new Map();for(const r of get('OPSRB.DBF')){const a=ops.get(r.CODE)||{OQTY:0,PQTY:0,SQTY:0,RQTY:0,IN:0,OUT:0};for(const f of Object.keys(a))a[f]+=num(r[f]);ops.set(r.CODE,a)}
 const movements={purchase:new Map(),sale:new Map()},latest={purchase:new Map(),sale:new Map()};
 for(const [kind,file] of [['purchase','PUR2.DBF'],['sale','SAL2.DBF']]){
  requireFields(tables,file,['ICODE','FULL','PCS','BFULL','BPCS','CAN','IDATE','DISC']);
  for(const r of get(file)){if(r.CAN)continue;let a=movements[kind].get(r.ICODE)||{full:0,pieces:0};a.full+=num(r.FULL)+num(r.BFULL);a.pieces+=num(r.PCS)+num(r.BPCS);movements[kind].set(r.ICODE,a);if(!latest[kind].has(r.ICODE)||r.IDATE>=latest[kind].get(r.ICODE).IDATE)latest[kind].set(r.ICODE,r)}
 }
 const stock=[];const seen=new Set();
 for(const r of get('ITEM.DBF')){
  if(seen.has(r.CODE))throw Error('Duplicate item code '+r.CODE);seen.add(r.CODE);
  const o=ops.get(r.CODE),packSize=num(r.PKQTY),valid=packSize>0,units=o?o.OQTY+o.PQTY-o.SQTY+o.RQTY+o.IN-o.OUT:null,packs=units!==null&&valid?units/packSize:null;
  const p=movements.purchase.get(r.CODE)||{full:0,pieces:0},s=movements.sale.get(r.CODE)||{full:0,pieces:0};
  const movementDiff=o&&valid&&tables['PUR2.DBF']&&tables['SAL2.DBF']?round((o.PQTY-o.SQTY)-((p.full-s.full)*packSize+p.pieces-s.pieces)):null;
  const lp=latest.purchase.get(r.CODE),ls=latest.sale.get(r.CODE);
  stock.push({code:r.CODE,name:r.NAME,company:companies[r.CMCODE]||r.CMCODE||'Unspecified',packing:r.PKNG||'',packSize,units:units===null?null:round(units),packs:packs===null?null:round(packs),cost:round(num(r.AVERAGE)),trade:round(num(r.TRP1)),retail:round(num(r.RETAIL)),discount:num(r.LDISC),fixedDiscount:num(r.FDISC),purchaseDiscount:lp?num(lp.DISC):null,saleDiscount:ls?num(ls.DISC):null,lastPurchase:lp?.IDATE||'',lastSale:ls?.IDATE||'',value:packs===null?null:round(packs*num(r.AVERAGE)),tradeValue:packs===null?null:round(packs*num(r.TRP1)),movementDiff,raw:r,stockFields:o||null});
 }
 const missing=stock.filter(r=>r.units===null||r.packs===null).length;if(missing)warnings.push(missing+' items have missing stock records or invalid pack sizes; their quantities/values are unavailable.');
 const missingCost=stock.filter(r=>r.packs>0&&r.cost<=0).length;if(missingCost)warnings.push(missingCost+' in-stock items have no positive average cost; their cost valuation is incomplete.');
 const unknown=[...ops.keys()].filter(k=>!seen.has(k));if(unknown.length)warnings.push(unknown.length+' stock codes have no matching item record and are excluded.');
 const adjustments=get('OPSRB.DBF').filter(r=>num(r.RQTY)||num(r.OLDQTY)||num(r.NEWQTY)||num(r.IN)||num(r.OUT)||num(r.OQTY)).length;
 if(adjustments)warnings.push(adjustments+' stock records contain opening/return/adjustment fields. Their direction must be verified in the POS before relying on calculated stock.');
 if(!tables['PUR2.DBF']||!tables['SAL2.DBF'])warnings.push('Stock movement checks unavailable: purchase or sales item records missing.');
 const dates=[...get('SAL1.DBF'),...get('PUR1.DBF')].filter(r=>!r.CAN&&/^\d{8}$/.test(r.IDATE)).map(r=>r.IDATE).sort();
 return {schema:1,filename,asOf:dates.at(-1)||tables['MAST.DBF'].headerDate.replaceAll('-',''),importedAt:new Date().toISOString(),receivables,payables,stock,warnings,files:Object.entries(tables).map(([name,t])=>({name,records:t.rows.length,deleted:t.deleted})),summary:{receivable:sum(receivables,r=>Math.max(r.balance,0)),customerCredits:sum(receivables,r=>Math.max(-r.balance,0)),payable:sum(payables,r=>Math.max(r.balance,0)),supplierAdvances:sum(payables,r=>Math.max(-r.balance,0)),stockCost:sum(stock,r=>r.packs>0?r.value:0),stockTrade:sum(stock,r=>r.packs>0?r.tradeValue:0),inStock:stock.filter(r=>r.packs>0).length,negativeStock:stock.filter(r=>r.packs<0).length,stockMismatches:stock.filter(r=>r.movementDiff!==null&&r.movementDiff!==0).length}};
}
