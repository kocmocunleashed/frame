import { z } from 'zod';
import { erxesConfig } from './erxes-config';
import { storageConfig } from './storage';
export function configuration(role: 'api'|'worker'|'dispatcher'|'maintenance'='api'){
 const env=z.object({NODE_ENV:z.enum(['development','test','production']).default('development'),PORT:z.coerce.number().int().min(1).max(65535).default(3158),APP_ORIGIN:z.url(),MONGODB_URI:z.string().regex(/^mongodb(\+srv)?:\/\//),MONGODB_DATABASE:z.string().regex(/^[a-zA-Z0-9_-]{1,63}$/),FRAME_QUEUE_DRIVER:z.enum(['local','sqs']),FRAME_JOB_TIMEOUT_MS:z.coerce.number().int().min(1000).max(600000).default(270000)}).parse(process.env);
 const production=env.NODE_ENV==='production';const erxes=role==='api'?erxesConfig():null;storageConfig();
 if(production){if(!env.APP_ORIGIN.startsWith('https://'))throw new Error('Production APP_ORIGIN requires HTTPS.');if(env.FRAME_QUEUE_DRIVER!=='sqs'||!process.env.FRAME_SQS_QUEUE_URL||!process.env.AWS_REGION)throw new Error('Production requires SQS and AWS_REGION.');if(process.env.FRAME_FIXTURE_MODE||process.env.FRAME_TEST_MONGODB_URI)throw new Error('Fixture mode cannot run in production.');if(role==='api'&&!erxes&&!process.env.CLERK_SECRET_KEY)throw new Error('Configure Clerk or erxes authentication.');if(!env.MONGODB_URI.startsWith('mongodb+srv:')&&!/[?&](tls|ssl)=true/.test(env.MONGODB_URI))throw new Error('Production MongoDB requires TLS.');}
 return env;
}
