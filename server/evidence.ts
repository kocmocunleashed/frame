import {JobFailure} from './jobs';
/** Select an actual bounded source passage; never turn a model-written URL into evidence. */
export function supportingExcerpt(text:string,claim:string,quote?:string|null){
 if(quote?.trim()){
  if(!text.includes(quote))throw new JobFailure('A generated quotation did not match the included source. Nothing was applied.');
  return quote.slice(0,1600);
 }
 const words=new Set(claim.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[]);
 const passages=text.match(/[^\n.!?]+[.!?]?/gu)||[text];let best='',score=-1;
 for(const passage of passages){const clean=passage.trim();if(!clean)continue;const terms=new Set(clean.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[]);const match=[...words].filter(w=>terms.has(w)).length;if(match>score){score=match;best=clean;}}
 return best.slice(0,1600);
}
