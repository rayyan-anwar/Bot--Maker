'use strict';

const { v4: uuidv4 } = require('uuid');
const store = require('./store');
const taskService = require('./agent-task-service');

const MAX_WORKFLOWS_PER_USER = 50;
const MAX_STEPS = 8;
const TYPES = new Set(['text.analyze','draft.create','knowledge.search']);

function isJsonValue(value, depth = 0, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || depth > 20 || seen.has(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return false;
  if (Object.getOwnPropertySymbols(value).length) return false;
  seen.add(value);
  let valid = true;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(value, i) || !isJsonValue(value[i], depth + 1, seen)) { valid = false; break; }
    }
    if (valid && Object.keys(value).some(key => !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)) valid = false;
  } else {
    for (const key of Object.keys(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) { valid = false; break; }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || !isJsonValue(descriptor.value, depth + 1, seen)) { valid = false; break; }
    }
  }
  seen.delete(value);
  return valid;
}


function readOwnDataProperty(object, key, fallback) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor) return fallback;
  if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
    throw new TypeError('Workflow definitions must not contain accessor properties.');
  }
  return descriptor.value;
}

function assertPlainRecord(value, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(message);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(message);
  if (Object.getOwnPropertySymbols(value).length) throw new TypeError(message);
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      throw new TypeError('Workflow definitions must not contain accessor properties.');
    }
  }
}

function validateDefinition(input) {
  assertPlainRecord(input, 'Workflow definition is required.');
  const rawName = readOwnDataProperty(input, 'name');
  if (typeof rawName !== 'string') throw new TypeError('Workflow name must be 1 to 100 characters.');
  const name = rawName.trim();
  if (!name || name.length > 100) throw new TypeError('Workflow name must be 1 to 100 characters.');
  const rawSteps = readOwnDataProperty(input, 'steps');
  if (!Array.isArray(rawSteps) || rawSteps.length < 1 || rawSteps.length > MAX_STEPS) throw new TypeError('Workflows require 1 to 8 steps.');
  const steps = [];
  for (let index = 0; index < rawSteps.length; index++) {
    if (!Object.prototype.hasOwnProperty.call(rawSteps, index)) throw new TypeError('Workflow steps must not contain empty entries.');
    const step = rawSteps[index];
    assertPlainRecord(step, 'Unsupported workflow step at position ' + (index + 1) + '.');
    const type = readOwnDataProperty(step, 'type');
    if (!TYPES.has(type)) throw new TypeError('Unsupported workflow step at position ' + (index + 1) + '.');
    let args = {};
    const rawArgs = readOwnDataProperty(step, 'arguments');
    if (rawArgs !== undefined) {
      if (!rawArgs || typeof rawArgs !== 'object' || Array.isArray(rawArgs)) throw new TypeError('Workflow step arguments must be a JSON object.');
      try {
        if (!isJsonValue(rawArgs)) throw new TypeError('Workflow step arguments must be valid JSON data.');
        const serialized = JSON.stringify(rawArgs);
        if (serialized === undefined) throw new TypeError('Workflow step arguments must be JSON serializable.');
        if (Buffer.byteLength(serialized) > 4000) throw new RangeError('Workflow step arguments are too large.');
        args = JSON.parse(serialized);
      } catch (error) {
        if (error instanceof RangeError) throw error;
        throw new TypeError('Workflow step arguments must be valid JSON data.');
      }
    }
    steps.push({ id: uuidv4(), type, arguments: args });
  }
  const trigger = readOwnDataProperty(input, 'trigger', { type: 'manual' });
  assertPlainRecord(trigger, 'Trigger must be an object.');
  const triggerType = readOwnDataProperty(trigger, 'type');
  if (!['manual','webhook','schedule'].includes(triggerType)) throw new TypeError('Trigger must be manual, webhook or schedule.');
  if (triggerType === 'schedule') {
    const intervalMinutes = readOwnDataProperty(trigger, 'intervalMinutes');
    if (typeof intervalMinutes !== 'number' || !Number.isInteger(intervalMinutes) || intervalMinutes < 15 || intervalMinutes > 10080) throw new TypeError('Schedule interval must be 15 to 10080 minutes.');
    return { name, steps, trigger: { type: 'schedule', intervalMinutes } };
  }
  if (triggerType === 'webhook') return { name, steps, trigger: { type: 'webhook', secret: uuidv4() } };
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
async function run(userId,id,triggerData={},requestId) {
  if(!triggerData||typeof triggerData!=='object'||Array.isArray(triggerData)||!isJsonValue(triggerData))throw new TypeError('Automation trigger data must be a JSON object.');
  const triggerBytes=Buffer.byteLength(JSON.stringify(triggerData),'utf8');
  if(triggerBytes>8000)throw new RangeError('Automation trigger data exceeds the 8 KB limit.');
  if(requestId!==undefined&&(typeof requestId!=='string'||!requestId.trim()||requestId.length>100))throw new TypeError('Invalid automation request ID.');
  const workflow=await store.findByIdAsync('aiEngineerRuns',id);
  if(!workflow||workflow.kind!=='automation-workflow'||workflow.userId!==userId) return null;
  if(!workflow.enabled)throw new Error('Workflow is disabled.');
  const scheduleSlot=triggerData.scheduled===true&&workflow.trigger?.type==='schedule'?(triggerData.scheduleSlot||workflow.nextRunAt):null;
  if(scheduleSlot!==null&&(typeof scheduleSlot!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/.test(scheduleSlot)||!Number.isFinite(Date.parse(scheduleSlot))||new Date(scheduleSlot).toISOString()!==scheduleSlot))throw new TypeError('Invalid automation schedule slot.');
  const idempotencyKey=scheduleSlot?'automation:'+id+':schedule:'+scheduleSlot:requestId?'automation:'+id+':request:'+requestId:'automation:'+id+':'+Date.now()+':'+uuidv4();
  const created=await taskService.enqueueTask({userId,taskType:'automation.workflow.execute',payload:{workflowId:id,triggerData},idempotencyKey});
  const latest=await store.findByIdAsync('aiEngineerRuns',id);
  if(latest&&latest.kind==='automation-workflow'&&latest.userId===userId){
    const patch={lastRunAt:new Date().toISOString(),lastTaskId:created.task.id,updatedAt:new Date().toISOString()};
    if(scheduleSlot&&latest.nextRunAt===scheduleSlot)patch.nextRunAt=new Date(Date.parse(scheduleSlot)+workflow.trigger.intervalMinutes*60000).toISOString();
    await store.updateByIdAsync('aiEngineerRuns',id,patch);
  }
  return created.task;
}
async function getWebhookWorkflow(id){const row=await store.findByIdAsync('aiEngineerRuns',id);return row&&row.kind==='automation-workflow'&&row.trigger?.type==='webhook'?row:null;}
async function getOwned(userId,id){const row=await store.findByIdAsync('aiEngineerRuns',id);return row&&row.kind==='automation-workflow'&&row.userId===userId?row:null;}
module.exports={validateDefinition,list,create,run,getOwned,getWebhookWorkflow,MAX_WORKFLOWS_PER_USER,MAX_STEPS,TYPES};
