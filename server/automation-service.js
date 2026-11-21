'use strict';

const { v4: uuidv4 } = require('uuid');
const store = require('./store');
const taskService = require('./agent-task-service');

const MAX_WORKFLOWS_PER_USER = 50;
const MAX_STEPS = 8;
const TYPES = new Set(['text.analyze','draft.create','knowledge.search']);

function validateDefinition(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Workflow definition is required.');
  const name = String(input.name || '').trim();
  if (!name || name.length > 100) throw new TypeError('Workflow name must be 1 to 100 characters.');
  if (!Array.isArray(input.steps) || input.steps.length < 1 || input.steps.length > MAX_STEPS) throw new TypeError('Workflows require 1 to 8 steps.');
  const steps = input.steps.map((step, index) => {
    if (!step || !TYPES.has(step.type)) throw new TypeError('Unsupported workflow step at position ' + (index + 1) + '.');
    const args = step.arguments && typeof step.arguments === 'object' && !Array.isArray(step.arguments) ? JSON.parse(JSON.stringify(step.arguments)) : {};
    if (Buffer.byteLength(JSON.stringify(args)) > 4000) throw new RangeError('Workflow step arguments are too large.');
    return { id: uuidv4(), type: step.type, arguments: args };
  });
  const trigger = input.trigger && typeof input.trigger === 'object' ? input.trigger : { type: 'manual' };
  if (!['manual','webhook','schedule'].includes(trigger.type)) throw new TypeError('Trigger must be manual, webhook or schedule.');
  if (trigger.type === 'schedule') {
    const intervalMinutes = Number(trigger.intervalMinutes);
    if (!Number.isInteger(intervalMinutes) || intervalMinutes < 15 || intervalMinutes > 10080) throw new TypeError('Schedule interval must be 15 to 10080 minutes.');
    return { name, steps, trigger: { type: 'schedule', intervalMinutes } };
  }
  if (trigger.type === 'webhook') return { name, steps, trigger: { type: 'webhook', secret: uuidv4() } };
  return { name, steps, trigger: { type: 'manual' } };
}

async function list(userId) {
  return (await store.findManyAsync('aiEngineerRuns',{userId}))
    .filter(row=>row.kind==='automation-workflow')
    .sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt))
    .map(({trigger,...row})=>({...row,trigger:{type:trigger?.type||'manual',intervalMinutes:trigger?.intervalMinutes}}));
}
async function create(userId,input) {
  const existing=await list(userId);
  if(existing.length>=MAX_WORKFLOWS_PER_USER)throw new Error('Workflow limit reached.');
  const definition=validateDefinition(input),now=new Date().toISOString();
  const record={id:uuidv4(),kind:'automation-workflow',userId,...definition,enabled:true,createdAt:now,updatedAt:now,nextRunAt:definition.trigger.type==='schedule'?new Date(Date.now()+definition.trigger.intervalMinutes*60000).toISOString():null};
  await store.insertAsync('aiEngineerRuns',record);
  return record;
}
async function run(userId,id,triggerData={}) {
  const workflow=await store.findByIdAsync('aiEngineerRuns',id);
  if(!workflow||workflow.kind!=='automation-workflow'||workflow.userId!==userId) return null;
  if(!workflow.enabled)throw new Error('Workflow is disabled.');
  const scheduleSlot=triggerData.scheduled===true&&workflow.trigger?.type==='schedule'?(triggerData.scheduleSlot||workflow.nextRunAt):null;
  const idempotencyKey=scheduleSlot?'automation:'+id+':schedule:'+scheduleSlot:'automation:'+id+':'+Date.now()+':'+uuidv4();
  const created=await taskService.enqueueTask({userId,taskType:'automation.workflow.execute',payload:{workflowId:id,triggerData},idempotencyKey});
  await store.updateByIdAsync('aiEngineerRuns',id,{lastRunAt:new Date().toISOString(),lastTaskId:created.task.id,updatedAt:new Date().toISOString(),...(workflow.trigger?.type==='schedule'?{nextRunAt:new Date(Date.now()+workflow.trigger.intervalMinutes*60000).toISOString()}:{})});
  return created.task;
}
async function getOwned(userId,id){const row=await store.findByIdAsync('aiEngineerRuns',id);return row&&row.kind==='automation-workflow'&&row.userId===userId?row:null;}
module.exports={validateDefinition,list,create,run,getOwned,MAX_WORKFLOWS_PER_USER,MAX_STEPS,TYPES};
