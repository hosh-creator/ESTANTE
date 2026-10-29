(function(){
'use strict';
const CFG=window.ESTANTE_CONFIG||{};
const configured=!!(CFG.SUPABASE_URL&&CFG.SUPABASE_ANON_KEY&&CFG.SUPABASE_URL.indexOf('SEU-PROJETO')<0&&CFG.SUPABASE_ANON_KEY.indexOf('COLE-AQUI')<0);
const sb=(configured&&window.supabase)?window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY,{auth:{flowType:'pkce',persistSession:true,detectSessionInUrl:true}}):null;
const $app=document.getElementById('app');

const WARN={none:'Sem avisos aplicáveis',skip:'Escolhi não avisar',violence:'Violência gráfica',death:'Morte de personagem principal',sexviolence:'Violência sexual / não consensual',minors:'Menores de idade em contexto sexual'};
const RATE=[['G','Geral'],['T','Adolescentes'],['M','Maduro'],['E','Explícito'],['NR','Sem classificação']];
const STAT=[['wip','Em andamento'],['done','Completa'],['hiatus','Em hiato']];
const rateName=c=>(RATE.find(r=>r[0]===c)||RATE[4])[1];
const statName=c=>(STAT.find(r=>r[0]===c)||STAT[0])[1];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const S={user:null,name:'',authReady:false,works:[],f:{q:'',rating:'',status:'',tag:'',hide:[],sort:'recent'},
  form:null,confirm:null,ack:{},cur:null,tok:0,saving:false,authMode:'in',authMsg:'',next:null,r:null};

/* ---------- utilidades ---------- */
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=n=>(n||0).toLocaleString('pt-BR');
const dt=t=>t?new Date(t).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'}):'';
const dtt=t=>t?new Date(t).toLocaleString('pt-BR',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
const H=p=>'#/'+p;
const go=p=>{location.hash=H(p)};
function lsGet(k,d){try{const v=localStorage.getItem(k);return v==null?d:v}catch(e){return d}}
function lsSet(k,v){try{localStorage.setItem(k,v)}catch(e){}}
async function q(p){const r=await p;if(r.error)throw r.error;return r.data}

/* texto simples: parágrafos, *itálico*, **negrito**, *** = quebra de cena */
function fmtText(t){
  return esc(t||'').replace(/\r/g,'').split(/\n{2,}/).filter(p=>p.trim()).map(p=>{
    const k=p.trim();if(k==='***'||k==='---'||k==='* * *')return '<hr>';
    return '<p>'+p.replace(/\n/g,'<br>').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g,'$1<em>$2</em>')+'</p>';
  }).join('');
}
/* HTML: sempre limpo antes de mostrar */
if(window.DOMPurify){window.DOMPurify.addHook('afterSanitizeAttributes',n=>{if(n.tagName==='A'){n.setAttribute('target','_blank');n.setAttribute('rel','noopener noreferrer')}})}
function cleanHtml(h){
  if(!window.DOMPurify)return '<p>'+esc(h)+'</p>';
  return window.DOMPurify.sanitize(h||'',{FORBID_TAGS:['style','form','input','button','textarea','select','iframe','object','embed','link','meta'],FORBID_ATTR:['style','srcset']});
}
const renderBody=(body,format)=>format==='html'?cleanHtml(body):fmtText(body);
function wordsOf(body,format){
  let t=body||'';
  if(format==='html')t=new DOMParser().parseFromString(t,'text/html').body.textContent||'';
  return (t.trim().match(/\S+/g)||[]).length;
}

/* ---------- rotas ---------- */
function route(){
  const p=location.hash.replace(/^#\/?/,'').split('/');
  switch(p[0]){
    case '':case 'obras':return{v:'home'};
    case 'minhas':return{v:'home',mine:true};
    case 'escrever':return{v:'new'};
    case 'entrar':return{v:'auth'};
    case 'nova-senha':return{v:'reset'};
    case 'obra':return p[2]?{v:'chapter',id:p[1],n:+p[2]}:{v:'work',id:p[1]};
    case 'editar':return{v:'edit',id:p[1]};
    case 'novocap':return{v:'newchap',id:p[1]};
    case 'editcap':return{v:'editchap',id:p[1],n:+p[2]};
  }
  return{v:'home'};
}

/* ---------- dados ---------- */
async function loadWorks(){
  const d=await q(sb.from('works').select('*,profiles(name),chapters(words,likes(count))').order('updated_at',{ascending:false}));
  return d.map(w=>Object.assign({},w,{
    author:(w.profiles&&w.profiles.name)||'Autor(a)',nch:w.chapters.length,
    words:w.chapters.reduce((a,c)=>a+(c.words||0),0),
    likes:w.chapters.reduce((a,c)=>a+((c.likes&&c.likes[0]&&c.likes[0].count)||0),0)}));
}
async function loadWork(id){
  if(!UUID.test(id||''))return null;
  const w=await q(sb.from('works').select('*,profiles(name)').eq('id',id).maybeSingle());
  if(!w)return null;
  w.author=(w.profiles&&w.profiles.name)||'Autor(a)';
  w.chs=await q(sb.from('chapters').select('id,position,title,words,created_at,likes(count)').eq('work_id',id).order('position'));
  return w;
}
const isMine=w=>!!(S.user&&w&&w.author_id===S.user.id);
const allTags=()=>{const m={};S.works.forEach(w=>(w.tags||[]).forEach(t=>{const k=t.toLowerCase();(m[k]=m[k]||{t,n:0}).n++}));return Object.values(m).sort((a,b)=>b.n-a.n)};
const touchWork=id=>sb.from('works').update({updated_at:new Date().toISOString()}).eq('id',id);

/* ---------- peças ---------- */
const ratingChip=c=>'<span class="rt r-'+esc(c)+'" title="'+esc(rateName(c))+'">'+esc(c)+'</span>';
function warnPills(w){
  const out=[];
  (w.warnings||[]).forEach(k=>{if(WARN[k])out.push('<li class="pill'+(k==='none'||k==='skip'?'':' bad')+'">'+esc(WARN[k])+'</li>')});
  (w.extra_warnings||[]).forEach(t=>out.push('<li class="pill warn">'+esc(t)+'</li>'));
  return '<ul class="pills">'+out.join('')+'</ul>';
}
const tagList=w=>'<ul class="tags">'+(w.tags||[]).map(t=>'<li><button class="tag" data-action="tag" data-tag="'+esc(t)+'">'+esc(t)+'</button></li>').join('')+'</ul>';
const loading=()=>'<p class="muted">Carregando…</p>';
const notFound=()=>'<div class="empty"><h2>Não encontramos isso</h2><p class="muted">A obra pode ter sido removida.</p><a class="btn" href="#/obras">Voltar para a estante</a></div>';
const needLogin=msg=>{S.next=location.hash;return '<div class="empty"><h2>'+esc(msg)+'</h2><p class="muted">Entre com seu e-mail e senha para continuar.</p><a class="btn pri" href="#/entrar">Entrar ou criar conta</a></div>'};
function shell(inner,r){
  const on=k=>(k==='obras'&&r.v==='home'&&!r.mine)||(k==='minhas'&&r.mine)||(k==='escrever'&&r.v==='new')?' class="on"':'';
  const who=S.user?'<span class="who"><span>Olá, <strong>'+esc(S.name||S.user.email)+'</strong></span><button class="btn sm" data-action="logout">Sair</button></span>':'<span class="who"><a class="btn sm pri" href="#/entrar">Entrar</a></span>';
  return '<header class="top"><a class="brand" href="#/obras"><svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><rect x="3" y="7" width="6" height="19" rx="1" fill="var(--accent)"/><rect x="11" y="3" width="6" height="23" rx="1" fill="var(--ink)"/><rect x="19" y="9" width="6" height="17" rx="1" fill="var(--accent)" opacity=".55"/><rect x="1" y="26" width="28" height="2" fill="var(--ink)"/></svg><span>Estante</span></a>'+
   '<nav><a href="#/obras"'+on('obras')+'>Todas as obras</a>'+(S.user?'<a href="#/minhas"'+on('minhas')+'>Minhas obras</a><a href="#/escrever"'+on('escrever')+'>Nova obra</a>':'')+'</nav>'+who+'</header><main class="wrap">'+inner+'</main>';
}
function setupHtml(){
  return '<div class="card paper stack"><h1>Falta configurar</h1><p>Abra o arquivo <code>config.js</code> e cole a URL e a chave anon do seu projeto Supabase. O passo a passo está no <code>README.md</code>.</p>'+(window.supabase?'':'<p class="err">A biblioteca do Supabase não carregou. Verifique a conexão.</p>')+'</div>';
}

/* ---------- home ---------- */
function filtered(r){
  const f=S.f,k=f.q.trim().toLowerCase();
  const a=S.works.filter(w=>{
    if(r.mine&&!isMine(w))return false;
    if(f.rating&&w.rating!==f.rating)return false;
    if(f.status&&w.status!==f.status)return false;
    if(f.tag&&!(w.tags||[]).some(t=>t.toLowerCase()===f.tag.toLowerCase()))return false;
    if(f.hide.length&&(w.warnings||[]).some(x=>f.hide.includes(x)))return false;
    if(k){const hay=[w.title,w.fandom,w.summary,w.author].concat(w.tags||[],w.extra_warnings||[]).join(' ').toLowerCase();if(!hay.includes(k))return false}
    return true;
  });
  const s=f.sort;
  a.sort((x,y)=>s==='title'?String(x.title).localeCompare(y.title,'pt-BR'):s==='words'?y.words-x.words:s==='likes'?y.likes-x.likes:new Date(y.updated_at)-new Date(x.updated_at));
  return a;
}
function blurb(w){
  return '<article class="work"><div class="key">'+ratingChip(w.rating)+'<span class="rt r-NR" title="Capítulos">'+num(w.nch)+'</span><span class="stc'+(w.status==='done'?' done':'')+'">'+esc(statName(w.status))+'</span></div><div>'+
  '<h3><a href="#/obra/'+w.id+'">'+esc(w.title)+'</a> <span class="by">por '+esc(w.author)+'</span></h3>'+
  (w.fandom?'<p class="fandom">'+esc(w.fandom)+'</p>':'')+warnPills(w)+tagList(w)+
  (w.summary?'<p class="summary">'+esc(w.summary)+'</p>':'')+
  '<p class="stats"><span>Capítulos: '+num(w.nch)+'</span><span>Palavras: '+num(w.words)+'</span><span>♥ '+num(w.likes)+'</span><span>Atualizada em '+esc(dt(w.updated_at))+'</span></p></div></article>';
}
function listHtml(r){
  const a=filtered(r);
  if(!S.works.length)return '<div class="empty"><h2>A estante está vazia</h2><p class="muted">Nenhuma obra foi publicada ainda.</p>'+(S.user?'<a class="btn pri" href="#/escrever">Publicar uma obra</a>':'<a class="btn pri" href="#/entrar">Entrar para publicar</a>')+'</div>';
  if(!a.length)return '<div class="empty"><h2>Nada com esses filtros</h2><p class="muted">Tente tirar alguns filtros.</p><button class="btn" data-action="clear">Limpar filtros</button></div>';
  return a.map(blurb).join('');
}
async function homeView(r){
  if(r.mine&&!S.user)return needLogin('Entre para ver suas obras');
  S.works=await loadWorks();
  const f=S.f,tags=allTags().slice(0,24);
  const sel=(o,cur,any)=>'<option value="">'+any+'</option>'+o.map(x=>'<option value="'+x[0]+'"'+(cur===x[0]?' selected':'')+'>'+esc(x[1])+'</option>').join('');
  const so=(v,l)=>'<option value="'+v+'"'+(f.sort===v?' selected':'')+'>'+l+'</option>';
  return '<div class="cols"><aside class="side"><h2>Filtrar</h2>'+
   '<label>Buscar<input type="text" data-filter="q" value="'+esc(f.q)+'" placeholder="título, autor, tag…"></label>'+
   '<label>Classificação<select data-filter="rating">'+sel(RATE,f.rating,'Todas')+'</select></label>'+
   '<label>Situação<select data-filter="status">'+sel(STAT,f.status,'Todas')+'</select></label>'+
   '<label>Ordenar por<select data-filter="sort">'+so('recent','Atualizadas há pouco')+so('title','Título')+so('words','Mais palavras')+so('likes','Mais curtidas')+'</select></label>'+
   '<div><h2 style="margin-bottom:8px">Ocultar obras com</h2><div class="checks">'+['violence','death','sexviolence','minors'].map(k=>'<label><input type="checkbox" data-hide="'+k+'"'+(f.hide.includes(k)?' checked':'')+'>'+esc(WARN[k])+'</label>').join('')+'</div></div>'+
   (tags.length?'<div><h2 style="margin-bottom:8px">Tags mais usadas</h2><div class="cloud">'+tags.map(t=>'<button class="tag'+(f.tag.toLowerCase()===t.t.toLowerCase()?' on':'')+'" data-action="tag" data-tag="'+esc(t.t)+'">'+esc(t.t)+' · '+t.n+'</button>').join('')+'</div></div>':'')+
   '<button class="btn" data-action="clear">Limpar filtros</button></aside>'+
   '<section><div class="head"><h1>'+(r.mine?'Minhas obras':'Todas as obras')+'</h1><span class="muted" id="count"></span></div><div id="list"></div></section></div>';
}
function paintList(){
  const r=S.r,l=document.getElementById('list');if(!l)return;
  l.innerHTML=listHtml(r);
  const c=document.getElementById('count');
  if(c)c.textContent=num(filtered(r).length)+' de '+num(S.works.filter(w=>!r.mine||isMine(w)).length)+' obras';
}

/* ---------- obra e capítulo ---------- */
function needsGate(w){const safe=(w.warnings||[]).length===1&&w.warnings[0]==='none'&&!(w.extra_warnings||[]).length&&['G','T','NR'].includes(w.rating);return !safe}
const likesOf=c=>(c.likes&&c.likes[0]&&c.likes[0].count)||0;
async function workView(r){
  const w=await loadWork(r.id);if(!w)return notFound();
  S.cur={w};
  const mine=isMine(w),key='w:'+w.id,chs=w.chs;
  const words=chs.reduce((a,c)=>a+(c.words||0),0),likes=chs.reduce((a,c)=>a+likesOf(c),0);
  const list=!chs.length?'<p class="muted">Ainda não há capítulos.'+(mine?' Adicione o primeiro.':'')+'</p>':
   '<ol class="chlist">'+chs.map((c,i)=>'<li><span><a class="ti" href="#/obra/'+w.id+'/'+(i+1)+'">'+(i+1)+'. '+esc(c.title||'Capítulo '+(i+1))+'</a> <span class="muted">· '+num(c.words)+' palavras · ♥ '+num(likesOf(c))+' · '+esc(dt(c.created_at))+'</span></span>'+
   (mine?'<span class="row"><button class="btn sm" data-action="move" data-i="'+i+'" data-dir="-1" '+(i===0?'disabled':'')+' aria-label="Subir">↑</button><button class="btn sm" data-action="move" data-i="'+i+'" data-dir="1" '+(i===chs.length-1?'disabled':'')+' aria-label="Descer">↓</button><a class="btn sm" href="#/editcap/'+w.id+'/'+(i+1)+'">Editar</a><button class="btn sm dng" data-action="delchap" data-id="'+c.id+'">'+(S.confirm==='c:'+c.id?'Confirmar exclusão':'Excluir')+'</button></span>':'')+'</li>').join('')+'</ol>';
  return '<div class="stack"><div class="paper"><p class="muted" style="margin:0 0 8px"><a href="#/obras">← Todas as obras</a></p><h1>'+esc(w.title)+'</h1><p style="margin:4px 0 0">por <strong>'+esc(w.author)+'</strong></p>'+
   '<dl class="meta"><dt>Classificação</dt><dd>'+ratingChip(w.rating)+' '+esc(rateName(w.rating))+'</dd><dt>Avisos</dt><dd>'+warnPills(w)+'</dd>'+
   (w.fandom?'<dt>Universo</dt><dd>'+esc(w.fandom)+'</dd>':'')+
   ((w.tags||[]).length?'<dt>Tags</dt><dd>'+tagList(w)+'</dd>':'')+
   '<dt>Situação</dt><dd>'+esc(statName(w.status))+'</dd><dt>Publicada</dt><dd>'+esc(dt(w.created_at))+'</dd><dt>Atualizada</dt><dd>'+esc(dt(w.updated_at))+'</dd><dt>Tamanho</dt><dd>'+num(chs.length)+(chs.length===1?' capítulo':' capítulos')+' · '+num(words)+' palavras · ♥ '+num(likes)+'</dd></dl>'+
   '<div class="row">'+(chs.length?'<a class="btn pri" href="#/obra/'+w.id+'/1">Começar a ler</a>':'')+(mine?'<a class="btn" href="#/novocap/'+w.id+'">Adicionar capítulos</a><a class="btn" href="#/editar/'+w.id+'">Editar obra</a>':'')+(mine?'<button class="btn dng" data-action="delwork" data-id="'+w.id+'">'+(S.confirm===key?'Confirmar exclusão da obra':'Excluir obra')+'</button>':'')+'</div></div>'+
   (w.summary?'<div class="paper"><h2 style="font-size:17px;margin-bottom:8px">Resumo</h2><div class="prose small">'+fmtText(w.summary)+'</div></div>':'')+
   (w.notes?'<div class="paper"><h2 style="font-size:17px;margin-bottom:8px">Notas da autoria</h2><div class="prose small">'+fmtText(w.notes)+'</div></div>':'')+
   '<div class="paper"><h2 style="font-size:17px;margin-bottom:10px">Capítulos</h2>'+list+'</div></div>';
}
function likeHtml(){
  const c=S.cur;
  return '<button class="btn'+(c.liked?' on':'')+'" data-action="like" aria-pressed="'+(c.liked?'true':'false')+'"><span class="heart">'+(c.liked?'♥':'♡')+'</span> '+(c.liked?'Curtido':'Curtir')+' · '+num(c.nlikes)+'</button>'+(S.user?'':'<span class="muted"><a href="#/entrar">Entre</a> para curtir</span>');
}
function commentsHtml(){
  const c=S.cur;
  const items=c.cms.map(m=>{
    const can=S.user&&(m.user_id===S.user.id||isMine(c.w));
    return '<div class="cm"><header><strong>'+esc((m.profiles&&m.profiles.name)||'Alguém')+'</strong><span>'+esc(dtt(m.created_at))+'</span>'+(can?'<button class="btn sm" data-action="delcm" data-id="'+m.id+'">'+(S.confirm==='m:'+m.id?'Confirmar':'Apagar')+'</button>':'')+'</header><p>'+esc(m.body)+'</p></div>';
  }).join('');
  const form=S.user?'<form id="cmform" class="stack"><label class="f" for="cm-body" style="font-weight:600;font-size:14px">Seu comentário</label><textarea id="cm-body" maxlength="2000" required></textarea><div class="row"><button class="btn pri" type="submit" id="cm-send">Comentar</button><span class="err" id="cm-err" role="alert"></span></div></form>':'<p class="muted"><a href="#/entrar">Entre</a> para comentar.</p>';
  return '<h2>Comentários ('+c.cms.length+')</h2>'+(items||'<p class="muted">Ainda não há comentários.</p>')+'<div style="margin-top:14px">'+form+'</div>';
}
async function chapterView(r){
  const w=await loadWork(r.id);if(!w)return notFound();
  if(needsGate(w)&&!S.ack[w.id]){
    S.cur={w};
    return '<div class="gate paper"><h1>Antes de continuar</h1><p>Esta obra tem classificação <strong>'+esc(rateName(w.rating))+'</strong> e os seguintes avisos:</p>'+warnPills(w).replace('class="pills"','class="pills" style="justify-content:center;margin:12px 0 18px"')+'<div class="row" style="justify-content:center"><button class="btn pri" data-action="ack" data-id="'+w.id+'">Entendi, continuar</button><a class="btn" href="#/obra/'+w.id+'">Voltar</a></div></div>';
  }
  const meta=w.chs[r.n-1];
  if(!meta)return '<div class="empty"><h2>Capítulo não encontrado</h2><a class="btn" href="#/obra/'+w.id+'">Voltar para a obra</a></div>';
  const [c,lk,cms]=await Promise.all([
    q(sb.from('chapters').select('*').eq('id',meta.id).single()),
    q(sb.from('likes').select('user_id').eq('chapter_id',meta.id)),
    q(sb.from('comments').select('id,body,created_at,user_id,profiles(name)').eq('chapter_id',meta.id).order('created_at'))]);
  S.cur={w,c,n:r.n,nlikes:lk.length,liked:!!(S.user&&lk.some(l=>l.user_id===S.user.id)),cms};
  const chs=w.chs;
  const nav='<nav class="chnav"><span>'+(r.n>1?'<a class="btn" href="#/obra/'+w.id+'/'+(r.n-1)+'">← Anterior</a>':'')+'</span><span class="row"><a class="btn" href="#/obra/'+w.id+'">Sobre a obra</a><select data-jump="'+w.id+'" aria-label="Ir para capítulo">'+chs.map((x,i)=>'<option value="'+(i+1)+'"'+(i+1===r.n?' selected':'')+'>'+(i+1)+'. '+esc(x.title||'Capítulo '+(i+1))+'</option>').join('')+'</select></span><span>'+(r.n<chs.length?'<a class="btn" href="#/obra/'+w.id+'/'+(r.n+1)+'">Próximo →</a>':'')+'</span></nav>';
  return '<div class="reader"><div class="row" style="justify-content:space-between"><span class="muted">'+esc(w.title)+' · por '+esc(w.author)+'</span><span class="row"><button class="btn sm" data-action="fs" data-d="-1" aria-label="Diminuir letra">A−</button><button class="btn sm" data-action="fs" data-d="1" aria-label="Aumentar letra">A+</button></span></div>'+nav+
   '<h1>'+r.n+'. '+esc(c.title||'Capítulo '+r.n)+'</h1>'+
   (c.notes_start?'<div class="note"><strong>Notas</strong><div class="prose small">'+fmtText(c.notes_start)+'</div></div>':'')+
   '<div class="prose">'+renderBody(c.body,c.format)+'</div>'+
   (c.notes_end?'<div class="note"><strong>Notas finais</strong><div class="prose small">'+fmtText(c.notes_end)+'</div></div>':'')+
   '<div class="likebar" id="likebar">'+likeHtml()+'</div>'+nav+
   '<section class="paper comments" id="cm">'+commentsHtml()+'</section></div>';
}

/* ---------- login ---------- */
function authHtml(){
  const m=S.authMode;
  const title=m==='in'?'Entrar':m==='up'?'Criar conta':'Recuperar senha';
  const tabs='<div class="tabs"><button class="btn sm'+(m==='in'?' on':'')+'" data-action="authmode" data-m="in">Entrar</button><button class="btn sm'+(m==='up'?' on':'')+'" data-action="authmode" data-m="up">Criar conta</button></div>';
  return '<div class="card paper"><h1 style="margin-bottom:14px">'+title+'</h1>'+(m==='forgot'?'':tabs)+
   '<form id="authform" novalidate>'+
   (m==='up'?'<label>Nome que aparece nas obras<input type="text" id="a-name" maxlength="40" autocomplete="nickname"></label>':'')+
   '<label>E-mail<input type="email" id="a-email" autocomplete="email"></label>'+
   (m==='forgot'?'':'<label>Senha<input type="password" id="a-pass" autocomplete="'+(m==='up'?'new-password':'current-password')+'" minlength="6"></label>')+
   (m==='up'?'<label>Código de convite <span class="hint muted" style="font-weight:400">Se quem criou a estante te passou um.</span><input type="text" id="a-invite" autocomplete="off"></label>':'')+
   '<div class="err" id="a-err" role="alert"></div><div class="ok" id="a-ok" role="status">'+esc(S.authMsg)+'</div>'+
   '<button class="btn pri" type="submit" id="a-go">'+(m==='in'?'Entrar':m==='up'?'Criar conta':'Enviar link por e-mail')+'</button>'+
   (m==='in'?'<button type="button" class="btn sm" data-action="authmode" data-m="forgot" style="align-self:flex-start">Esqueci a senha</button>':'')+
   (m==='forgot'?'<button type="button" class="btn sm" data-action="authmode" data-m="in" style="align-self:flex-start">Voltar</button>':'')+
   '</form></div>';
}
const AERR=[['Invalid login credentials','E-mail ou senha incorretos.'],['Email not confirmed','Confirme seu e-mail antes de entrar. Procure o link na caixa de entrada.'],['already registered','Este e-mail já tem conta. Use "Entrar".'],['at least','A senha precisa ter pelo menos 6 caracteres.'],['Database error','Não foi possível criar a conta. Confira o código de convite.'],['rate limit','Muitas tentativas. Espere um pouco e tente de novo.'],['valid email','Digite um e-mail válido.']];
const aerr=e=>{const m=(e&&e.message)||'';const h=AERR.find(x=>m.indexOf(x[0])>=0);return h?h[1]:'Algo deu errado: '+m};
async function doAuth(){
  const m=S.authMode,err=document.getElementById('a-err'),ok=document.getElementById('a-ok'),btn=document.getElementById('a-go');
  const v=id=>{const e=document.getElementById(id);return e?e.value.trim():''};
  const email=v('a-email'),pass=document.getElementById('a-pass')?document.getElementById('a-pass').value:'';
  err.textContent='';ok.textContent='';
  if(!email){err.textContent='Digite seu e-mail.';return}
  if(m!=='forgot'&&!pass){err.textContent='Digite sua senha.';return}
  if(m==='up'&&!v('a-name')){err.textContent='Digite o nome que vai aparecer nas obras.';return}
  btn.disabled=true;
  try{
    if(m==='in'){const {error}=await sb.auth.signInWithPassword({email,password:pass});if(error)throw error;const n=S.next;S.next=null;location.hash=n||H('obras');render()}
    else if(m==='up'){
      const {data,error}=await sb.auth.signUp({email,password:pass,options:{data:{name:v('a-name'),invite:v('a-invite')},emailRedirectTo:location.origin+location.pathname}});
      if(error)throw error;
      if(data.session){const n=S.next;S.next=null;location.hash=n||H('obras')}
      else ok.textContent='Conta criada. Enviamos um e-mail para confirmar o endereço. Depois é só entrar.';
    }else{
      const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
      if(error)throw error;ok.textContent='Se esse e-mail tiver conta, o link de recuperação foi enviado.';
    }
  }catch(e){err.textContent=aerr(e)}
  btn.disabled=false;
}
function resetHtml(){
  return '<div class="card paper"><h1 style="margin-bottom:14px">Nova senha</h1><form id="resetform" novalidate><label>Nova senha<input type="password" id="r-pass" minlength="6" autocomplete="new-password"></label><div class="err" id="a-err" role="alert"></div><button class="btn pri" type="submit">Salvar senha</button></form></div>';
}

/* ---------- formulários ---------- */
const chipsHtml=k=>S.form[k].map((t,i)=>'<span class="chip">'+esc(t)+'<button type="button" data-action="rmchip" data-kind="'+k+'" data-i="'+i+'" aria-label="Remover '+esc(t)+'">×</button></span>').join('');
function paintChips(){['tags','extra'].forEach(k=>{const e=document.getElementById('chips-'+k);if(e)e.innerHTML=chipsHtml(k)})}
function paintWarns(){const e=document.getElementById('warns');if(!e)return;e.innerHTML=Object.keys(WARN).map(k=>'<label><input type="checkbox" data-warn="'+k+'"'+(S.form.warnings.includes(k)?' checked':'')+'>'+esc(WARN[k])+'</label>').join('')}
function addChip(kind,val){
  val=val.replace(/\s+/g,' ').trim().replace(/,+$/,'').trim();if(!val)return;
  const a=S.form[kind];
  if(a.length<30&&!a.some(x=>x.toLowerCase()===val.toLowerCase()))a.push(val.slice(0,60));
  paintChips();
}
async function workForm(r){
  if(!S.user)return needLogin('Entre para publicar');
  let w=null;
  if(r.v==='edit'){w=await loadWork(r.id);if(!w||!isMine(w))return notFound()}
  if(!S.works.length)try{S.works=await loadWorks()}catch(e){}
  S.cur={w};
  S.form=w?{title:w.title,fandom:w.fandom,rating:w.rating,status:w.status,warnings:(w.warnings||[]).slice(),extra:(w.extra_warnings||[]).slice(),tags:(w.tags||[]).slice(),summary:w.summary,notes:w.notes}
    :{title:'',fandom:'',rating:'NR',status:'wip',warnings:[],extra:[],tags:[],summary:'',notes:''};
  const f=S.form,opts=(l,c)=>l.map(o=>'<option value="'+o[0]+'"'+(c===o[0]?' selected':'')+'>'+esc(o[1])+'</option>').join('');
  return '<form class="form" id="wform" novalidate><h1>'+(w?'Editar obra':'Nova obra')+'</h1>'+
   '<section><h2>Sobre a obra</h2><label class="f">Título<input type="text" id="f-title" data-f="title" maxlength="150" value="'+esc(f.title)+'"></label>'+
   '<label class="f">Universo ou fandom <span class="hint">Opcional. Pode ser original.</span><input type="text" id="f-fandom" data-f="fandom" maxlength="120" value="'+esc(f.fandom)+'"></label>'+
   '<div class="two"><label class="f">Classificação<select id="f-rating" data-f="rating">'+opts(RATE,f.rating)+'</select></label><label class="f">Situação<select id="f-status" data-f="status">'+opts(STAT,f.status)+'</select></label></div></section>'+
   '<section><h2>Avisos de conteúdo</h2><div class="checks" id="warns"></div>'+
   '<label class="f">Avisos próprios <span class="hint">Escreva e aperte Enter. Ex.: luto, abuso de álcool, aranhas.</span><div class="chipbox"><span id="chips-extra" style="display:contents"></span><input type="text" id="in-extra" data-chip="extra" maxlength="60" placeholder="adicionar aviso"></div></label></section>'+
   '<section><h2>Tags</h2><label class="f">Tags próprias <span class="hint">Escreva e aperte Enter ou vírgula. Sugestões vêm das tags que já existem.</span><div class="chipbox"><span id="chips-tags" style="display:contents"></span><input type="text" id="in-tags" data-chip="tags" list="dl-tags" maxlength="60" placeholder="adicionar tag"></div></label><datalist id="dl-tags">'+allTags().map(t=>'<option value="'+esc(t.t)+'">').join('')+'</datalist></section>'+
   '<section><h2>Resumo e notas</h2><label class="f">Resumo<textarea id="f-summary" data-f="summary" maxlength="3000">'+esc(f.summary)+'</textarea></label><label class="f">Notas da autoria <span class="hint">Opcional. Aparecem na página da obra.</span><textarea id="f-notes" data-f="notes" maxlength="3000">'+esc(f.notes)+'</textarea></label></section>'+
   '<div class="err" id="err" role="alert"></div><div class="sticky-actions"><button type="submit" class="btn pri" id="save">'+(w?'Salvar alterações':'Criar obra e adicionar capítulos')+'</button><a class="btn" href="#/'+(w?'obra/'+w.id:'obras')+'">Cancelar</a></div></form>';
}
async function saveWork(){
  const f=S.form,err=document.getElementById('err'),btn=document.getElementById('save'),w=S.r.v==='edit'?S.cur.w:null;
  if(!f.title.trim()){err.textContent='Dê um título para a obra.';return}
  if(!f.warnings.length){err.textContent='Escolha ao menos um aviso. Se não houver, marque "Sem avisos aplicáveis".';return}
  if(S.saving)return;S.saving=true;btn.disabled=true;err.textContent='';
  const row={title:f.title.trim(),fandom:f.fandom.trim(),rating:f.rating,status:f.status,warnings:f.warnings,extra_warnings:f.extra,tags:f.tags,summary:f.summary.trim(),notes:f.notes.trim()};
  try{
    if(w){await q(sb.from('works').update(Object.assign(row,{updated_at:new Date().toISOString()})).eq('id',w.id));go('obra/'+w.id)}
    else{const d=await q(sb.from('works').insert(Object.assign(row,{author_id:S.user.id})).select('id').single());go('novocap/'+d.id)}
  }catch(e){err.textContent='Não foi possível salvar: '+((e&&e.message)||'erro')+'.';btn.disabled=false}
  S.saving=false;
}

const FMT_HINT={text:'Linha em branco separa parágrafos. *itálico*, **negrito** e *** em linha própria (quebra de cena).',html:'HTML aceito: <p>, <em>, <strong>, <h2>, <blockquote>, <hr>, <a>… Scripts e estilos são removidos.'};
function chFormInner(){
  const f=S.form,b=f.batch;
  const up='<div class="drop"><strong style="font-size:14px">Subir arquivos de capítulo</strong><span class="hint muted" style="font-size:13px">Aceita .txt, .md, .html e .docx. Com um arquivo, o texto vai para o editor. Com vários, cada arquivo vira um capítulo, na ordem dos nomes.</span><input type="file" id="f-file" accept=".txt,.md,.html,.htm,.docx" '+(S.r.v==='editchap'?'':'multiple')+'><span class="err" id="f-ferr" role="alert"></span></div>';
  if(b)return up+'<div><strong>'+b.length+' capítulos prontos para publicar:</strong><ol class="batch">'+b.map(x=>'<li>'+esc(x.title||'(sem título)')+' <span class="muted">· '+(x.format==='html'?'HTML':'texto')+' · '+num(wordsOf(x.body,x.format))+' palavras</span></li>').join('')+'</ol><button type="button" class="btn sm" data-action="cancelbatch" style="margin-top:8px">Cancelar lote</button></div>';
  return '<label class="f">Título do capítulo <span class="hint">Opcional.</span><input type="text" id="f-title" data-f="title" maxlength="150" value="'+esc(f.title)+'"></label>'+
   '<label class="f">Notas antes do texto <span class="hint">Opcional.</span><textarea id="f-ns" data-f="ns" maxlength="3000" style="min-height:60px">'+esc(f.ns)+'</textarea></label>'+
   '<div class="two"><label class="f">Formato do texto<select id="f-format" data-f="format"><option value="text"'+(f.format==='text'?' selected':'')+'>Texto normal (com itálico e negrito)</option><option value="html"'+(f.format==='html'?' selected':'')+'>HTML</option></select></label></div>'+
   '<div class="toolbar" role="toolbar" aria-label="Formatação"><button type="button" class="btn sm" data-action="wrap" data-k="b"><strong>N</strong> Negrito</button><button type="button" class="btn sm" data-action="wrap" data-k="i"><em>I</em> Itálico</button><button type="button" class="btn sm" data-action="wrap" data-k="hr">Quebra de cena</button><button type="button" class="btn sm" data-action="preview">Prévia</button></div>'+
   '<textarea class="body-ta" id="f-body" data-f="body" aria-label="Texto do capítulo">'+esc(f.body)+'</textarea><span class="hint muted" id="fmt-hint" style="font-size:13px">'+esc(FMT_HINT[f.format])+'</span>'+
   '<div class="preview prose" id="preview" hidden></div><span class="muted" id="wcount">'+num(wordsOf(f.body,f.format))+' palavras</span>'+up+
   '<label class="f">Notas finais <span class="hint">Opcional.</span><textarea id="f-ne" data-f="ne" maxlength="3000" style="min-height:60px">'+esc(f.ne)+'</textarea></label>';
}
function paintChForm(){const h=document.getElementById('chhost');if(h)h.innerHTML=chFormInner();const s=document.getElementById('save');if(s&&S.form.batch)s.textContent='Publicar '+S.form.batch.length+' capítulos'}
async function chapForm(r){
  if(!S.user)return needLogin('Entre para publicar');
  const w=await loadWork(r.id);if(!w||!isMine(w))return notFound();
  let c=null;
  if(r.v==='editchap'){const m=w.chs[r.n-1];if(!m)return notFound();c=await q(sb.from('chapters').select('*').eq('id',m.id).single())}
  S.cur={w,c};
  S.form={title:c?c.title:'',body:c?c.body:'',format:c?c.format:'text',ns:c?c.notes_start:'',ne:c?c.notes_end:'',batch:null};
  return '<form class="form" id="cform" novalidate><div><p class="muted" style="margin:0 0 6px"><a href="#/obra/'+w.id+'">← '+esc(w.title)+'</a></p><h1>'+(c?'Editar capítulo '+r.n:'Novo capítulo')+'</h1></div><section id="chhost">'+chFormInner()+'</section>'+
   '<div class="err" id="err" role="alert"></div><div class="sticky-actions"><button type="submit" class="btn pri" id="save">'+(c?'Salvar capítulo':'Publicar capítulo')+'</button><a class="btn" href="#/obra/'+w.id+'">Cancelar</a></div></form>';
}
async function readFile(file){
  const ext=(file.name.split('.').pop()||'').toLowerCase(),title=file.name.replace(/\.[^.]+$/,'').replace(/_+/g,' ').trim();
  if(ext==='docx'){
    if(!window.mammoth)throw new Error('O leitor de .docx não carregou');
    const res=await window.mammoth.convertToHtml({arrayBuffer:await file.arrayBuffer()});
    return{title,body:res.value,format:'html'};
  }
  const text=(await file.text()).replace(/^﻿/,'');
  if(ext==='html'||ext==='htm'){const d=new DOMParser().parseFromString(text,'text/html');return{title,body:d.body.innerHTML.trim(),format:'html'}}
  return{title,body:text.replace(/\r\n/g,'\n'),format:'text'};
}
async function handleFiles(files){
  const err=document.getElementById('f-ferr');err.textContent='';
  const list=Array.from(files).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR',{numeric:true}));
  const out=[];
  for(const f of list){try{out.push(await readFile(f))}catch(e){err.textContent='Não consegui ler "'+f.name+'": '+(e.message||'erro');return}}
  if(!out.length)return;
  if(out.length===1){
    const x=out[0],f=S.form;
    if(!f.title.trim())f.title=x.title;f.body=x.body;f.format=x.format;paintChForm();
    const t=document.getElementById('f-title');if(t)t.value=f.title;
  }else{S.form.batch=out;paintChForm()}
}
function wrapSel(k){
  const ta=document.getElementById('f-body');if(!ta||S.form.batch)return;
  const a=ta.selectionStart,b=ta.selectionEnd,sel=ta.value.slice(a,b),html=S.form.format==='html';
  const pairs={b:html?['<strong>','</strong>']:['**','**'],i:html?['<em>','</em>']:['*','*']};
  let ins,cs;
  if(k==='hr'){ins=html?'\n<hr>\n':'\n\n***\n\n';cs=a+ins.length}
  else{const p=pairs[k];ins=p[0]+sel+p[1];cs=sel?a+ins.length:a+p[0].length}
  ta.value=ta.value.slice(0,a)+ins+ta.value.slice(b);
  S.form.body=ta.value;ta.focus();ta.setSelectionRange(cs,cs);updCount();
}
function updCount(){const c=document.getElementById('wcount');if(c)c.textContent=num(wordsOf(S.form.body,S.form.format))+' palavras'}
async function saveChap(){
  const f=S.form,err=document.getElementById('err'),btn=document.getElementById('save'),w=S.cur.w,c=S.cur.c;
  if(!f.batch&&!f.body.trim()){err.textContent='Escreva o texto do capítulo ou suba um arquivo.';return}
  if(S.saving)return;S.saving=true;btn.disabled=true;err.textContent='';
  try{
    const last=w.chs.reduce((m,x)=>Math.max(m,x.position),0);
    if(c){
      await q(sb.from('chapters').update({title:f.title.trim(),body:f.body,format:f.format,notes_start:f.ns.trim(),notes_end:f.ne.trim(),words:wordsOf(f.body,f.format),updated_at:new Date().toISOString()}).eq('id',c.id));
      await touchWork(w.id);go('obra/'+w.id+'/'+S.r.n);
    }else if(f.batch){
      await q(sb.from('chapters').insert(f.batch.map((x,i)=>({work_id:w.id,position:last+i+1,title:x.title,body:x.body,format:x.format,words:wordsOf(x.body,x.format)}))));
      await touchWork(w.id);go('obra/'+w.id);
    }else{
      await q(sb.from('chapters').insert({work_id:w.id,position:last+1,title:f.title.trim(),body:f.body,format:f.format,notes_start:f.ns.trim(),notes_end:f.ne.trim(),words:wordsOf(f.body,f.format)}));
      await touchWork(w.id);go('obra/'+w.id+'/'+(w.chs.length+1));
    }
  }catch(e){err.textContent='Não foi possível salvar: '+((e&&e.message)||'erro')+'.';btn.disabled=false}
  S.saving=false;
}

/* ---------- render ---------- */
async function render(showLoad){
  const tok=++S.tok,r=route();S.r=r;
  if(!sb){$app.innerHTML=setupHtml();return}
  if(!S.authReady){$app.innerHTML=shell(loading(),r);return}
  if(showLoad)$app.innerHTML=shell(loading(),r);
  let inner;
  try{
    switch(r.v){
      case 'work':inner=await workView(r);break;
      case 'chapter':inner=await chapterView(r);break;
      case 'new':case 'edit':inner=await workForm(r);break;
      case 'newchap':case 'editchap':inner=await chapForm(r);break;
      case 'auth':inner=S.user?'<div class="empty"><h2>Você já está conectado</h2><a class="btn pri" href="#/obras">Ir para a estante</a></div>':authHtml();break;
      case 'reset':inner=resetHtml();break;
      default:inner=await homeView(r);
    }
  }catch(e){inner='<div class="empty"><h2>Algo deu errado</h2><p class="muted">'+esc((e&&e.message)||'Erro ao carregar')+'</p><button class="btn" data-action="retry">Tentar de novo</button></div>'}
  if(tok!==S.tok)return;
  const y=window.scrollY;
  $app.innerHTML=shell(inner,r);
  if(r.v==='home')paintList();
  if(document.getElementById('warns')){paintWarns();paintChips()}
  document.documentElement.style.setProperty('--fs',lsGet('fs','18')+'px');
  if(showLoad)window.scrollTo(0,0);else window.scrollTo(0,y);
}

/* ---------- ações ---------- */
async function delChap(id){const w=S.cur.w;try{await q(sb.from('chapters').delete().eq('id',id));await touchWork(w.id)}catch(e){}render()}
async function delWork(id){try{await q(sb.from('works').delete().eq('id',id));go('obras')}catch(e){render()}}
async function moveChap(i,dir){
  const chs=S.cur.w.chs,a=chs[i],b=chs[i+dir];if(!a||!b)return;
  try{await q(sb.from('chapters').update({position:b.position}).eq('id',a.id));await q(sb.from('chapters').update({position:a.position}).eq('id',b.id))}catch(e){}
  render();
}
async function toggleLike(){
  const c=S.cur;if(!S.user){S.next=location.hash;go('entrar');return}
  const was=c.liked;c.liked=!was;c.nlikes+=was?-1:1;document.getElementById('likebar').innerHTML=likeHtml();
  try{
    if(was)await q(sb.from('likes').delete().eq('chapter_id',c.c.id).eq('user_id',S.user.id));
    else await q(sb.from('likes').insert({chapter_id:c.c.id,user_id:S.user.id}));
  }catch(e){c.liked=was;c.nlikes+=was?1:-1;document.getElementById('likebar').innerHTML=likeHtml()}
}
async function reloadComments(){
  const c=S.cur;
  c.cms=await q(sb.from('comments').select('id,body,created_at,user_id,profiles(name)').eq('chapter_id',c.c.id).order('created_at'));
  const e=document.getElementById('cm');if(e)e.innerHTML=commentsHtml();
}
async function sendComment(){
  const ta=document.getElementById('cm-body'),err=document.getElementById('cm-err'),btn=document.getElementById('cm-send');
  const body=ta.value.trim();if(!body){err.textContent='Escreva algo antes de enviar.';return}
  btn.disabled=true;err.textContent='';
  try{await q(sb.from('comments').insert({chapter_id:S.cur.c.id,user_id:S.user.id,body}));await reloadComments()}
  catch(e){err.textContent='Não foi possível enviar: '+((e&&e.message)||'erro');btn.disabled=false}
}

document.addEventListener('click',e=>{
  const t=e.target.closest('[data-action]');if(!t)return;
  const a=t.dataset.action;
  if(a==='tag'){S.f.tag=S.f.tag.toLowerCase()===t.dataset.tag.toLowerCase()?'':t.dataset.tag;if(S.r.v!=='home'){go('obras')}else{render()}}
  else if(a==='clear'){S.f={q:'',rating:'',status:'',tag:'',hide:[],sort:'recent'};render()}
  else if(a==='retry')render(true);
  else if(a==='ack'){S.ack[t.dataset.id]=true;render()}
  else if(a==='fs'){const n=Math.min(28,Math.max(14,+lsGet('fs','18')+(+t.dataset.d)*2));lsSet('fs',String(n));document.documentElement.style.setProperty('--fs',n+'px')}
  else if(a==='move')moveChap(+t.dataset.i,+t.dataset.dir);
  else if(a==='delchap'){const k='c:'+t.dataset.id;if(S.confirm===k){S.confirm=null;delChap(t.dataset.id)}else{S.confirm=k;render()}}
  else if(a==='delwork'){const k='w:'+t.dataset.id;if(S.confirm===k){S.confirm=null;delWork(t.dataset.id)}else{S.confirm=k;render()}}
  else if(a==='delcm'){const k='m:'+t.dataset.id;if(S.confirm===k){S.confirm=null;sb.from('comments').delete().eq('id',t.dataset.id).then(reloadComments)}else{S.confirm=k;document.getElementById('cm').innerHTML=commentsHtml()}}
  else if(a==='rmchip'){S.form[t.dataset.kind].splice(+t.dataset.i,1);paintChips()}
  else if(a==='wrap')wrapSel(t.dataset.k);
  else if(a==='preview'){const p=document.getElementById('preview');p.hidden=!p.hidden;if(!p.hidden)p.innerHTML=renderBody(S.form.body,S.form.format)||'<p class="muted">Nada para mostrar ainda.</p>'}
  else if(a==='cancelbatch'){S.form.batch=null;paintChForm()}
  else if(a==='like')toggleLike();
  else if(a==='logout'){sb.auth.signOut()}
  else if(a==='authmode'){S.authMode=t.dataset.m;S.authMsg='';$app.innerHTML=shell(authHtml(),S.r)}
});
document.addEventListener('input',e=>{
  const t=e.target;
  if(t.dataset.filter){S.f[t.dataset.filter]=t.value;paintList();return}
  if(t.dataset.f&&S.form){
    S.form[t.dataset.f]=t.value;
    if(t.dataset.f==='body')updCount();
    if(t.dataset.f==='format'){const h=document.getElementById('fmt-hint');if(h)h.textContent=FMT_HINT[t.value];updCount()}
  }
});
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.dataset.hide){const k=t.dataset.hide;S.f.hide=t.checked?S.f.hide.concat(k):S.f.hide.filter(x=>x!==k);paintList()}
  else if(t.dataset.warn){
    const k=t.dataset.warn;let w=S.form.warnings.filter(x=>x!==k);
    if(t.checked)w=(k==='none'||k==='skip')?[k]:w.filter(x=>x!=='none'&&x!=='skip').concat(k);
    S.form.warnings=w;paintWarns();
  }
  else if(t.dataset.jump)go('obra/'+t.dataset.jump+'/'+t.value);
  else if(t.dataset.chip&&t.value.trim()){addChip(t.dataset.chip,t.value);t.value=''}
  else if(t.id==='f-file'&&t.files&&t.files.length)handleFiles(t.files);
});
document.addEventListener('keydown',e=>{
  const t=e.target;if(!t.dataset||!t.dataset.chip)return;
  if(e.key==='Enter'||e.key===','){e.preventDefault();if(t.value.trim()){addChip(t.dataset.chip,t.value);t.value=''}}
  else if(e.key==='Backspace'&&!t.value){S.form[t.dataset.chip].pop();paintChips()}
});
document.addEventListener('submit',async e=>{
  e.preventDefault();
  const id=e.target.id;
  if(id==='wform')saveWork();
  else if(id==='cform')saveChap();
  else if(id==='authform')doAuth();
  else if(id==='cmform')sendComment();
  else if(id==='resetform'){
    const err=document.getElementById('a-err'),p=document.getElementById('r-pass').value;
    if(p.length<6){err.textContent='A senha precisa ter pelo menos 6 caracteres.';return}
    const {error}=await sb.auth.updateUser({password:p});
    if(error)err.textContent=aerr(error);else go('obras');
  }
});
window.addEventListener('hashchange',()=>{S.confirm=null;render(true)});

/* ---------- início ---------- */
if(!sb){render()}
else{
  render();
  sb.auth.onAuthStateChange((ev,session)=>{
    const prev=S.user?S.user.id:null,cur=session&&session.user?session.user.id:null;
    S.user=session?session.user:null;S.authReady=true;
    if(ev==='PASSWORD_RECOVERY')location.hash=H('nova-senha');
    if(ev!=='INITIAL_SESSION'&&ev!=='PASSWORD_RECOVERY'&&prev===cur)return;
    setTimeout(async()=>{
      S.name='';
      if(S.user){try{const p=await q(sb.from('profiles').select('name').eq('id',S.user.id).maybeSingle());S.name=(p&&p.name)||''}catch(e){}}
      render(true);
    },0);
  });
}
})();
