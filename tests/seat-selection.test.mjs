import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { preflightPeerChoice, selectPeerSeat, revalidatePeerSelection } from '../plugin/server/runtime/cli/seat-selection.ts';
import { routeChoices, catalogBinding } from '../plugin/server/runtime/cli/routing.ts';
import { selectionFixture } from './helpers/seat-selection-fixture.mjs';
{
 test('multiple options need a choice and never take-first',async t=>{
  const f=selectionFixture(t);const choice=await preflightPeerChoice(f.request);
  assert.equal(choice.state,'selection-required');assert.equal(choice.operationAdmitted,false);
  assert.deepEqual(choice.choices.map(c=>c.optionId),['first','second']);
  await assert.rejects(selectPeerSeat(f.request,f.deps),/multiple eligible/);
  assert.deepEqual(f.phases,[]);
  const selected=await selectPeerSeat({...f.request,selection:{optionId:'second'}},f.deps);
  assert.equal(selected.route.optionId,'second');assert.equal(selected.origin,'lead');
  assert.equal(selected.route.catalogSha256,f.sha());
 });
 test('sole eligible option pins complete settings',async t=>{
  const f=selectionFixture(t);f.options[0].enabled=false;f.savePool();
  assert.equal(await preflightPeerChoice(f.request),null);
  const selected=await selectPeerSeat(f.request,f.deps);
  assert.equal(selected.origin,'unique');assert.equal(selected.route.optionId,'second');
  const bundle=revalidatePeerSelection(f.request,selected,f.providers);
  assert.deepEqual(bundle.binding,{provider:'slp-codex-peer',model:'model/variant',modeId:'full-access',thinkingOptionId:'high',features:{fast_mode:true}});
  
 });
}
test('empty repository pool does not fall back to the user pool',async t=>{
 const f=selectionFixture(t,{count:0});writeFileSync(join(f.home,'slp-runtime/state/peer-pool.json'),JSON.stringify({schemaVersion:1,options:[]}));
 await assert.rejects(preflightPeerChoice(f.request),/no eligible/);
});
test('choice preflight reports omitted candidates and bounds bytes without inventing a selection',async t=>{
 const f=selectionFixture(t,{count:40});const choice=await preflightPeerChoice(f.request);
 assert.equal(choice.choices.length,32);assert.equal(choice.omittedCount,8);assert.ok(Buffer.byteLength(JSON.stringify(choice))<=32768);
 f.options.forEach(o=>{o.suitableFor=['x'.repeat(40000)];});f.savePool();
 await assert.rejects(preflightPeerChoice(f.request),error=>error.code==='REQUEST_TOO_LARGE');
});
test('a pool edit between selection and revalidation stops the dependent formation',async t=>{
 const f=selectionFixture(t);const selected=await selectPeerSeat({...f.request,selection:{optionId:'second'}},f.deps);
 f.options[0].notes='drift';f.savePool();
 assert.throws(()=>revalidatePeerSelection(f.request,selected,f.providers),error=>error.code==='ROUTE_DRIFT');
});
{
 test('v2 rejects ambiguous/ineligible pairs before phases', async t => {
  const f=selectionFixture(t,{count:1});
  f.catalog.version=2;
  Object.assign(f.options[0],{displayName:'Fixture',description:'Bounded coding',effortPolicy:{kind:'select'},runtimeRule:'none'});
  delete f.options[0].thinkingOptionId;
  f.providers[0].models=[{id:'model/variant',thinkingOptions:[{id:'low'},{id:'high'}]}];f.savePool();
  for (const [selection,reason] of [
   [{optionId:'first'},'effort-required'],
   [{optionId:'first',thinkingOptionId:'unsupported'},'pair-ineligible'],
   [{optionId:'missing'},'pair-ineligible'],
  ]) {
   const req={...f.request,selection};
   const verify=error=>{assert.equal(error.code,'INVALID_RECORD');assert.equal(error.reason,reason);if(reason==='effort-required')assert.deepEqual(error.eligibleEfforts,['low','high']);return true;};
   await assert.rejects(preflightPeerChoice(req,f.providers),verify);
   await assert.rejects(selectPeerSeat(req,f.deps),verify);
   assert.deepEqual(f.phases,[]);
  }
  const pair={...f.request,selection:{optionId:'first',thinkingOptionId:'low'}};
  assert.equal(await preflightPeerChoice(pair,f.providers),null);
  assert.equal((await selectPeerSeat(pair,f.deps)).route.thinkingOptionId,'low');
  f.catalog.options[0].effortPolicy={kind:'fixed',thinkingOptionId:'high'};f.savePool();
  const sole={...f.request,selection:{optionId:'first'}};
  assert.equal(await preflightPeerChoice(sole,f.providers),null);
  assert.equal((await selectPeerSeat(sole,f.deps)).route.thinkingOptionId,'high');
 });
}

{
 for (const failure of ['disabled-pool','missing-model','no-allowed-effort','selected-disabled','selected-missing-model','same-provider']) {
  test('v2 '+failure+' classifies empty selected pairs without changing offline errors',async t=>{
   const f=selectionFixture(t,{count:2});f.catalog.version=2;
   for(const option of f.options){
    Object.assign(option,{displayName:'Fixture',description:'Bounded coding',effortPolicy:{kind:'select'},runtimeRule:'none'});
    delete option.thinkingOptionId;
   }
   f.providers[0].models=[{id:'model/variant',thinkingOptions:[{id:'low'},{id:'high'}]}];
   if(failure==='disabled-pool')f.options.forEach(o=>o.enabled=false);
   if(failure==='missing-model')f.providers[0].models=[];
   if(failure==='no-allowed-effort')f.options.forEach(o=>o.effortPolicy.allowed=['medium']);
   if(failure==='selected-disabled')f.options[0].enabled=false;
   if(failure==='selected-missing-model')f.options[0].model='PRIVATE_MISSING_MODEL';
   if(failure==='same-provider')f.request.routingContext={crossProvider:true,reference:{provider:'slp-codex-peer',model:'writer'}};
   f.savePool();
   for(const selection of failure.startsWith('selected-')?[{optionId:'first'}]:[undefined,{optionId:'first'}]){
    const req={...f.request,...(selection?{selection}:{})};
    const verify=e=>{assert.equal(e.name,'SeatSelectionError');assert.equal(e.code,'INVALID_RECORD');assert.equal(e.reason,'no-eligible-pairs');return true;};
    await assert.rejects(preflightPeerChoice(req,f.providers),verify);
    await assert.rejects(selectPeerSeat(req,f.deps),verify);
    assert.deepEqual(f.phases,[]);
   }
   if(!failure.startsWith('selected-')){
    assert.throws(()=>routeChoices({...f.request,providers:f.providers}),e=>e.name==='Error'&&/No eligible preset/.test(e.message));
    assert.throws(()=>catalogBinding(f.repository,'peer',f.providers,{optionId:'first',catalogSha256:f.sha(),selectionSha256:'0'.repeat(64),thinkingOptionId:'low',routingContext:f.request.routingContext},f.home),e=>e.name==='Error'&&/No eligible preset/.test(e.message));
   }
  });
 }
}

test('ambiguous effort metadata exposes only a bounded subset of public IDs for the requested option',async t=>{
 const f=selectionFixture(t,{count:2});f.catalog.version=2;
 for(const option of f.options){Object.assign(option,{displayName:'PRIVATE_LABEL',description:'PRIVATE_DESCRIPTION',effortPolicy:{kind:'select'},runtimeRule:'none'});delete option.thinkingOptionId;}
 f.options[1].model='other';
 const efforts=['a'.repeat(200),'b'.repeat(200)];
 f.providers[0].models=[{id:'model/variant',thinkingOptions:efforts.map(id=>({id,metadata:{kind:'effort'}}))},{id:'other',thinkingOptions:[{id:'PRIVATE_OTHER_EFFORT',metadata:{kind:'effort'}}]}];f.savePool();
 const req={...f.request,selection:{optionId:'first'}};
 await assert.rejects(preflightPeerChoice(req,f.providers),e=>{
  assert.equal(e.reason,'effort-required');assert.deepEqual(e.eligibleEfforts,[efforts[0]]);
  assert.ok(Buffer.byteLength(JSON.stringify(e.eligibleEfforts))<=384);assert.doesNotMatch(JSON.stringify(e.eligibleEfforts),/PRIVATE/);return true;
 });
 assert.deepEqual(f.phases,[]);
});

{
 test('empty pool without selection retains v1 failure and classifies v2',async t=>{
  const f=selectionFixture(t,{count:0});
  const verifyV1=e=>{assert.equal(e.code,'INVALID_RECORD');assert.equal(e.reason,undefined);assert.equal(e.message,'no eligible Peer option');return true;};
  await assert.rejects(preflightPeerChoice(f.request,f.providers),verifyV1);
  await assert.rejects(selectPeerSeat(f.request,f.deps),verifyV1);
  f.catalog.version=2;f.savePool();
  const verifyV2=e=>{assert.equal(e.code,'INVALID_RECORD');assert.equal(e.reason,'no-eligible-pairs');return true;};
  await assert.rejects(preflightPeerChoice(f.request,f.providers),verifyV2);
  await assert.rejects(selectPeerSeat(f.request,f.deps),verifyV2);
  assert.deepEqual(f.phases,[]);
 });
 for(const count of [1,2]) {
  test('eligible v2 pool without selection: a sole pair is taken, several need a choice, pairs='+count,async t=>{
   const f=selectionFixture(t,{count});f.catalog.version=2;
   for(const option of f.options){Object.assign(option,{displayName:'Fixture',description:'Bounded coding',effortPolicy:{kind:'fixed',thinkingOptionId:'high'},runtimeRule:'none'});delete option.thinkingOptionId;}
   f.providers[0].models=[{id:'model/variant',thinkingOptions:[{id:'high'}]}];f.savePool();
   const preflight=await preflightPeerChoice(f.request,f.providers);
   if(count>1){
    assert.equal(preflight.state,'selection-required');assert.equal(preflight.operationAdmitted,false);
    assert.equal(preflight.choices.length,count);assert.ok(preflight.choices.length>0);
    await assert.rejects(selectPeerSeat(f.request,f.deps),e=>e.reason==='selection-required');
    assert.deepEqual(f.phases,[]);
   }else{
    assert.equal(preflight,null);
    const selected=await selectPeerSeat(f.request,f.deps);
    assert.equal(selected.route.optionId,'first');assert.equal(selected.route.thinkingOptionId,'high');
    assert.equal(selected.origin,'unique');
   }
  });
 }
}
