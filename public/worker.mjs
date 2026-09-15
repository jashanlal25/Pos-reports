import {unzipBackup,makeReport} from './parser.mjs';
self.onmessage=async({data})=>{try{const tables=await unzipBackup(data.buffer,message=>self.postMessage({progress:message}));self.postMessage({report:makeReport(tables,data.filename)})}catch(e){self.postMessage({error:e.message||'Unable to read this backup.'})}};
