require('dotenv').config();
const express=require('express');
const cookieParser=require('cookie-parser');
const path=require('path');
const helmet=require('helmet');
const rateLimit=require('express-rate-limit');
if(!process.env.JWT_SECRET||process.env.JWT_SECRET.length<32){console.error('JWT_SECRET must be set to a random value of at least 32 characters.');process.exit(1);}
const {router:authRouter}=require('./auth');
const {router:botsRouter}=require('./bots');
const {router:documentsRouter}=require('./documents');
const {router:chatRouter}=require('./chat');
const app=express();
app.disable('x-powered-by');
app.set('trust proxy',process.env.TRUST_PROXY==='1'?1:false);
app.use(helmet({crossOriginResourcePolicy:{policy:'same-site'},contentSecurityPolicy:false}));
app.use(express.json({limit:'32kb'}));
app.use(cookieParser());
app.use((req,res,next)=>{
 res.setHeader('X-Request-Id',require('crypto').randomUUID());
 if(['POST','PUT','PATCH','DELETE'].includes(req.method)){
  const origin=req.get('origin');
  const host=req.get('host');
  if(origin){try{if(new URL(origin).host!==host)return res.status(403).json({error:'Request origin is not allowed.'});}catch(_){return res.status(403).json({error:'Invalid request origin.'});}}
 }
 next();
});
const apiLimiter=rateLimit({windowMs:60*1000,limit:120,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Too many requests. Please slow down.'}});
const authLimiter=rateLimit({windowMs:15*60*1000,limit:12,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Too many authentication attempts. Try again later.'}});
app.use('/api',apiLimiter);
app.use('/api/auth/login',authLimiter);
app.use('/api/auth/signup',authLimiter);
app.use('/api/auth',authRouter);
app.use('/api/bots',botsRouter);
app.use('/api/documents',documentsRouter);
app.use('/api/chat',chatRouter);
app.get('/healthz',(req,res)=>res.json({ok:true,service:'botforge-api'}));
app.use(express.static(path.join(__dirname,'..','public')));
app.get(/^(?!\/api\/).*/,(req,res)=>res.sendFile(path.join(__dirname,'..','public','index.html')));
app.use((err,req,res,next)=>{
 if(err instanceof SyntaxError&&'body' in err)return res.status(400).json({error:'Invalid JSON body.'});
 if(err&&err.code==='LIMIT_FILE_SIZE')return res.status(413).json({error:'File exceeds the 10 MB upload limit.'});
 console.error('Unhandled request error:',{message:err.message,requestId:res.getHeader('X-Request-Id')});
 res.status(500).json({error:'An unexpected server error occurred.'});
});
const PORT=process.env.PORT||3000;
const server=app.listen(PORT,()=>console.log('BotForge API listening on port '+PORT));
function shutdown(){server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
