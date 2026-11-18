const {parentPort,workerData}=require('node:worker_threads');
(async()=>{
 try{
  const parse=require('pdf-parse');
  const buffer=Buffer.from(workerData);
  const result=await parse(buffer);
  parentPort.postMessage({ok:true,pages:result.numpages,text:result.text});
 }catch(error){
  parentPort.postMessage({ok:false,error:'PDF parsing failed.'});
 }
})();
