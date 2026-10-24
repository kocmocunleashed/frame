import { serveStatic } from 'hono/bun';
import { createApp } from './app';import { Store } from './store';import { configuration } from './config';
const config=configuration(),store=new Store(),app=createApp(store);
app.use('/assets/*',serveStatic({root:'./dist'}));
app.get('*',async c=>{if(c.req.path.startsWith('/api/')||c.req.path.startsWith('/integrations/'))return c.json({error:'Endpoint not found.',code:'NOT_FOUND'},404);c.header('Cache-Control','private, no-store');c.header('Referrer-Policy','no-referrer');return c.html(await Bun.file('./dist/index.html').text());});
const server=Bun.serve({port:config.PORT,hostname:process.env.HOST||'0.0.0.0',fetch:(request,server)=>app.fetch(request,{requestIP:(req:Request)=>server.requestIP(req)}),maxRequestBodySize:52*1024*1024});
console.log(JSON.stringify({event:'api_started',port:config.PORT,release:process.env.FRAME_RELEASE_ID||'local'}));
for(const signal of ['SIGTERM','SIGINT'] as const)process.once(signal,async()=>{await server.stop();await store.db.close();process.exit(0);});
