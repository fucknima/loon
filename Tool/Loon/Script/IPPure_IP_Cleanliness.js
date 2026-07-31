/* IPPure + ipapi.is IP纯净度检测
 * 内部版本：5.5；固定文件名；ipapi.is缓存6小时
 */
const P='https://my.ippure.com/v1/info';
const A=[['自动','https://api.ipapi.is/'],['新加坡','https://sg.ipapi.is/'],['德国','https://de.ipapi.is/'],['美国','https://us.ipapi.is/']];
const TTL=21600000,K='ippure_ipapi_v55_';
let title='IP纯净度检测',content='正在检测，请稍候…',htmlMessage=plain(content);
(async()=>{
  const node=nodeName();let p=null,a=null,pe='',ae='',server='',age=-1;
  try{p=await json({url:P,node:node||undefined,timeout:8000,headers:{Accept:'application/json','User-Agent':'Loon IP Checker/5.5'}},'IPPure')}catch(e){pe=msg(e)}
  const ip0=g(p,'ip',''),c=ip0?cacheGet(ip0):null;
  if(c){a=c.data;server=c.server||'缓存';age=Date.now()-c.time}
  else{const r=await api(ip0,node);a=r.data;ae=r.error;server=r.server;const x=g(a,'ip','');if(x)cacheSet(x,a,server)}
  if(!p&&!a)throw new Error('IPPure：'+(pe||'失败')+'；ipapi.is：'+(ae||'失败'));
  const r=render({node,p:p||{},a:a||{},pe,ae,server,age});title=r.title;content=r.content;htmlMessage=r.html;
})().catch(e=>{title='IP纯净度检测失败';content='错误：'+msg(e)+'\n节点：'+(nodeName()||'未知');htmlMessage=plain(content)}).finally(()=>$done({title,content,htmlMessage}));

async function api(ip,node){
  const es=[],q=ip?'?q='+encodeURIComponent(ip):'',route=ip?'DIRECT':(node||undefined);
  for(const [name,url] of A){try{const d=await json({url:url+q,node:route,timeout:5000,headers:{Accept:'application/json','User-Agent':'Loon IP Checker/5.5'}},'ipapi.is');if(!g(d,'ip',''))throw new Error(g(d,'message','未返回IP'));return{data:d,error:'',server:name}}catch(e){es.push(name+'：'+msg(e))}}
  return{data:null,error:es.join('；'),server:''};
}

function render(x){
  const p=x.p,a=x.a,hp=Object.keys(p).length>0,ha=Object.keys(a).length>0;
  const ipx=pick([[g(p,'ip',''),'IPPure'],[g(a,'ip',''),'ipapi.is']]),ip=ipx[0],v6=ip.includes(':');
  const n=Number(g(p,'fraudScore',NaN)),score=!v6&&Number.isFinite(n)?n:null;
  const res=b(g(p,'isResidential',null)),br=b(g(p,'isBroadcast',null)),dc=b(g(a,'is_datacenter',null)),vpn=b(g(a,'is_vpn',null)),proxy=b(g(a,'is_proxy',null)),tor=b(g(a,'is_tor',null)),ab=b(g(a,'is_abuser',null)),bog=b(g(a,'is_bogon',null)),mobile=b(g(a,'is_mobile',null));
  const judge=assess({score,v6,ha,dc,vpn,proxy,tor,ab,bog,br});
  const ps=hp?(v6?'基础信息正常 · IPv6不评分':'正常'):'失败'+(x.pe?' · '+short(x.pe):'');
  const as=ha?(x.age>=0?'缓存 · '+ago(x.age)+'前':'实时 · '+(x.server||'可用线路')):'失败'+(x.ae?' · '+short(x.ae):'');
  const rt=res===true?'住宅 IP':res===false?'非住宅 IP':v6?'未提供':'未知';
  const nt=br===true?'广播 / 非原生':br===false?'原生 IP':v6?'未提供':'未知';
  const pl=uniq([g(p,'country',''),g(p,'region',''),g(p,'city','')]),lo=g(a,'location',{})||{},al=uniq([g(lo,'country',''),g(lo,'state',''),g(lo,'city','')]);
  const loc=pl.length?[(flag(g(p,'countryCode',''))+' '+pl.join(' · ')).trim(),'IPPure']:al.length?[(flag(g(lo,'country_code',''))+' '+al.join(' · ')).trim(),'ipapi.is']:['未知','—'];
  const ao=g(a,'asn',{})||{},co=g(a,'company',{})||{},aa=g(ao,'asn',''),ap=g(p,'asn',''),at=type(g(ao,'type',g(co,'type','')));
  const asn=aa?['AS'+String(aa).replace(/^AS/i,'')+(at?' · '+at:''),'ipapi.is']:ap?['AS'+String(ap).replace(/^AS/i,''),'IPPure']:['未知','—'];
  const oa=g(co,'name',g(ao,'org','')),op=g(p,'asOrganization',''),org=oa?[oa,'ipapi.is']:op?[op,'IPPure']:['未知','—'];
  const pr=[[cell('住宅属性',rt,res===true?'good':res===false?'warn':'neutral'),cell('IP 属性',nt,nt==='原生 IP'?'good':nt.includes('广播')?'warn':'neutral')]];
  const ar=[[cell('机房',yn(dc),risk(dc)),cell('VPN',yn(vpn),risk(vpn))],[cell('代理',yn(proxy),risk(proxy)),cell('Tor',yn(tor),risk(tor))],[cell('滥用',yn(ab),risk(ab)),cell('移动网络',yn(mobile),mobile==null?'neutral':'info')]];
  const ds=[['出口 IP',ip,ipx[1],1],['IP 协议',v6?'IPv6':'IPv4','本地识别',0],['国家地区',loc[0],loc[1],0],['ASN',asn[0],asn[1],1],['运营商',org[0],org[1],0],['当前节点',x.node||'未知','Loon',0]];
  const now=time(),note=ha?'ipapi.is '+(x.age>=0?'缓存结果':'实时查询 · '+(x.server||'可用线路')):'ipapi.is 查询失败';
  const top=v6?`<div style="text-align:center;padding:5px 0 13px"><div style="font-size:12px;color:#8E8E93">IPv6 安全检测</div><div style="font-size:22px;font-weight:800;color:${judge.color};margin-top:7px">${esc(judge.icon+' '+judge.label)}</div><div style="font-size:12px;color:#8E8E93;margin-top:6px">主要依据 ipapi.is</div><div style="font-size:11px;color:#8E8E93;margin-top:2px">IPPure 暂不提供 IPv6 风险评分</div></div>`:`<div style="text-align:center;padding:5px 0 13px"><div style="font-size:12px;color:#8E8E93">IPPure 风险评分</div><div style="font-size:46px;font-weight:800;color:${judge.color};line-height:1.05">${score==null?'--':score}<span style="font-size:15px;font-weight:600">${score==null?' 无评分':'/100'}</span></div><div style="font-size:17px;font-weight:700;color:${judge.color};margin-top:5px">${esc(judge.icon+' '+judge.label)}</div><div style="font-size:11px;color:#8E8E93;margin-top:3px">本地综合判断 · IPPure + ipapi.is</div></div>`;
  const html=`<div style="font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif;font-size:15px;line-height:1.45;color:inherit;padding:2px 4px 4px;word-break:break-word">${top}${head('IPPure 检测',ps,hp)}${table(pr)}${head('ipapi.is 检测',as,ha)}${table(ar)}${head('基础信息','每行已标注来源',true)}<table style="width:100%;border-collapse:collapse;table-layout:fixed">${ds.map(row).join('')}</table><div style="font-size:11px;line-height:1.5;text-align:center;color:#8E8E93;margin-top:10px">${esc(note)} · 刷新 ${now}<br>综合判断由脚本本地汇总，仅供筛选</div></div>`;
  const text=['【本地综合判断】'+judge.label+'（'+(v6?'主要依据ipapi.is':'IPPure + ipapi.is')+'）','','【IPPure】','风险评分：'+(v6?'IPv6暂不评分':score==null?'未知':score+'/100'),'住宅属性：'+rt,'IP属性：'+nt,'接口状态：'+ps,'','【ipapi.is】','机房：'+yn(dc),'VPN：'+yn(vpn),'代理：'+yn(proxy),'Tor：'+yn(tor),'滥用：'+yn(ab),'移动网络：'+yn(mobile),'接口状态：'+as,'','【基础信息】',ds.map(d=>d[0]+'：'+d[1]+'（'+d[2]+'）').join('\n'),'','刷新时间：'+now].join('\n');
  return{title:'IP纯净度 · '+ip,content:text,html};
}

function assess(x){if(x.ab===true||x.tor===true||x.bog===true||(!x.v6&&x.score!=null&&x.score>=70))return{label:'风险较高',icon:'🔴',color:'#FF453A'};if(x.vpn===true||x.proxy===true||x.dc===true||x.br===true||(!x.v6&&x.score!=null&&x.score>=40))return{label:'存在风险标记',icon:'🟠',color:'#FF9F0A'};if(!x.v6&&x.score!=null&&x.score>=20)return{label:'较低风险',icon:'🟡',color:'#B89400'};if(!x.v6&&x.score!=null)return{label:'较为纯净',icon:'🟢',color:'#30A84A'};if(x.v6&&x.ha&&[x.ab,x.tor,x.bog,x.vpn,x.proxy,x.dc].every(v=>v===false))return{label:'未发现明显风险',icon:'🟢',color:'#30A84A'};return{label:'信息不足',icon:'⚪',color:'#8E8E93'}}
function head(n,s,ok){return`<table style="width:100%;border-collapse:collapse;margin:0 0 3px"><tr><td style="padding:4px 2px;font-size:14px;font-weight:750">${esc(n)}</td><td style="padding:4px 2px;text-align:right;font-size:11px;color:${ok?'#30A84A':'#FF453A'}">${esc(s)}</td></tr></table>`}
function table(rs){return'<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 11px">'+rs.map(r=>`<tr><td style="width:50%;padding:7px 4px;text-align:center;border-bottom:1px solid rgba(128,128,128,.18)">${r[0]}</td><td style="width:50%;padding:7px 4px;text-align:center;border-bottom:1px solid rgba(128,128,128,.18)">${r[1]}</td></tr>`).join('')+'</table>'}
function cell(l,t,k){const c={good:'#30A84A',warn:'#FF9F0A',bad:'#FF453A',info:'#467FCF',neutral:'#8E8E93'}[k]||'#8E8E93';return`<span style="font-size:11px;color:#8E8E93">${esc(l)}</span><br><span style="font-size:14px;font-weight:700;color:${c}">${k==='neutral'?'○':'●'} ${esc(t)}</span>`}
function row(d){const f=d[3]?"font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,monospace;":'';return`<tr><td style="width:31%;padding:8px 6px 8px 2px;border-bottom:1px solid rgba(128,128,128,.16)"><span style="color:#8E8E93">${esc(d[0])}</span><br><span style="font-size:10px;color:#467FCF">来源：${esc(d[2])}</span></td><td style="width:69%;padding:8px 2px 8px 6px;text-align:right;font-weight:600;border-bottom:1px solid rgba(128,128,128,.16);${f}">${esc(d[1])}</td></tr>`}
function json(o,s){return new Promise((ok,no)=>$httpClient.get(o,(e,r,b)=>{if(e)return no(Error(String(e)));const st=Number(r&&(r.status||r.statusCode)||0);if(st&&(st<200||st>=300))return no(Error('HTTP '+st));const raw=String(b||'').trim();if(!raw)return no(Error(s+'返回空内容'));try{const d=JSON.parse(raw);if(d&&d.error)return no(Error(String(d.error)));if(d&&d.message&&!d.ip)return no(Error(String(d.message)));ok(d)}catch(_){no(Error(s+' JSON解析失败'))}}))}
function nodeName(){try{return $environment?.params?.node?String($environment.params.node):''}catch(_){return''}}
function cacheGet(ip){try{const z=$persistentStore.read(K+key(ip));if(!z)return null;const d=JSON.parse(z);return d?.time&&d?.data&&Date.now()-Number(d.time)<=TTL?d:null}catch(_){return null}}
function cacheSet(ip,data,server){try{$persistentStore.write(JSON.stringify({time:Date.now(),data,server}),K+key(ip))}catch(_){}}
function g(o,p,f){try{let x=o;for(const k of String(p).split('.')){if(x==null)return f;x=x[k]}return x==null?f:x}catch(_){return f}}
function pick(a){for(const x of a)if(x&&x[0]!=null&&String(x[0])!=='')return x;return['未知','—']}
function b(v){return v===true||v===1||v==='1'||v==='true'?true:v===false||v===0||v==='0'||v==='false'?false:null}
function yn(v){return v===true?'是':v===false?'否':'未知'}function risk(v){return v===true?'bad':v===false?'good':'neutral'}
function uniq(a){return a.filter((x,i)=>x&&a.indexOf(x)===i)}function type(v){return({isp:'ISP',hosting:'托管/机房',business:'商业网络',education:'教育网络',government:'政府网络',banking:'金融网络'})[String(v||'').toLowerCase()]||String(v||'')}
function flag(c){c=String(c||'').toUpperCase();return/^[A-Z]{2}$/.test(c)?String.fromCodePoint(127397+c.charCodeAt(0),127397+c.charCodeAt(1)):'🌐'}
function ago(ms){const m=Math.floor(Number(ms||0)/60000);return m<1?'不足1分钟':m<60?m+'分钟':Math.floor(m/60)+'小时'}
function time(){const d=new Date(),p=n=>String(n).padStart(2,'0');return p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds())}
function key(v){return String(v||'').replace(/[^0-9a-zA-Z]/g,'_')}function short(v){v=String(v||'').replace(/\s+/g,' ');return v.length>55?v.slice(0,55)+'…':v}function msg(e){return String(e&&(e.message||e.error)||e||'未知错误')}
function esc(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function plain(t){return'<div style="font-family:-apple-system;font-size:15px;line-height:1.55">'+esc(t).replace(/\n/g,'<br>')+'</div>'}
