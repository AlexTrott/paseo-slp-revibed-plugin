import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readCatalog } from '../../plugin/server/runtime/cli/routing.ts';
export function selectionFixture(t, { count = 2 } = {}) {
 const dir=mkdtempSync(join(tmpdir(),'slp-seat-selection-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true,maxRetries:3}));
 const repository=join(dir,'repo'),home=join(dir,'home');
 mkdirSync(join(repository,'.paseo-slp'),{recursive:true});mkdirSync(join(home,'slp-runtime/state'),{recursive:true});
 const options=Array.from({length:count},(_,i)=>({id:i===0?'first':i===1?'second':'option-'+i,provider:'codex',
  model:'model/variant',roles:['peer'],enabled:true,availability:'ready',modeId:'full-access',thinkingOptionId:'high',
  features:{fast_mode:true},suitableFor:['coding'],avoidFor:[],notes:'fixture'}));
 const catalog={version:1,policy:'Fixture pool',quotaFallback:{enabled:false,optionId:null},options};
 const poolPath=join(repository,'.paseo-slp/slp-routing.json');
 const savePool=()=>writeFileSync(poolPath,JSON.stringify(catalog));savePool();
 const request={repository,assignment:'Read the bounded code and report evidence.',paseoHome:home};
 const providers=[{id:'slp-codex-peer',enabled:true,status:'available'}];
 const phases=[];
 const deps={providers,phase:(name,value)=>phases.push({name,value})};
 return {dir,repository,home,poolPath,catalog,options,savePool,request,providers,phases,deps,
  sha:()=>readCatalog(repository,home).sha256};
}
