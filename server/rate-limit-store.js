class PostgresRateLimitStore{
 constructor(namespace,query){
  if(typeof namespace!=='string'||!namespace.trim())throw new Error('A rate-limit namespace is required.');
  if(typeof query!=='function')throw new Error('A database query function is required.');
  this.namespace=namespace;this.query=query;this.windowMs=60000;
 }
 async init(options){this.windowMs=Number(options.windowMs)||60000;}
 async increment(key){
  const scopedKey=this.namespace+':'+String(key);
  await this.query('DELETE FROM botforge_rate_limits WHERE expires_at<=now() AND rate_key LIKE $1',[this.namespace+':%']);
  const result=await this.query(
   "INSERT INTO botforge_rate_limits(rate_key,window_started_at,hits,expires_at) VALUES($1,now(),1,now()+($2::double precision*interval '1 millisecond')) ON CONFLICT(rate_key) DO UPDATE SET window_started_at=CASE WHEN botforge_rate_limits.expires_at<=now() THEN now() ELSE botforge_rate_limits.window_started_at END,hits=CASE WHEN botforge_rate_limits.expires_at<=now() THEN 1 ELSE botforge_rate_limits.hits+1 END,expires_at=CASE WHEN botforge_rate_limits.expires_at<=now() THEN now()+($2::double precision*interval '1 millisecond') ELSE botforge_rate_limits.expires_at END RETURNING hits,expires_at",
   [scopedKey,this.windowMs]
  );
  return {totalHits:Number(result.rows[0].hits),resetTime:new Date(result.rows[0].expires_at)};
 }
 async decrement(key){
  await this.query('UPDATE botforge_rate_limits SET hits=GREATEST(0,hits-1) WHERE rate_key=$1',[this.namespace+':'+String(key)]);
 }
 async resetKey(key){
  await this.query('DELETE FROM botforge_rate_limits WHERE rate_key=$1',[this.namespace+':'+String(key)]);
 }
 async shutdown(){}
}
module.exports={PostgresRateLimitStore};
