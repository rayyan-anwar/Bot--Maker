'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {analyzeText,getReaction,STATES}=require('../server/fortisni-engine');
test('classifies positive English and Hindi input',()=>{assert.equal(analyzeText('That is amazing!').emotion,'joy');assert.equal(analyzeText('धन्यवाद').emotion,'joy');});
test('recognizes sadness and anger without mirroring',()=>{assert.equal(getReaction('I feel lonely').emotion,'sadness');assert.match(getReaction('I am furious').guidance,/Stay calm/);});
test('questions trigger attentive curiosity',()=>{const r=analyzeText('How does this work?');assert.equal(r.emotion,'curiosity');assert.equal(r.state,'attentive');assert.equal(r.question,true);});
test('context can set thinking and speaking state',()=>{assert.equal(analyzeText('hello',{isTyping:true}).state,'thinking');assert.equal(analyzeText('hello',{isSpeaking:true}).state,'speaking');});
test('empty text is idle and low intensity',()=>{const r=analyzeText('');assert.equal(r.state,'idle');assert.equal(r.intensity,0.15);});
test('only declared animation states are emitted',()=>{for(const text of ['happy','sad','angry','afraid','why','hello'])assert.ok(STATES.has(analyzeText(text).animation));});
test('prior state transition is reported',()=>{assert.equal(analyzeText('thank you',{state:'idle'}).transition,'transition');});

test('server emotion engine recognizes Roman Hindi and Hinglish input',()=>{
 assert.equal(analyzeText('Main bahut dukhi hoon').emotion,'sadness');
 assert.equal(analyzeText('Mujhe gussa aa raha hai').emotion,'anger');
 assert.equal(analyzeText('Mujhe dar lag raha hai').emotion,'fear');
 assert.equal(analyzeText('Shukriya yaar').emotion,'joy');
 assert.equal(analyzeText('Ye kaise kaam karta hai?').emotion,'curiosity');
 assert.equal(analyzeText('Mujhe tumhari yaad aa rahi hai').emotion,'affection');
});
test('server emotion engine handles uppercase and mixed-case Roman Hindi',()=>{
 assert.equal(analyzeText('SHUKRIYA YAAR').emotion,'joy');
 assert.equal(analyzeText('Mujhe GUSSA aa raha hai').emotion,'anger');
 assert.equal(analyzeText('DAR LAG RAHA HAI').emotion,'fear');
 assert.equal(analyzeText('Ye KAISE kaam karta hai?').emotion,'curiosity');
});
test('server emotion engine preserves neutral fallback for unrelated Hinglish text',()=>{
 assert.equal(analyzeText('Kal meeting 4 baje hai').emotion,'neutral');
 assert.equal(analyzeText('').state,'idle');
});

test('affection phrases are not swallowed by the sadness matcher',()=>{
 assert.equal(analyzeText('I miss you').emotion,'affection');
 assert.equal(analyzeText('Love you buddy').state,'warm');
 assert.equal(analyzeText('I feel lonely').emotion,'sadness');
});

test('affection detection does not match Roman Hindi substrings inside unrelated words',()=>{
 assert.equal(analyzeText('The Dostana movie was released').emotion,'neutral');
 assert.equal(analyzeText('It was a yaadgar moment').emotion,'neutral');
 assert.equal(analyzeText('Tum mere dost ho').emotion,'affection');
});

test('server emotion engine respects negation in English, Hindi and Hinglish',()=>{
 for(const message of ['I am not happy today','I am not sad anymore','I do not feel angry','I am not worried','Main khush nahi hoon','Main gussa nahi hoon','मैं दुखी नहीं हूं','मैं खुश नहीं हूँ'])
  assert.equal(analyzeText(message).emotion,'neutral',message);
 assert.equal(analyzeText('I am not sad but happy').emotion,'joy');
 assert.equal(analyzeText('I am not happy but excited').emotion,'joy');
});
