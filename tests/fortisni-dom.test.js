const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Fortisni = require('../public/js/fortisni');

function createDocument(withHost = true) {
  const status = { textContent: '' };
  const host = {
    dataset: {},
    innerHTML: '',
    querySelector(selector) {
      assert.equal(selector, '.fortisni-status');
      return status;
    }
  };
  return {
    host,
    status,
    getElementById(id) {
      assert.equal(id, 'fortisni-companion');
      return withHost ? host : null;
    }
  };
}

test('Fortisni mounts its companion and starts in idle state', () => {
  const doc = createDocument();
  const root = {};
  const mounted = Fortisni.mount.call(null, doc);
  assert.ok(mounted);
  assert.equal(mounted.host, doc.host);
  assert.match(doc.host.innerHTML, /fortisni-avatar/);
  assert.equal(doc.host.dataset.state, 'idle');
  assert.equal(doc.status.textContent, Fortisni.STATES.idle);
  // mount exposes the two small integration methods on the supplied root only
  // when a browser root is available; the returned methods remain directly testable.
  assert.equal(typeof mounted.setState, 'function');
  assert.equal(typeof mounted.setText, 'function');
  void root;
});

test('Fortisni state updates use textContent and reject unknown states', () => {
  const doc = createDocument();
  const mounted = Fortisni.mount(doc);
  assert.equal(mounted.setState('excited'), 'excited');
  assert.equal(doc.host.dataset.state, 'excited');
  assert.equal(doc.status.textContent, Fortisni.STATES.excited);
  assert.equal(mounted.setState('not-a-real-state'), 'idle');
  assert.equal(doc.host.dataset.state, 'idle');
  const untrusted = '<img src=x onerror=alert(1)>';
  mounted.setState('thinking', untrusted);
  assert.equal(doc.status.textContent, untrusted);
  assert.equal(doc.host.innerHTML.includes(untrusted), false);
});

test('Fortisni text updates classify user and assistant content', () => {
  const doc = createDocument();
  const mounted = Fortisni.mount(doc);
  assert.equal(mounted.setText('I am worried about this', 'user'), 'concerned');
  assert.equal(doc.host.dataset.state, 'concerned');
  assert.equal(mounted.setText('Your answer is ready.', 'assistant'), 'speaking');
  assert.equal(doc.host.dataset.state, 'speaking');
});

test('Fortisni safely does nothing when the companion host is absent', () => {
  assert.equal(Fortisni.mount(createDocument(false)), null);
});

test('chat integration clears the delayed thinking transition after success and failure', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/bot.html'), 'utf8');
  assert.match(html, /const userReaction = window\\.setFortisniText\\(text, 'user'\\);\\s*const thinkingTimer = userReaction === 'idle' \\|\\| userReaction === 'thinking'[\\s\\S]*?window\\.setTimeout\\(\\(\\) => window\\.setFortisniState\\('thinking'\\), 700\\)/);
  assert.match(html, /window\.clearTimeout\(thinkingTimer\);\s*pending\.textContent=message\.content/);
  assert.match(html, /catch \(err\) \{[\s\S]*?window\.clearTimeout\(thinkingTimer\);[\s\S]*?pending\.textContent = 'Error: '/);
  assert.match(html, /window\.setFortisniText\(text, 'user'\)/);
  assert.match(html, /window\.setFortisniText\(message\.content, 'assistant'\)/);
});

test('Fortisni keeps emotional context briefly across neutral turns, then returns to idle', () => {
  const session = Fortisni.createSession();
  assert.equal(session.next('I feel lonely', 'user'), 'sad');
  assert.equal(session.next('Okay', 'user'), 'sad');
  assert.equal(session.snapshot().neutralTurns, 1);
  assert.equal(session.next('Hello', 'user'), 'idle');
  assert.equal(session.snapshot().neutralTurns, 2);
});

test('Fortisni session resets emotional continuity for explicit work and assistant speech', () => {
  const session = Fortisni.createSession();
  assert.equal(session.next('I am worried', 'user'), 'concerned');
  assert.equal(session.next('Build me a website', 'user'), 'thinking');
  assert.equal(session.next('Here is the result.', 'assistant'), 'speaking');
  assert.equal(session.reset(), 'idle');
  assert.deepEqual(session.snapshot(), { state: 'idle', neutralTurns: 0, recent: [] });
});


test('Fortisni styles provide distinct expressions and respect reduced motion', () => {
  const css = fs.readFileSync(path.join(__dirname, '../public/css/fortisni.css'), 'utf8');
  for (const state of ['happy', 'sad', 'concerned', 'curious', 'confused', 'angry', 'grateful']) {
    assert.match(css, new RegExp('data-state="' + state + '"'));
  }
  assert.match(css, /@keyframes fortisni-blink/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});

test('chat keeps detected user emotion visible while the assistant is preparing a reply',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../public/bot.html'),'utf8');
 assert.match(html,/const userReaction = window\.setFortisniText\(text, 'user'\)/);
 assert.match(html,/userReaction === 'idle' \|\| userReaction === 'thinking'/);
 assert.match(html,/\? window\.setTimeout\(\(\) => window\.setFortisniState\('thinking'\), 700\)\s*: null/);
});
