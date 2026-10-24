import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
for(const name of Object.keys(process.env))if(/^(AWS_|OPENAI_|OPENROUTER_|TOKENROUTER_|CLERK_|FRAME_ERXES_|FRAME_S3_|FRAME_ADMIN_|FRAME_BACKUP_KEY|BLOB_|VERCEL|DATABASE_URL)/.test(name))delete process.env[name];
const root=mkdtempSync(join(tmpdir(),'frame-test-'));
Object.assign(process.env,{NODE_ENV:'test',MONGODB_URI:process.env.FRAME_TEST_MONGODB_URI||'',FRAME_STORAGE:'local',FRAME_QUEUE_DRIVER:'local',FRAME_ASSETS:join(root,'assets'),FRAME_EXPORTS:join(root,'exports'),FRAME_STAGING:join(root,'staging')});
process.once('exit',()=>rmSync(root,{recursive:true,force:true}));
