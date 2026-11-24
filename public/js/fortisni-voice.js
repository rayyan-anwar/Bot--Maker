(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.BotForgeVoice=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 function createVoiceController(options){
  const settings=options||{},root=settings.root||{},input=settings.input;
  const onStatus=typeof settings.onStatus==='function'?settings.onStatus:()=>{};
  const onSpeaking=typeof settings.onSpeaking==='function'?settings.onSpeaking:()=>{};
  const Recognition=root.SpeechRecognition||root.webkitSpeechRecognition;
  let recognition=null,listening=false,speechEnabled=false,destroyed=false;
  function status(message){if(!destroyed)onStatus(message);}
  function startListening(){
   if(destroyed)return false;
   if(!Recognition){status('Voice input is not supported in this browser. You can still type your message.');return false;}
   if(listening){stopListening();return true;}
   try{
    recognition=new Recognition();
    recognition.lang=(root.navigator&&root.navigator.language)||'en-IN';
    recognition.continuous=false;
    recognition.interimResults=true;
    recognition.maxAlternatives=1;
    recognition.onstart=()=>{listening=true;status('Listening… Speak clearly, then pause.');};
    recognition.onresult=event=>{
     let finalText='',interimText='';
     for(let i=event.resultIndex||0;i<event.results.length;i++){
      const result=event.results[i],transcript=result&&result[0]&&result[0].transcript;
      if(typeof transcript!=='string')continue;
      if(result.isFinal)finalText+=transcript;else interimText+=transcript;
     }
     if(interimText&&!finalText)status('Hearing: '+interimText.slice(0,120));
     if(finalText&&input){
      const current=input.value.trim();
      input.value=current?(current+' '+text):text;
      if(typeof input.focus==='function')input.focus();
     }
     if(finalText)status('Voice text added. Review it, then press Send.');
    };
    recognition.onerror=event=>{
     listening=false;
     const reason=event&&event.error;
     status(reason==='not-allowed'||reason==='service-not-allowed'?'Microphone permission was denied. Allow microphone access or type your message.':reason==='no-speech'?'No speech detected. Try again.':'Voice input stopped. You can type your message.');
    };
    recognition.onend=()=>{listening=false;recognition=null;};
    recognition.start();
    return true;
   }catch(error){listening=false;recognition=null;status('Could not start voice input. Check microphone permission and try again.');return false;}
  }
  function stopListening(){
   if(!recognition)return false;
   try{recognition.stop();}catch(_){}
   listening=false;recognition=null;status('Voice input stopped.');return true;
  }
  function speak(text){
   if(destroyed||!speechEnabled||typeof text!=='string'||!text.trim())return false;
   const synth=root.speechSynthesis,Utterance=root.SpeechSynthesisUtterance;
   if(!synth||!Utterance){status('Speech playback is not supported in this browser.');return false;}
   try{
    synth.cancel();
    const utterance=new Utterance(text.slice(0,12000));
    utterance.lang=(root.navigator&&root.navigator.language)||'en-IN';
    utterance.onstart=()=>onSpeaking(true);
    utterance.onend=()=>onSpeaking(false);
    utterance.onerror=()=>{onSpeaking(false);status('Speech playback could not finish.');};
    synth.speak(utterance);
    return true;
   }catch(_){onSpeaking(false);status('Speech playback is unavailable right now.');return false;}
  }
  function setSpeechEnabled(enabled){
   speechEnabled=enabled===true;
   if(!speechEnabled){try{root.speechSynthesis?.cancel();}catch(_){}onSpeaking(false);}
   status(speechEnabled?'Read replies is on. Speech is played by your browser.':'Read replies is off.');
   return speechEnabled;
  }
  function destroy(){destroyed=true;stopListening();try{root.speechSynthesis?.cancel();}catch(_){}onSpeaking(false);}
  return {startListening,stopListening,speak,setSpeechEnabled,isListening:()=>listening,isSpeechEnabled:()=>speechEnabled,destroy};
 }
 return {createVoiceController};
});
