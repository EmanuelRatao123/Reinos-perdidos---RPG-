let token=localStorage.getItem('token'),user=null,socket=io();

async function api(e,m='GET',d=null){
const o={method:m,headers:{'Content-Type':'application/json'}};
if(token)o.headers.Authorization='Bearer '+token;
if(d)o.body=JSON.stringify(d);
return(await fetch('/api'+e,o)).json();
}

function msg(t,type='success'){
const d=document.createElement('div');
d.className='message '+type;
d.textContent=t;
document.getElementById('messages').appendChild(d);
setTimeout(()=>d.remove(),4000);
}

async function register(){
const u=document.getElementById('user').value,p=document.getElementById('pass').value;
const r=await api('/register','POST',{username:u,password:p});
if(r.token){token=r.token;user=r.user;localStorage.setItem('token',token);showGame();msg('✅ Conta criada!')}
else msg(r.error,'error');
}

async function login(){
const u=document.getElementById('user').value,p=document.getElementById('pass').value;
const r=await api('/login','POST',{username:u,password:p});
if(r.token){
token=r.token;user=r.user;localStorage.setItem('token',token);
document.getElementById('username').textContent=user.username;
document.getElementById('gold').textContent=user.gold||0;
if(user.isAdmin)document.getElementById('admin-tab').classList.remove('hidden');
showGame();loadMyChars();loadShop();loadChat();msg('✅ Login!')
}else msg(r.error,'error');
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
if(t==='loja')loadShop();
if(t==='batalha')loadBattleRequests();
if(t==='chat')loadChat();
if(t==='admin')loadAdminData();
}

async function loadMyChars(){
const c=await api('/my-characters');
const d=document.getElementById('my-chars');
if(c.length===0){d.innerHTML='<p>Você não tem personagens. Compre na loja!</p>';return}
d.innerHTML=c.map(ch=>`<div class="card">
<h3>${ch.nickname||ch.name}</h3>
<p>Classe: ${ch.class} | Nível: ${ch.level}</p>
<div class="stats">
<div class="stat">❤️ ${ch.hp}</div>
<div class="stat">💙 ${ch.mp}</div>
<div class="stat">💪 ${ch.str}</div>
<div class="stat">🧠 ${ch.int}</div>
<div class="stat">⚡ ${ch.agi}</div>
</div>
</div>`).join('');
}

async function loadShop(){
const s=await api('/shop');
const d=document.getElementById('shop-items');
if(s.length===0){d.innerHTML='<p>Loja vazia! Admin precisa adicionar itens.</p>';return}
d.innerHTML=s.map(i=>`<div class="shop-item">
<h3>${i.name}</h3>
<p>${i.description}</p>
<p>Classe: ${i.class}</p>
<div class="stats">
<div class="stat">❤️ ${i.hp}</div>
<div class="stat">💙 ${i.mp}</div>
<div class="stat">💪 ${i.str}</div>
</div>
<p style="color:#ffd700;font-size:1.5em">💰 ${i.price} ouro</p>
<button class="btn btn-primary" onclick="buyChar(${i.item_id})">Comprar</button>
</div>`).join('');
}

async function buyChar(id){
const r=await api('/shop/buy/'+id,'POST');
if(r.message){msg('✅ '+r.message);loadMyChars();
const g=await api('/login','POST',{username:user.username,password:''});
document.getElementById('gold').textContent=g.user?.gold||0;
}else msg(r.error,'error');
}

async function loadBattleRequests(){
const r=await api('/battle/requests');
const d=document.getElementById('battle-requests');
if(r.length===0){d.innerHTML='<p>Nenhum desafio pendente.</p>';return}
d.innerHTML=r.map(b=>`<div class="card">
<h3>⚔️ Desafio de ${b.challenger_name}</h3>
<button class="btn btn-primary" onclick="acceptBattle(${b.id})">Aceitar</button>
</div>`).join('');
}

async function acceptBattle(id){
await api('/battle/accept/'+id,'POST');
msg('✅ Desafio aceito! Batalha iniciada!');
loadBattleRequests();
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

async function createChar(){
const d={
name:document.getElementById('a-name').value,
characterClass:document.getElementById('a-class').value,
hp:document.getElementById('a-hp').value,
mp:document.getElementById('a-mp').value,
str:document.getElementById('a-str').value,
int:document.getElementById('a-int').value,
agi:document.getElementById('a-agi').value,
price:document.getElementById('a-price').value
};
const r=await api('/admin/character/create','POST',d);
msg('✅ '+r.message);
loadAdminData();
}

async function createSkill(){
const d={
name:document.getElementById('s-name').value,
damage:document.getElementById('s-dmg').value,
mpCost:document.getElementById('s-mp').value,
cooldown:document.getElementById('s-cd').value,
effect:'Dano customizado'
};
await api('/admin/skill/create','POST',d);
msg('✅ Skill criada!');
}

async function addToShop(){
const charId=document.getElementById('shop-char').value;
const duration=document.getElementById('shop-duration').value;
await api('/admin/shop/add','POST',{itemId:charId,price:0,duration});
msg('✅ Adicionado à loja!');
}

async function loadAdminData(){
const c=await api('/admin/characters');
const s=document.getElementById('shop-char');
s.innerHTML=c.map(ch=>`<option value="${ch.id}">${ch.name} - ${ch.price} ouro</option>`).join('');

const u=await api('/admin/users');
const d=document.getElementById('admin-users');
d.innerHTML=u.map(us=>`<div class="card">
<strong>${us.username}</strong> - 💰 ${us.gold} ouro
<button class="btn btn-danger" onclick="banUser(${us.id})">Banir</button>
</div>`).join('');
}

async function banUser(id){
await api('/admin/ban/'+id,'POST');
msg('✅ Usuário banido');
loadAdminData();
}

setInterval(()=>{if(token&&document.getElementById('chat'))loadChat()},5000);
socket.on('battle_request',d=>{if(user&&d.toId===user.id)msg('⚔️ '+d.from+' te desafiou!','error')});
socket.on('global_message',()=>loadChat());