import { uid } from '../shared/schema';
import type { Store } from './store';
import { SqsTransport,type Wake } from './queue/transport';
export async function dispatchReady(store:Store,publish?:(message:Wake)=>Promise<unknown>,now=Date.now()){
 const transport=!publish?new SqsTransport():null;const send=publish||((message:Wake)=>transport!.publish(message));const owner=uid();let count=0;
 try{for(let i=0;i<20;i++){const event=await store.db.atomic('outbox',{sentAt:null,availableAt:{$lte:now},$or:[{leaseUntil:null},{leaseUntil:{$lte:now}}]},{$set:{leaseOwner:owner,leaseUntil:now+30000},$inc:{attempts:1}},{sort:{availableAt:1,_id:1}});if(!event)break;
  try{await send({jobId:event.jobId,dispatchGeneration:event.dispatchGeneration});await store.db.update('outbox',{id:event.id,leaseOwner:owner,leaseUntil:{$gt:Date.now()}},{$set:{sentAt:new Date().toISOString(),leaseOwner:null,leaseUntil:null}});count++;}
  catch(error){await store.db.update('outbox',{id:event.id,leaseOwner:owner},{$set:{leaseOwner:null,leaseUntil:null,availableAt:Date.now()+Math.min(60000,1000*2**Math.min(event.attempts,6))}});throw error;}
 }}finally{transport?.close();}return count;
}
