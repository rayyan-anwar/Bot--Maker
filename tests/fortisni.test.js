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
