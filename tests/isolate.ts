import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
for(const name of Object.keys(process.env))if(/^(GOOGLE_|GITHUB_|RESEND_|AUTH_EMAIL_FROM|AWS_|OPENAI_|OPENROUTER_|TOKENROUTER_|FRAME_S3_|FRAME_ADMIN_|FRAME_BACKUP_KEY|BLOB_|VERCEL|DATABASE_URL)/.test(name))delete process.env[name];
const root=mkdtempSync(join(tmpdir(),'frame-test-'));
Object.assign(process.env,{NODE_ENV:'test',DATABASE_URL:process.env.FRAME_TEST_DATABASE_URL||'',FRAME_STORAGE:'local',FRAME_QUEUE_DRIVER:'local',BETTER_AUTH_SECRET:'test-only-auth-secret-at-least-32-characters',FRAME_ASSETS:join(root,'assets'),FRAME_EXPORTS:join(root,'exports'),FRAME_STAGING:join(root,'staging')});
process.once('exit',()=>rmSync(root,{recursive:true,force:true}));
