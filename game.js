(function(){const _0x1=console.log;console.log=function(){};console.warn=function(){};console.error=function(){};console.clear=function(){};Object.defineProperty(window,'user',{get:function(){return null},set:function(){}});Object.defineProperty(window,'token',{get:function(){return null},set:function(){}});})();

let token=localStorage.getItem('token'),user=null,socket=io(),currentBattle=null,currentChar=null;

async function checkBan(){
const r=await fetch('/api/check-ban');
const d=await r.json();
if(d.banned){showBanScreen(d.reason,d.until);return true}
return false
}

function showBanScreen(reason,until){
const screen=document.getElementById('ban-screen');
document.getElementById('ban-reason').textContent='Motivo: '+(reason||'Violação das regras');
const date=new Date(until);
const now=new Date();
if(date>now){
const hours=Math.ceil((date-now)/3600000);
document.getElementById('ban-until').textContent=hours>8760?'Ban PERMANENTE':'Ban expira em: '+hours+' horas';
}else{
document.getElementById('ban-until').textContent='Ban PERMANENTE';
}
screen.classList.remove('hidden');
document.getElementById('auth').classList.add('hidden');
document.getElementById('game').classList.add('hidden');
}

async function api(e,m='GET',d=null){
const o={method:m,headers:{'Content-Type':'application/json'}};
if(token)o.headers.Authorization='Bearer '+token;
if(d)o.body=JSON.stringify(d);
const r=await fetch('/api'+e,o);
const j=await r.json();
if(j.banned){showBanScreen(j.reason,j.until);throw new Error('Banned')}
return j;
}

function msg(t,type='success'){
const d=document.createElement('div');
d.className='message '+type;
d.textContent=t;
document.getElementById('messages').appendChild(d);
setTimeout(()=>d.remove(),4000);
}

async function register(){
if(await checkBan())return;
const u=document.getElementById('user').value,p=document.getElementById('pass').value;
if(!u||!p)return msg('Preencha todos os campos','error');
try{
const r=await api('/register','POST',{username:u,password:p});
if(r.token){
token=r.token;user=r.user;localStorage.setItem('token',token);
showGame();msg('✅ Conta criada! Pegue um personagem GRATUITO na loja!')
}else msg(r.error,'error');
}catch(e){if(e.message!=='Banned')msg('Erro ao registrar','error')}
}

async function login(){
if(await checkBan())return;
const u=document.getElementById('user').value,p=document.getElementById('pass').value;
if(!u||!p)return msg('Preencha todos os campos','error');
try{
const r=await api('/login','POST',{username:u,password:p});
if(r.token){
token=r.token;user=r.user;localStorage.setItem('token',token);
document.getElementById('username').textContent=user.username;
document.getElementById('gold').textContent=user.gold||0;
if(user.isAdmin)document.getElementById('admin-tab').classList.remove('hidden');
showGame();loadChars();loadShop();msg('✅ Bem-vindo, '+user.username+'!')
}else msg(r.error,'error');
}catch(e){if(e.message!=='Banned')msg('Erro ao fazer login','error')}
}

function showGame(){
document.getElementById('auth').classList.add('hidden');
document.getElementById('game').classList.remove('hidden');
document.getElementById('user-info').classList.remove('hidden');
}

function showTab(t){
document.querySelectorAll('.tab').forEach(e=>e.classList.remove('active'));
document.querySelectorAll('.tab-content').forEach(e=>e.classList.remove('active'));
event.target.classList.add('active');
document.getElementById('tab-'+t).classList.add('active');
if(t==='personagens')loadChars();
if(t==='pve')loadPveChars();
if(t==='pvp')loadPvpChars();
if(t==='loja')loadShop();
if(t==='amigos')loadFriends();
if(t==='chat')loadChat();
if(t==='admin')loadAdminData();
}

async function loadChars(){
const c=await api('/characters');
const d=document.getElementById('my-chars');
if(c.length===0){d.innerHTML='<p>Você não tem personagens. Pegue um GRATUITO na loja!</p>';return}
d.innerHTML=c.map(ch=>`<div class="card">
<h3>${ch.name}</h3>
<p><strong>${ch.class}</strong> | Nível ${ch.level}</p>
<p>EXP: ${ch.exp}/${ch.level*100}</p>
<div class="stats">
<div class="stat">❤️ ${ch.hp}/${ch.max_hp}</div>
<div class="stat">💙 ${ch.mp}/${ch.max_mp}</div>
<div class="stat">💪 ${ch.str}</div>
<div class="stat">🧠 ${ch.int}</div>
<div class="stat">⚡ ${ch.agi}</div>
</div>
<p style="color:#ffd700">💥 Ultimate: ${ch.ultimate_name} (${ch.ultimate_damage} dano, ${ch.ultimate_mp_cost} MP)</p>
${ch.exp>=ch.level*100?`<button class="btn btn-primary" onclick="levelUp(${ch.id})">⬆️ Level UP!</button>`:''}
</div>`).join('');
}

async function levelUp(id){
const r=await api('/characters/'+id+'/level-up','POST');
if(r.message){msg('✅ '+r.message);loadChars();updateGold()}
else msg(r.error,'error');
}

async function loadPveChars(){
const c=await api('/characters');
const d=document.getElementById('pve-chars');
if(c.length===0){d.innerHTML='<p>Pegue um personagem GRATUITO na loja primeiro!</p>';return}
d.innerHTML=c.map(ch=>`<button class="btn btn-primary" onclick="startPve(${ch.id},'${ch.name}')">
${ch.name} (${ch.class}) - Nível ${ch.level}
</button>`).join('');
}

async function startPve(charId,charName){
const r=await api('/pve/start','POST',{charId});
currentBattle=r.battleId;
currentChar=charId;
document.getElementById('pve-select').classList.add('hidden');
document.getElementById('pve-battle').classList.remove('hidden');
document.getElementById('monster-name').textContent='🐉 '+r.monster.name;
document.getElementById('char-name-battle').textContent='⚔️ '+charName;
document.getElementById('battle-log').innerHTML='<p>Batalha iniciada contra '+r.monster.name+'!</p>';
updateBattleDisplay();
}

async function updateBattleDisplay(){
const r=await api('/pve/'+currentBattle);
const char=r.character,battle=r.battle;
updateBar('char-hp',char.hp,char.max_hp);
updateBar('char-mp',char.mp,char.max_mp);
updateBar('monster-hp',battle.monster_hp,battle.monster_max_hp);
document.getElementById('ult-btn').disabled=char.ultimate_ready===0;
}

function updateBar(prefix,current,max){
const pct=(current/max)*100;
document.getElementById(prefix+'-fill').style.width=pct+'%';
document.getElementById(prefix+'-text').textContent=current+'/'+max;
}

async function pveAction(action){
const r=await api('/pve/'+currentBattle+'/action','POST',{action});
const log=document.getElementById('battle-log');
r.log.forEach(l=>log.innerHTML+=`<p>${l}</p>`);
log.scrollTop=log.scrollHeight;
if(r.status==='victory'||r.status==='defeat'){
setTimeout(()=>{
endBattle();
loadChars();
updateGold();
},2000);
}else{
updateBattleDisplay();
}
}

function endBattle(){
document.getElementById('pve-select').classList.remove('hidden');
document.getElementById('pve-battle').classList.add('hidden');
currentBattle=null;
currentChar=null;
}

async function loadPvpChars(){
const c=await api('/characters');
const d=document.getElementById('pvp-chars');
if(c.length===0){d.innerHTML='<p>Pegue um personagem na loja primeiro!</p>';return}
d.innerHTML=c.map(ch=>`<button class="btn btn-primary" onclick="challengePlayer(${ch.id})">
${ch.name} (${ch.class}) - Nível ${ch.level}
</button>`).join('');
loadPvpChallenges();
}

async function challengePlayer(charId){
const opp=document.getElementById('pvp-opponent').value;
if(!opp)return msg('Digite o nome do oponente','error');
const r=await api('/pvp/challenge','POST',{opponentId:0,charId});
msg('✅ Desafio enviado!');
}

async function loadPvpChallenges(){
const c=await api('/pvp/challenges');
const d=document.getElementById('pvp-challenges');
if(c.length===0){d.innerHTML='<p>Nenhum desafio pendente.</p>';return}
d.innerHTML=c.map(b=>`<div class="card">
<h3>⚔️ ${b.challenger_name} te desafiou!</h3>
<p>Selecione seu personagem:</p>
<div id="accept-chars-${b.id}"></div>
</div>`).join('');
c.forEach(async b=>{
const chars=await api('/characters');
document.getElementById('accept-chars-'+b.id).innerHTML=chars.map(ch=>`
<button class="btn btn-primary" onclick="acceptPvp(${b.id},${ch.id})">
${ch.name} (${ch.class})
</button>`).join('');
});
}

async function acceptPvp(battleId,charId){
const r=await api('/pvp/'+battleId+'/accept','POST',{charId});
msg(r.message);
loadPvpChallenges();
updateGold();
}

async function loadShop(){
const s=await api('/shop');
const d=document.getElementById('shop-items');
if(s.length===0){d.innerHTML='<p>Loja vazia! Aguarde o admin adicionar itens.</p>';return}
d.innerHTML=s.map(i=>`<div class="shop-item">
<h3>${i.name}</h3>
<p><strong>${i.class}</strong></p>
<p style="font-size:0.9em;color:#ccc">${i.description||''}</p>
<div class="stats">
<div class="stat">❤️ ${i.hp}</div>
<div class="stat">💙 ${i.mp}</div>
<div class="stat">💪 ${i.str}</div>
<div class="stat">🧠 ${i.int}</div>
<div class="stat">⚡ ${i.agi}</div>
</div>
<p style="color:#ffd700">💥 ${i.ultimate_name} (${i.ultimate_damage} dano)</p>
<p style="color:${i.price===0?'#00ff00':'#ffd700'};font-size:1.5em;font-weight:bold">${i.price===0?'✨ GRATUITO ✨':'💰 '+i.price+' ouro'}</p>
<button class="btn btn-primary" onclick="buyChar(${i.id})">Comprar</button>
</div>`).join('');
}

async function buyChar(id){
const r=await api('/shop/buy/'+id,'POST');
if(r.message){msg('✅ '+r.message);loadChars();updateGold()}
else msg(r.error,'error');
}

async function addFriend(){
const f=document.getElementById('friend-name').value;
if(!f)return msg('Digite o nome','error');
const r=await api('/friends/add','POST',{friendUsername:f});
msg(r.message||r.error,r.error?'error':'success');
}

async function loadFriends(){
const req=await api('/friends/requests');
const d1=document.getElementById('friend-requests');
if(req.length===0){d1.innerHTML='<p>Nenhum pedido pendente.</p>'}
else{
d1.innerHTML=req.map(f=>`<div class="card">
<strong>${f.username}</strong>
<button class="btn btn-primary" onclick="acceptFriend(${f.id})">Aceitar</button>
</div>`).join('');
}

const friends=await api('/friends');
const d2=document.getElementById('friends-list');
if(friends.length===0){d2.innerHTML='<p>Você não tem amigos ainda.</p>'}
else{
d2.innerHTML=friends.map(f=>`<div class="card">
<strong>${f.username}</strong>
</div>`).join('');
}
}

async function acceptFriend(id){
await api('/friends/'+id+'/accept','POST');
msg('✅ Amizade aceita!');
loadFriends();
}

async function loadChat(){
const c=await api('/global-chat');
const d=document.getElementById('chat');
d.innerHTML=c.map(m=>`<div class="chat-msg"><strong>${m.username}:</strong> ${m.message}</div>`).join('');
d.scrollTop=d.scrollHeight;
}

async function sendChat(){
const m=document.getElementById('chat-input').value;
if(!m)return;
await api('/global-chat','POST',{message:m});
document.getElementById('chat-input').value='';
loadChat();
}

async function changePassword(){
const old=document.getElementById('old-pass').value;
const newP=document.getElementById('new-pass').value;
if(!old||!newP)return msg('Preencha todos os campos','error');
const r=await api('/settings/change-password','POST',{oldPassword:old,newPassword:newP});
if(r.message){msg('✅ '+r.message);document.getElementById('old-pass').value='';document.getElementById('new-pass').value=''}
else msg(r.error,'error');
}

async function deleteAccount(){
if(!confirm('⚠️ ATENÇÃO! Isso vai deletar sua conta permanentemente. Confirma?'))return;
await api('/settings/delete-account','DELETE');
localStorage.removeItem('token');
location.reload();
}

async function addToShop(){
const d={
name:document.getElementById('a-name').value,
characterClass:document.getElementById('a-class').value,
price:document.getElementById('a-price').value,
hp:document.getElementById('a-hp').value,
mp:document.getElementById('a-mp').value,
str:document.getElementById('a-str').value,
int:document.getElementById('a-int').value,
agi:document.getElementById('a-agi').value,
ultName:document.getElementById('a-ult-name').value,
ultDmg:document.getElementById('a-ult-dmg').value,
ultMp:document.getElementById('a-ult-mp').value,
duration:document.getElementById('a-duration').value
};
const r=await api('/admin/shop/add','POST',d);
msg('✅ '+r.message);
}

async function loadAdminData(){
const u=await api('/admin/users');
const d=document.getElementById('admin-users');
d.innerHTML=u.map(us=>`<div class="card">
<strong>${us.username}</strong> - 💰 ${us.gold} ouro ${us.is_banned?'<span style="color:#ff0000">(BANIDO)</span>':''}
<div>
<button class="btn btn-danger" onclick="banUserPrompt(${us.id},'${us.username}')">Banir</button>
<button class="btn btn-warning" onclick="unbanUser(${us.id})">Desbanir</button>
<button class="btn btn-primary" onclick="giveGold(${us.id})">Dar Ouro</button>
<button class="btn btn-info" onclick="getUserIP(${us.id},'${us.username}')">Ver IP</button>
</div>
</div>`).join('');

const ipBans=await api('/admin/ip-bans');
const d2=document.getElementById('ip-bans');
if(ipBans.length===0){d2.innerHTML='<p>Nenhum IP banido.</p>'}
else{
d2.innerHTML=ipBans.map(b=>`<div class="card">
<strong>IP: ${b.ip}</strong><br>
Motivo: ${b.reason}<br>
Expira: ${new Date(b.banned_until).toLocaleString()}
</div>`).join('');
}
}

async function banUserPrompt(id,username){
const reason=prompt('Motivo do ban:','Violação das regras');
if(!reason)return;
const hours=prompt('Horas de ban (deixe vazio para permanente):','');
await api('/admin/ban/'+id,'POST',{reason,hours:hours||null});
msg('✅ '+username+' banido');
loadAdminData();
}

async function unbanUser(id){
await api('/admin/unban/'+id,'POST');
msg('✅ Usuário desbanido');
loadAdminData();
}

async function giveGold(id){
const amount=prompt('Quanto ouro dar?');
if(!amount)return;
await api('/admin/give-gold','POST',{userId:id,amount:parseInt(amount)});
msg('✅ Ouro dado!');
loadAdminData();
}

async function getUserIP(id,username){
const ip=prompt('Digite o IP do usuário '+username+' para banir:');
if(!ip)return;
const reason=prompt('Motivo do ban:','Violação das regras');
if(!reason)return;
const hours=prompt('Horas de ban (deixe vazio para permanente):','');
await api('/admin/ban-ip','POST',{ip,reason,hours:hours||null});
msg('✅ IP '+ip+' banido');
loadAdminData();
}

async function updateGold(){
const r=await fetch('/api/user-ip',{headers:{'Authorization':'Bearer '+token}});
const d=await r.json();
if(user)document.getElementById('gold').textContent=user.gold;
}

setInterval(()=>{if(token)loadChat()},5000);
socket.on('user_banned',d=>{if(user&&d.userId===user.id){localStorage.removeItem('token');location.reload()}});
socket.on('pvp_challenge',d=>{if(user&&d.toId===user.id)msg('⚔️ '+d.from+' te desafiou!','error')});
socket.on('global_message',()=>loadChat());

checkBan().then(banned=>{
if(!banned&&token){
showGame();
}
});
