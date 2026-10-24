import type {Store} from './store';
import {MIGRATION_VERSION} from './repositories/indexes';
import {objectStorage} from './storage';
import {SqsTransport} from './queue/transport';
const cache=new WeakMap<Store,{until:number;value:Promise<{ok:boolean;components:Record<string,string>}>}>();
export function readiness(store:Store){
 const prior=cache.get(store);if(prior&&prior.until>Date.now())return prior.value;
 const value=(async()=>{const components:Record<string,string>={database:'unavailable',indexes:'unavailable',storage:'unavailable',queue:'unavailable'};
  try{await store.db.ping();components.database='ready';const migration=await store.db.one('schemaMigrations',{id:String(MIGRATION_VERSION)});if(!migration)throw new Error();components.indexes='ready';await objectStorage().probe();components.storage='ready';if(process.env.FRAME_QUEUE_DRIVER==='sqs'){const transport=new SqsTransport();try{await transport.probe();}finally{transport.close();}}else if(process.env.NODE_ENV==='production'||process.env.FRAME_QUEUE_DRIVER!=='local')throw new Error();components.queue='ready';return {ok:true,components};}catch{return {ok:false,components};}
 })();cache.set(store,{until:Date.now()+5000,value});return value;
}

export function clearReadinessCache(store:Store){cache.delete(store);}
