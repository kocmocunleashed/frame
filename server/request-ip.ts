import {isIP} from 'node:net';
export function requestIP(request:Request,env:unknown):string{
 // Enabled only on the CloudFront-only ALB deployment. CloudFront sets this header.
 if(process.env.FRAME_TRUST_PROXY==='cloudfront'){
  const value=request.headers.get('cloudfront-viewer-address')||'';
  const ip=value.startsWith('[')?value.slice(1,value.indexOf(']')):value.slice(0,value.lastIndexOf(':'));
  if(isIP(ip))return ip;
 }
 return (env as {requestIP?:(request:Request)=>{address:string}|null}|undefined)?.requestIP?.(request)?.address||'local';
}
