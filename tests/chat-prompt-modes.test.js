const test=require('node:test');
const assert=require('node:assert/strict');
const {appendBotModeInstructions}=require('../server/chat');

test('chat response and safety modes are separated by real line breaks',()=>{
 const concise=appendBotModeInstructions('Base instructions','concise','strict');
 assert.equal(concise,'Base instructions\n\nResponse style: be concise and direct, prioritizing the answer.\n\nSafety mode: use extra caution, avoid unsupported claims, and ask for clarification before high-impact or risky guidance.');
 assert.ok(!concise.includes('\\\\n'));
 const detailed=appendBotModeInstructions('Base instructions','detailed','basic');
 assert.equal(detailed,'Base instructions\n\nResponse style: provide thorough, structured explanations with useful context.\n\nSafety mode: answer normally while still following platform safety rules.');
});

test('default chat modes leave the original system instructions unchanged',()=>{
 assert.equal(appendBotModeInstructions('Base instructions'),'Base instructions');
});
