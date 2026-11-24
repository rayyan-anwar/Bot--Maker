'use strict';
const RULES=[
 {emotion:'joy',state:'celebrating',intensity:0.72,patterns:[/\b(thank you|thanks|awesome|great|happy|excited|thrilled|can't wait|cant wait|congratulations|congrats|love it|excellent|perfect|amazing|good job)\b/i,/(शुक्रिया|धन्यवाद|बहुत अच्छा|खुश|उत्साहित|बधाई|जश्न|बढ़िया|shukriya|dhanyawad|aabhari|thanks yaar|accha laga|achha laga|bahut badhiya|mast hai|zabardast)/i]},
 {emotion:'affection',state:'warm',intensity:0.62,patterns:[/\b(miss you|love you|dear|buddy|best friend|yaad|pyaar|pyar|dost)\b/i,/(याद|प्यार|दोस्त)/i]},
 {emotion:'sadness',state:'comforting',intensity:0.68,patterns:[/\b(sad|depressed|lonely|grief|heartbroken|upset)\b/i,/(दुखी|उदास|अकेला|दर्द|परेशान|dukhi|udaas|akela|akeli|pareshan hoon|pareshan hun|rona aa raha|rona aa rahi)/i]},
 {emotion:'anger',state:'calming',intensity:0.75,patterns:[/\b(angry|furious|hate|frustrated|annoyed|rage)\b/i,/(गुस्सा|नाराज़|चिढ़|क्रोधित|gussa|naraz|chidh|bekaar|bakwas)/i]},
 {emotion:'fear',state:'reassuring',intensity:0.66,patterns:[/\b(scared|afraid|anxious|worried|panic|nervous)\b/i,/(डर|घबर|चिंता|चिंतित|dar lag|darr lag|ghabra|tension ho rahi|chinta ho rahi)/i]},
 {emotion:'curiosity',state:'attentive',intensity:0.52,patterns:[/\b(why|how|what is|explain|tell me|curious|wonder)\b/i,/(क्यों|कैसे|क्या है|समझाओ|बताओ|kyun|kyu|kaise|kya|kab|kahan|kaun|samjhao|batao)/i]},
 {emotion:'neutral',state:'idle',intensity:0.25,patterns:[]}
];
function maskNegatedEmotionPhrases(value){
 let text=String(value==null?'':value);
 const englishNegation=/\b(?:not|never|no longer|don't|do not|doesn't|isn't|aren't|can't|cannot)(?:\s+\w+){0,3}\s+(?:happy|glad|sad|depressed|lonely|upset|heartbroken|unhappy|angry|furious|annoyed|frustrated|worried|anxious|nervous|scared|afraid|excited|grateful|love you|miss you|dear|buddy|best friend|hate)\b/gi;
 text=text.replace(englishNegation,' ');
 text=text.replace(/\b(?:khush|khushi|dukhi|udaas|gussa|naraz|pareshan|akela|akeli|darr?|ghabra\w*)\s+(?:nahi|nahin)\b/gi,' ');
 text=text.replace(/\b(?:nahi|nahin)\s+(?:khush|khushi|dukhi|udaas|gussa|naraz|pareshan|akela|akeli|darr?|ghabra\w*)\b/gi,' ');
 text=text.replace(/(?:खुश|खुशी|दुखी|उदास|गुस्सा|नाराज़|डर|परेशान|अकेला|अकेली)\s*(?:नहीं|नही|मत)(?:\s+\S+){0,2}/g,' ');
 text=text.replace(/(?:नहीं|नही|मत)\s*(?:खुश|खुशी|दुखी|उदास|गुस्सा|नाराज़|डर|परेशान|अकेला|अकेली)(?:\s+\S+){0,2}/g,' ');
 return text;
}
const STATES=new Set(['idle','celebrating','comforting','calming','reassuring','attentive','warm','thinking','speaking']);
function analyzeText(text,context={}){
 const originalValue=String(text||'').trim().slice(0,10000);const value=maskNegatedEmotionPhrases(originalValue).trim();
 const match=RULES.find(rule=>rule.emotion!=='neutral'&&rule.patterns.some(pattern=>pattern.test(value)))||RULES[RULES.length-1];
 const prior=STATES.has(context.state)?context.state:null;
 const question=/[?？]$/.test(originalValue);
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
