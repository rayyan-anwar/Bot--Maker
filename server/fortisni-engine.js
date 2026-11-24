'use strict';
const RULES=[
 {emotion:'joy',state:'celebrating',intensity:0.72,patterns:[/\b(thank you|thanks|awesome|great|happy|love it|excellent|perfect|amazing|good job)\b/i,/(शुक्रिया|धन्यवाद|बहुत अच्छा|खुश|बढ़िया|shukriya|dhanyawad|aabhari|thanks yaar|accha laga|achha laga|bahut badhiya|mast hai|zabardast)/i]},
 {emotion:'affection',state:'warm',intensity:0.62,patterns:[/\b(miss you|love you|dear|buddy|best friend|yaad|pyaar|pyar|dost)\b/i,/(याद|प्यार|दोस्त)/i]},
 {emotion:'sadness',state:'comforting',intensity:0.68,patterns:[/\b(sad|depressed|lonely|grief|heartbroken|upset)\b/i,/(दुखी|उदास|अकेला|दर्द|परेशान|dukhi|udaas|akela|akeli|pareshan hoon|pareshan hun|rona aa raha|rona aa rahi)/i]},
 {emotion:'anger',state:'calming',intensity:0.75,patterns:[/\b(angry|furious|hate|frustrated|annoyed|rage)\b/i,/(गुस्सा|नाराज़|चिढ़|क्रोधित|gussa|naraz|chidh|bekaar|bakwas)/i]},
 {emotion:'fear',state:'reassuring',intensity:0.66,patterns:[/\b(scared|afraid|anxious|worried|panic|nervous)\b/i,/(डर|घबर|चिंता|चिंतित|dar lag|darr lag|ghabra|tension ho rahi|chinta ho rahi)/i]},
 {emotion:'curiosity',state:'attentive',intensity:0.52,patterns:[/\b(why|how|what is|explain|tell me|curious|wonder)\b/i,/(क्यों|कैसे|क्या है|समझाओ|बताओ|kyun|kyu|kaise|kya|kab|kahan|kaun|samjhao|batao)/i]},
 {emotion:'neutral',state:'idle',intensity:0.25,patterns:[]}
];
const STATES=new Set(['idle','celebrating','comforting','calming','reassuring','attentive','warm','thinking','speaking']);
function analyzeText(text,context={}){
 const value=String(text||'').trim().slice(0,10000);
 const match=RULES.find(rule=>rule.emotion!=='neutral'&&rule.patterns.some(pattern=>pattern.test(value)))||RULES[RULES.length-1];
 const prior=STATES.has(context.state)?context.state:null;
 const question=/[?？]$/.test(value);
 let state=match.state;
 if(!value)state='idle';
 if(context.isTyping===true&&match.emotion==='neutral')state='thinking';
 if(context.isSpeaking===true)state='speaking';
 const emotion=match.emotion;
 const intensity=value?match.intensity:0.15;
 return {emotion,state,intensity,expression:emotion==='joy'?'smile':emotion==='sadness'?'soft':emotion==='anger'?'focused':emotion==='fear'?'concerned':emotion==='curiosity'?'wide_eyes':emotion==='affection'?'warm_smile':'neutral',animation:state,question,transition:prior&&prior!==state?'transition':'steady'};
}
function getReaction(text,context={}){
 const analysis=analyzeText(text,context);
 const guidance={joy:'Respond with upbeat warmth, but do not overdo it.',sadness:'Respond gently, acknowledge feelings, and avoid dismissive positivity.',anger:'Stay calm, acknowledge frustration, and do not mirror hostility.',fear:'Be steady and reassuring; offer clear next steps when useful.',curiosity:'Show attentive interest and explain clearly.',affection:'Be friendly and warm while maintaining appropriate boundaries.',neutral:'Use a natural, attentive response.'}[analysis.emotion];
 return {...analysis,guidance};
}
module.exports={analyzeText,getReaction,STATES};
