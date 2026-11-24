const test=require('node:test');
const assert=require('node:assert/strict');
const {createVoiceController}=require('../public/js/fortisni-voice');

test('voice input degrades safely when browser speech recognition is unavailable',()=>{
 const messages=[],controller=createVoiceController({root:{navigator:{language:'en-IN'}},input:{value:''},onStatus:value=>messages.push(value)});
 assert.equal(controller.startListening(),false);
 assert.match(messages.at(-1),/not supported/);
 assert.equal(controller.isListening(),false);
});

test('voice input adds recognized speech to the chat composer without auto-sending',()=>{
 let instance;
 class FakeRecognition{start(){this.onstart();}stop(){if(this.onend)this.onend();}}
 const input={value:'Existing text',focus(){this.focused=true;}},messages=[];
 const controller=createVoiceController({root:{SpeechRecognition:class extends FakeRecognition{constructor(){super();instance=this;}},navigator:{language:'hi-IN'}},input,onStatus:value=>messages.push(value)});
 assert.equal(controller.startListening(),true);
 assert.equal(instance.lang,'hi-IN');
 assert.equal(instance.continuous,false);
 instance.onresult({resultIndex:0,results:[Object.assign([{transcript:'नमस्ते'}],{isFinal:true})]});
 assert.equal(input.value,'Existing text नमस्ते');
 assert.equal(input.focused,true);
 assert.match(messages.at(-1),/press Send/);
 assert.equal(controller.isListening(),true);
 controller.stopListening();
 assert.equal(controller.isListening(),false);
});

test('microphone permission failures provide a clear fallback',()=>{
 let instance;
 class FakeRecognition{start(){this.onstart();}}
 const messages=[],controller=createVoiceController({root:{SpeechRecognition:class extends FakeRecognition{constructor(){super();instance=this;}}},input:{value:''},onStatus:value=>messages.push(value)});
 controller.startListening();
 instance.onerror({error:'not-allowed'});
 assert.match(messages.at(-1),/permission was denied/);
 assert.equal(controller.isListening(),false);
});

test('speech playback is opt-in and can be stopped',()=>{
 const spoken=[],events=[];
 const root={navigator:{language:'en-US'},SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},speechSynthesis:{cancel(){events.push('cancel');},speak(item){spoken.push(item);}}};
 const controller=createVoiceController({root,onSpeaking:value=>events.push(value)});
 assert.equal(controller.speak('Hello'),false);
 controller.setSpeechEnabled(true);
 assert.equal(controller.speak('Hello Fortisni'),true);
 assert.equal(spoken[0].text,'Hello Fortisni');
 spoken[0].onstart();
 spoken[0].onend();
 assert.ok(events.includes(true));
 assert.ok(events.includes(false));
 controller.setSpeechEnabled(false);
 assert.equal(controller.isSpeechEnabled(),false);
 assert.ok(events.includes('cancel'));
});

test('speech output is safely unavailable when browser APIs are missing',()=>{
 const messages=[],controller=createVoiceController({root:{},onStatus:value=>messages.push(value)});
 controller.setSpeechEnabled(true);
 assert.equal(controller.speak('Hello'),false);
 assert.match(messages.at(-1),/not supported/);
 controller.destroy();
});
