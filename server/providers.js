const MOCK_ENABLED=()=>process.env.NODE_ENV!=='production'&&process.env.BOTFORGE_ENABLE_MOCK_PROVIDER==='true';

const PROVIDERS = {
  mock: { keyEnv:null, defaultModel:'botforge-mock-v1' },
  anthropic: {
    keyEnv: 'ANTHROPIC_API_KEY',
    defaultModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
    async generate({ model, system, messages, maxTokens, signal }) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal,
        headers: { 'content-type':'application/json', 'x-api-key':process.env.ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01' },
        body: JSON.stringify({ model, max_tokens:maxTokens, system, messages })
      });
      const data = await safeJson(response);
      if (!response.ok) throw providerError('Anthropic', response.status, data);
      return { text:(data.content || []).filter(x=>x.type==='text').map(x=>x.text).join(''), inputTokens:data.usage?.input_tokens || 0, outputTokens:data.usage?.output_tokens || 0 };
    }
  },
  openai: {
    keyEnv: 'OPENAI_API_KEY',
    defaultModel: process.env.OPENAI_MODEL || 'gpt-5.5',
    async generate({ model, system, messages, maxTokens, signal }) {
      const input=[{role:'system',content:[{type:'input_text',text:system}]},...messages.map(m=>({role:m.role,content:[{type:'input_text',text:m.content}]}))];
      const response = await fetch('https://api.openai.com/v1/responses', {
        method:'POST', signal,
        headers:{'content-type':'application/json', authorization:'Bearer '+process.env.OPENAI_API_KEY},
        body:JSON.stringify({model, max_output_tokens:maxTokens, input})
      });
      const data=await safeJson(response);
      if(!response.ok) throw providerError('OpenAI',response.status,data);
      const text=data.output_text || (data.output||[]).flatMap(item=>item.content||[]).filter(item=>item.type==='output_text').map(item=>item.text).join('');
      return {text, inputTokens:data.usage?.input_tokens || 0, outputTokens:data.usage?.output_tokens || 0};
    }
  },
  gemini: {
    keyEnv:'GOOGLE_GEMINI_API_KEY',
    defaultModel:process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    async generate({model,system,messages,maxTokens,signal}) {
      const url='https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent?key='+encodeURIComponent(process.env.GOOGLE_GEMINI_API_KEY);
      const contents=messages.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]}));
      const response=await fetch(url,{method:'POST',signal,headers:{'content-type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents,generationConfig:{maxOutputTokens:maxTokens}})});
      const data=await safeJson(response);
      if(!response.ok) throw providerError('Google Gemini',response.status,data);
      return {text:(data.candidates?.[0]?.content?.parts || []).map(p=>p.text || '').join(''),inputTokens:data.usageMetadata?.promptTokenCount || 0,outputTokens:data.usageMetadata?.candidatesTokenCount || 0};
    }
  }
};

async function safeJson(response) {
  try { return await response.json(); } catch (_) { return {}; }
}
function providerError(name,status,data) {
  const message=data?.error?.message || data?.message || 'The provider could not complete the request.';
  const error=new Error(name+' request failed ('+status+').');
  error.status=status;
  error.providerMessage=String(message).slice(0,300);
  return error;
}
async function generate({provider='anthropic',model,system,messages,maxTokens=1024,timeoutMs=45000}) {
  const adapter=PROVIDERS[provider];
  if(!adapter) throw new Error('Unsupported AI provider.');
  if(provider==='mock'){
    if(!MOCK_ENABLED()) throw new Error('The mock provider is disabled. Enable it only in a non-production development environment.');
    const last=[...messages].reverse().find(message=>message.role==='user');
    const prompt=String(last?.content||'').trim();
    return {text:prompt?'[BotForge mock response] I received your message: '+prompt.slice(0,500)+'\n\nThis is a local test response. Connect a real AI provider to get an actual AI-generated answer.':'[BotForge mock response] Local provider is working. Connect a real AI provider for production AI.',inputTokens:0,outputTokens:0};
  }
  const key=process.env[adapter.keyEnv];
  if(!key) throw new Error('The selected AI provider is not configured on this server.');
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try {
    return await adapter.generate({model:model || adapter.defaultModel,system,messages,maxTokens,signal:controller.signal});
  } catch(err) {
    if(err.name==='AbortError') throw new Error('The AI provider timed out. Please try again.');
    throw err;
  } finally { clearTimeout(timer); }
}
function getDefaultModel(provider='anthropic') { return PROVIDERS[provider]?.defaultModel || null; }
function isProviderConfigured(provider='anthropic') { if(provider==='mock')return MOCK_ENABLED();const keyEnv=PROVIDERS[provider]?.keyEnv;return !!keyEnv&&!!process.env[keyEnv]; }
module.exports={generate,getDefaultModel,isProviderConfigured};
