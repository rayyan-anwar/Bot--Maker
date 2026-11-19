(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BotForgeFortisni = api;
  if (root && root.document) api.mount(root.document);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const STATES = {
    idle: 'I’m here whenever you need me.',
    thinking: 'Let me think this through…',
    speaking: 'Here’s what I found.',
    happy: 'That sounds great!',
    excited: 'This is exciting!',
    sad: 'I’m here with you. Let’s take it one step at a time.',
    concerned: 'I’ll take this seriously and help you through it.',
    angry: 'I can see this is frustrating. Let’s work through it.',
    grateful: 'You’re very welcome!',
    curious: 'That’s an interesting question.',
    confused: 'Let’s slow down and make this clearer.',
    error: 'Something went wrong. Let’s try again.'
  };

  const MATCHERS = [
    ['sad', /\b(sad|depressed|depressing|lonely|upset|heartbroken|unhappy|crying|miserable)\b/, ['दुखी', 'उदास', 'अकेला', 'अकेली', 'परेशान हूं', 'रो रहा', 'रो रही']],
    ['concerned', /\b(scared|afraid|worried|anxious|nervous|unsafe|emergency|help me)\b/, ['डर लग', 'चिंता', 'घबरा', 'डर गया', 'डर गई', 'मदद करो']],
    ['angry', /\b(angry|furious|annoyed|frustrated|frustrating|frustration|irritated|irritating|hate|stupid|useless)\b/, ['गुस्सा', 'नाराज़', 'चिढ़', 'बेकार', 'बकवास']],
    ['grateful', /\b(thank you|thanks|thx|grateful|appreciate it)\b/, ['धन्यवाद', 'शुक्रिया', 'आभारी']],
    ['excited', /\b(excited|can't wait|cant wait|let’s go|lets go|congratulations|congrats)\b/, ['उत्साहित', 'बधाई', 'कमाल', 'जश्न']],
    ['happy', /\b(happy|glad|awesome|amazing|great|wonderful|fantastic|good news)\b/, ['खुश', 'शानदार', 'बहुत अच्छा', 'अच्छी खबर']],
    ['confused', /\b(confused|don't understand|do not understand|unclear|lost|what do you mean)\b/, ['समझ नहीं', 'समझ नहीं आया', 'उलझन', 'कन्फ्यूज']],
    ['curious', /\b(why|how|what|when|where|which|explain|tell me|can you)\b/, ['क्यों', 'कैसे', 'क्या', 'कब', 'कहां', 'कौन', 'समझाओ', 'बताओ']]
  ];

  function classifyText(value, source) {
    const text = String(value == null ? '' : value).toLowerCase().trim();
    if (!text) return 'idle';

    for (const [state, pattern, phrases] of MATCHERS) {
      if (pattern.test(text) || phrases.some(phrase => text.includes(phrase))) return state;
    }

    if (source === 'assistant') return 'speaking';
    if (/\b(build|create|make|write|design|debug|fix|plan|calculate|analyze|analyse|generate|help)\b/.test(text) ||
        ['बनाओ', 'लिखो', 'ठीक करो', 'समाधान', 'मदद', 'प्लान'].some(phrase => text.includes(phrase))) return 'thinking';
    return 'idle';
  }

  function mount(doc) {
    const host = doc.getElementById('fortisni-companion');
    if (!host) return null;

    host.innerHTML = '<svg class="fortisni-avatar" viewBox="0 0 100 100" role="img" aria-label="Fortisni, BotForge AI companion"><defs><linearGradient id="fortisniHair" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f7f4ff"/><stop offset=".55" stop-color="#b8b5ff"/><stop offset="1" stop-color="#7d8cff"/></linearGradient><linearGradient id="fortisniHood" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#24294d"/><stop offset="1" stop-color="#10152c"/></linearGradient></defs><ellipse cx="50" cy="91" rx="30" ry="5" fill="#7185ff" opacity=".2"/><path d="M18 91 Q18 65 50 65 Q82 65 82 91Z" fill="url(#fortisniHood)" stroke="#6577ff" stroke-width="2"/><path d="M35 72 Q50 83 65 72" fill="none" stroke="#9ca8ff" stroke-width="3"/><path d="M24 42 Q19 10 49 9 Q81 8 77 44 L70 59 Q51 74 30 58Z" fill="url(#fortisniHair)" stroke="#8b91ff" stroke-width="2"/><path d="M27 34 Q9 25 23 12 Q26 24 39 18 Q51 -1 63 15 Q82 12 79 32 Q67 24 59 29 Q43 18 27 34Z" fill="url(#fortisniHair)" stroke="#9b9cff" stroke-width="2"/><path d="M22 31 Q12 31 15 48 Q17 59 28 56 M78 31 Q89 31 86 48 Q84 59 73 56" fill="none" stroke="#48cfff" stroke-width="5"/><path class="fortisni-brows" d="M35 39 L46 42 M56 42 L67 39" fill="none" stroke="#343a76" stroke-width="2.5" stroke-linecap="round"/><path d="M35 45 Q41 40 46 45 M56 45 Q62 40 67 45" fill="none" stroke="#343a76" stroke-width="3" stroke-linecap="round" class="fortisni-eyes"/><ellipse cx="50" cy="55" rx="5" ry="3" fill="#ec8eb7" opacity=".6"/><path class="fortisni-mouth" d="M45 59 Q50 65 56 59" fill="none" stroke="#9a477c" stroke-width="2.5" stroke-linecap="round"/><circle class="fortisni-aura" cx="84" cy="43" r="7" fill="#202c61" stroke="#48cfff" stroke-width="2"/><text x="84" y="46" text-anchor="middle" font-size="8" font-weight="bold" fill="#fff">B</text></svg><div class="fortisni-copy"><div class="fortisni-name">Fortisni <span class="fortisni-label">· BotForge companion</span></div><div class="fortisni-status" role="status" aria-live="polite" aria-atomic="true"></div></div>';

    const status = host.querySelector('.fortisni-status');
    function setState(state, customMessage) {
      const safeState = Object.prototype.hasOwnProperty.call(STATES, state) ? state : 'idle';
      host.dataset.state = safeState;
      status.textContent = customMessage || STATES[safeState];
      return safeState;
    }

    function setText(value, source) {
      const state = classifyText(value, source);
      setState(state);
      return state;
    }

    const globalRoot = typeof globalThis !== 'undefined' ? globalThis : null;
    if (globalRoot) {
      globalRoot.setFortisniState = setState;
      globalRoot.setFortisniText = setText;
    }
    setState('idle');
    return { setState, setText, host };
  }

  return { STATES, classifyText, mount };
});
