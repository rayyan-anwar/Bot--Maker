const test = require('node:test');
const assert = require('node:assert/strict');
const Fortisni = require('../public/js/fortisni');

test('Fortisni classifies common English emotional messages', () => {
  const cases = [
    ['I feel sad and lonely today', 'sad'],
    ['I am worried about this', 'concerned'],
    ['This is so frustrating', 'angry'],
    ['Thank you for helping me', 'grateful'],
    ['I am excited about the launch', 'excited'],
    ['That is wonderful news', 'happy'],
    ["I don't understand this", 'confused'],
    ['How does this work?', 'curious']
  ];
  for (const [message, expected] of cases) {
    assert.equal(Fortisni.classifyText(message, 'user'), expected, message);
  }
});

test('Fortisni recognises common Hindi messages', () => {
  const cases = [
    ['मैं बहुत दुखी हूं', 'sad'],
    ['मुझे डर लग रहा है', 'concerned'],
    ['मुझे गुस्सा आ रहा है', 'angry'],
    ['बहुत बहुत धन्यवाद', 'grateful'],
    ['मैं बहुत उत्साहित हूं', 'excited'],
    ['यह शानदार है', 'happy'],
    ['मुझे समझ नहीं आया', 'confused'],
    ['यह कैसे काम करता है?', 'curious']
  ];
  for (const [message, expected] of cases) {
    assert.equal(Fortisni.classifyText(message, 'user'), expected, message);
  }
});

test('Fortisni recognises common Roman Hindi and Hinglish messages', () => {
  const cases = [
    ['Main bahut dukhi hoon', 'sad'],
    ['Yaar main akela feel kar raha hoon', 'sad'],
    ['Mujhe dar lag raha hai', 'concerned'],
    ['Bahut tension ho rahi hai', 'concerned'],
    ['Mujhe gussa aa raha hai', 'angry'],
    ['Ye bakwas hai', 'angry'],
    ['Shukriya yaar', 'grateful'],
    ['Bahut zabardast, maza aa gaya', 'excited'],
    ['Aaj bahut achha laga', 'happy'],
    ['Mujhe samajh nahi aa raha', 'confused'],
    ['Ye kaise kaam karta hai?', 'curious']
  ];
  for (const [message, expected] of cases) {
    assert.equal(Fortisni.classifyText(message, 'user'), expected, message);
  }
});

test('Fortisni uses speaking state for neutral assistant replies', () => {
  assert.equal(Fortisni.classifyText('The result is ready.', 'assistant'), 'speaking');
});

test('Fortisni defaults safely for empty and neutral user text', () => {
  assert.equal(Fortisni.classifyText('', 'user'), 'idle');
  assert.equal(Fortisni.classifyText('Good morning.', 'user'), 'idle');
});

test('Fortisni exposes a fixed set of safe visual states', () => {
  assert.ok(Fortisni.STATES.idle);
  assert.ok(Fortisni.STATES.thinking);
  assert.ok(Fortisni.STATES.speaking);
  assert.ok(Fortisni.STATES.excited);
  assert.ok(Fortisni.STATES.error);
});

test('Fortisni session snapshot keeps bounded recent turn context',()=>{
 const session=Fortisni.createSession();
 session.next('I feel sad','user');
 session.next('I am here to help','assistant');
 session.next('Okay','user');
 session.next('Thanks','user');
 session.next('One more neutral turn','user');
 const snap=session.snapshot();
 assert.equal(snap.recent.length,4);
 assert.deepEqual(snap.recent.map(item=>item.source),['assistant','user','user','user']);
 assert.equal(snap.state,'grateful');
 assert.equal(snap.neutralTurns,1);
});
test('Fortisni reset clears mood and recent context',()=>{
 const session=Fortisni.createSession();
 session.next('I am excited','user');
 session.reset();
 assert.deepEqual(session.snapshot(),{state:'idle',neutralTurns:0,recent:[]});
});

test('Fortisni reacts warmly to affectionate English, Hindi and Hinglish messages',()=>{
 for(const message of ['I miss you','Love you buddy','मुझे तुम्हारी याद आती है','Tum mere dost ho'])
  assert.equal(Fortisni.classifyText(message,'user'),'warm',message);
});

test('Fortisni does not trigger affection from Roman Hindi substrings inside unrelated words',()=>{
 assert.equal(Fortisni.classifyText('This is a dostana movie','user'),'idle');
 assert.equal(Fortisni.classifyText('That was a yaadgar moment','user'),'idle');
 assert.equal(Fortisni.classifyText('Tum mere dost ho','user'),'warm');
});
