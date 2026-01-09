const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'reinos_perdidos_2024';
const ADMIN_USER = process.env.ADMIN_USER || 'Emanuel';
const ADMIN_PASS = process.env.ADMIN_PASS || 'Rato123';

const loginAttempts = new Map();
const bannedIPs = new Map();

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const db = new sqlite3.Database('./rpg.db');

const sanitize = (str) => String(str).replace(/[<>"']/g, '');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    gold INTEGER DEFAULT 500,
    is_admin BOOLEAN DEFAULT 0,
    is_banned BOOLEAN DEFAULT 0,
    ban_reason TEXT,
    ban_until DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS ip_bans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT UNIQUE NOT NULL,
    reason TEXT,
    banned_until DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT NOT NULL,
    class TEXT NOT NULL,
    level INTEGER DEFAULT 1,
    exp INTEGER DEFAULT 0,
    hp INTEGER,
    max_hp INTEGER,
    mp INTEGER,
    max_mp INTEGER,
    str INTEGER,
    int INTEGER,
    agi INTEGER,
    ultimate_name TEXT,
    ultimate_damage INTEGER,
    ultimate_mp_cost INTEGER,
    ultimate_cooldown INTEGER DEFAULT 3,
    ultimate_ready INTEGER DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS friendships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    friend_id INTEGER,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (friend_id) REFERENCES users (id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS global_chat (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS shop_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    class TEXT NOT NULL,
    price INTEGER NOT NULL,
    hp INTEGER,
    mp INTEGER,
    str INTEGER,
    int INTEGER,
    agi INTEGER,
    ultimate_name TEXT,
    ultimate_damage INTEGER,
    ultimate_mp_cost INTEGER,
    description TEXT,
    duration_hours INTEGER DEFAULT 24,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS pve_battles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER,
    monster_name TEXT,
    monster_hp INTEGER,
    monster_max_hp INTEGER,
    monster_str INTEGER,
    turn INTEGER DEFAULT 1,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS pvp_battles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challenger_id INTEGER,
    opponent_id INTEGER,
    challenger_char_id INTEGER,
    opponent_char_id INTEGER,
    status TEXT DEFAULT 'pending',
    winner_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`INSERT OR IGNORE INTO shop_items (name, class, price, hp, mp, str, int, agi, ultimate_name, ultimate_damage, ultimate_mp_cost, description, duration_hours) VALUES
    ('Guerreiro Iniciante', 'Guerreiro', 0, 150, 50, 20, 10, 12, 'Fúria de Batalha', 80, 30, 'Guerreiro básico GRATUITO', 999999),
    ('Mago Iniciante', 'Mago', 0, 100, 150, 10, 25, 15, 'Explosão Arcana', 100, 40, 'Mago básico GRATUITO', 999999),
    ('Arqueiro Iniciante', 'Arqueiro', 0, 120, 80, 15, 12, 25, 'Flecha Perfurante', 90, 35, 'Arqueiro básico GRATUITO', 999999),
    ('Paladino Sagrado', 'Paladino', 2500, 200, 100, 25, 20, 15, 'Julgamento Divino', 120, 50, 'Guerreiro sagrado lendário', 24),
    ('Necromante', 'Necromante', 3000, 120, 200, 12, 35, 18, 'Exército dos Mortos', 150, 60, 'Mestre das trevas', 24),
    ('Assassino', 'Assassino', 2800, 140, 90, 22, 15, 35, 'Golpe das Sombras', 140, 45, 'Mestre da furtividade', 24)`);
});

const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token necessário' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido' });
    req.user = user;
    next();
  });
};

const adminAuth = (req, res, next) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Acesso negado' });
  next();
};

app.post('/api/register', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  const ipBan = await new Promise(resolve => {
    db.get('SELECT * FROM ip_bans WHERE ip = ? AND datetime(banned_until) > datetime("now")', [ip], (err, row) => resolve(row));
  });
  if (ipBan) return res.status(403).json({ banned: true, reason: ipBan.reason, until: ipBan.banned_until });
  
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Dados obrigatórios' });
  const cleanUser = sanitize(username);
  const hashedPassword = await bcrypt.hash(password, 10);
  db.run('INSERT INTO users (username, password) VALUES (?, ?)', [cleanUser, hashedPassword], function(err) {
    if (err) return res.status(400).json({ error: 'Usuário já existe' });
    const token = jwt.sign({ id: this.lastID, username: cleanUser, isAdmin: false }, JWT_SECRET);
    res.json({ token, user: { id: this.lastID, username: cleanUser, isAdmin: false, gold: 500 } });
  });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const ip = req.ip || req.connection.remoteAddress;
  
  const ipBan = await new Promise(resolve => {
    db.get('SELECT * FROM ip_bans WHERE ip = ? AND datetime(banned_until) > datetime("now")', [ip], (err, row) => resolve(row));
  });
  if (ipBan) return res.status(403).json({ banned: true, reason: ipBan.reason, until: ipBan.banned_until });
  
  const attempts = loginAttempts.get(ip) || { count: 0, lastAttempt: Date.now() };
  if (attempts.count >= 5 && Date.now() - attempts.lastAttempt < 300000) {
    return res.status(429).json({ error: 'Muitas tentativas. Aguarde 5 minutos.' });
  }
  
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    loginAttempts.delete(ip);
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
      if (!user) {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run('INSERT INTO users (username, password, is_admin, gold) VALUES (?, ?, 1, 999999)', 
          [username, hashedPassword], function(err) {
          const token = jwt.sign({ id: this.lastID, username, isAdmin: true }, JWT_SECRET);
          return res.json({ token, user: { id: this.lastID, username, isAdmin: true, gold: 999999 } });
        });
      } else {
        db.run('UPDATE users SET is_admin = 1 WHERE id = ?', [user.id]);
        const token = jwt.sign({ id: user.id, username, isAdmin: true }, JWT_SECRET);
        return res.json({ token, user: { id: user.id, username, isAdmin: true, gold: user.gold } });
      }
    });
    return;
  }
  
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err || !user || !await bcrypt.compare(password, user.password)) {
      attempts.count++;
      attempts.lastAttempt = Date.now();
      loginAttempts.set(ip, attempts);
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    loginAttempts.delete(ip);
    if (user.is_banned) {
      const banActive = user.ban_until && new Date(user.ban_until) > new Date();
      if (banActive) {
        return res.status(403).json({ banned: true, reason: user.ban_reason, until: user.ban_until });
      } else {
        db.run('UPDATE users SET is_banned = 0, ban_reason = NULL, ban_until = NULL WHERE id = ?', [user.id]);
      }
    }
    const token = jwt.sign({ id: user.id, username: user.username, isAdmin: user.is_admin }, JWT_SECRET);
    res.json({ token, user: { id: user.id, username: user.username, isAdmin: user.is_admin, gold: user.gold } });
  });
});

app.get('/api/characters', auth, (req, res) => {
  db.all('SELECT * FROM characters WHERE user_id = ?', [req.user.id], (err, chars) => {
    res.json(chars || []);
  });
});

app.post('/api/characters/:id/level-up', auth, (req, res) => {
  db.get('SELECT * FROM characters WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], (err, char) => {
    if (!char) return res.status(404).json({ error: 'Personagem não encontrado' });
    const expNeeded = char.level * 100;
    if (char.exp < expNeeded) return res.status(400).json({ error: 'EXP insuficiente' });
    
    db.run(`UPDATE characters SET level = level + 1, exp = exp - ?, max_hp = max_hp + 10, max_mp = max_mp + 5, 
            str = str + 2, int = int + 2, agi = agi + 2, hp = max_hp + 10, mp = max_mp + 5 WHERE id = ?`,
      [expNeeded, req.params.id], () => {
      res.json({ message: 'Level UP! +10 HP, +5 MP, +2 todos atributos' });
    });
  });
});

app.post('/api/pve/start', auth, (req, res) => {
  const { charId } = req.body;
  const monsters = [
    { name: 'Goblin', hp: 80, str: 12 },
    { name: 'Orc', hp: 120, str: 18 },
    { name: 'Dragão', hp: 200, str: 25 }
  ];
  const monster = monsters[Math.floor(Math.random() * monsters.length)];
  
  db.run('INSERT INTO pve_battles (character_id, monster_name, monster_hp, monster_max_hp, monster_str) VALUES (?, ?, ?, ?, ?)',
    [charId, monster.name, monster.hp, monster.hp, monster.str], function(err) {
    res.json({ battleId: this.lastID, monster });
  });
});

app.get('/api/pve/:battleId', auth, (req, res) => {
  db.get('SELECT * FROM pve_battles WHERE id = ?', [req.params.battleId], (err, battle) => {
    if (!battle) return res.status(404).json({ error: 'Batalha não encontrada' });
    db.get('SELECT * FROM characters WHERE id = ?', [battle.character_id], (err, char) => {
      res.json({ battle, character: char });
    });
  });
});

app.post('/api/pve/:battleId/action', auth, (req, res) => {
  const { action } = req.body;
  db.get('SELECT * FROM pve_battles WHERE id = ?', [req.params.battleId], (err, battle) => {
    if (!battle || battle.status !== 'active') return res.status(400).json({ error: 'Batalha inválida' });
    
    db.get('SELECT * FROM characters WHERE id = ?', [battle.character_id], (err, char) => {
      let log = [];
      let damage = 0;
      let mpCost = 0;
      
      if (action === 'attack') {
        damage = char.str + Math.floor(Math.random() * 10);
        log.push(`Você atacou causando ${damage} de dano!`);
      } else if (action === 'magic') {
        if (char.mp < 10) return res.status(400).json({ error: 'MP insuficiente' });
        damage = char.int * 2 + Math.floor(Math.random() * 15);
        mpCost = 10;
        log.push(`Você usou magia causando ${damage} de dano!`);
      } else if (action === 'defend') {
        log.push('Você se defendeu!');
      } else if (action === 'ultimate') {
        if (char.mp < char.ultimate_mp_cost) return res.status(400).json({ error: 'MP insuficiente' });
        if (char.ultimate_ready === 0) return res.status(400).json({ error: 'Ultimate em cooldown' });
        damage = char.ultimate_damage;
        mpCost = char.ultimate_mp_cost;
        log.push(`💥 ${char.ultimate_name}! ${damage} de dano devastador!`);
        db.run('UPDATE characters SET ultimate_ready = 0 WHERE id = ?', [char.id]);
      }
      
      let newMonsterHp = battle.monster_hp - damage;
      
      if (newMonsterHp <= 0) {
        db.run('UPDATE pve_battles SET status = ?, monster_hp = 0 WHERE id = ?', ['victory', battle.id]);
        db.run('UPDATE characters SET exp = exp + 25, hp = max_hp, mp = max_mp, ultimate_ready = 1 WHERE id = ?', [char.id]);
        db.run('UPDATE users SET gold = gold + 15 WHERE id = ?', [req.user.id]);
        log.push('🎉 VITÓRIA! +25 EXP, +15 ouro');
        return res.json({ status: 'victory', log });
      }
      
      let monsterDamage = action === 'defend' ? Math.floor(battle.monster_str / 2) : battle.monster_str;
      let newCharHp = char.hp - monsterDamage;
      log.push(`${battle.monster_name} atacou causando ${monsterDamage} de dano!`);
      
      if (newCharHp <= 0) {
        db.run('UPDATE pve_battles SET status = ? WHERE id = ?', ['defeat', battle.id]);
        db.run('UPDATE characters SET hp = max_hp, mp = max_mp, ultimate_ready = 1 WHERE id = ?', [char.id]);
        log.push('💀 DERROTA! Tente novamente.');
        return res.json({ status: 'defeat', log });
      }
      
      db.run('UPDATE pve_battles SET monster_hp = ?, turn = turn + 1 WHERE id = ?', [newMonsterHp, battle.id]);
      db.run('UPDATE characters SET hp = ?, mp = mp - ? WHERE id = ?', [newCharHp, mpCost, char.id]);
      
      if (battle.turn % 3 === 0) {
        db.run('UPDATE characters SET ultimate_ready = 1 WHERE id = ?', [char.id]);
        log.push('⚡ Ultimate pronta!');
      }
      
      res.json({ status: 'active', log, character: { hp: newCharHp, mp: char.mp - mpCost }, monster: { hp: newMonsterHp } });
    });
  });
});

app.post('/api/pvp/challenge', auth, (req, res) => {
  const { opponentId, charId } = req.body;
  db.run('INSERT INTO pvp_battles (challenger_id, opponent_id, challenger_char_id) VALUES (?, ?, ?)',
    [req.user.id, opponentId, charId], function(err) {
    io.emit('pvp_challenge', { from: req.user.username, toId: opponentId, battleId: this.lastID });
    res.json({ message: 'Desafio enviado!', battleId: this.lastID });
  });
});

app.get('/api/pvp/challenges', auth, (req, res) => {
  db.all(`SELECT p.*, u.username as challenger_name FROM pvp_battles p 
          JOIN users u ON p.challenger_id = u.id 
          WHERE p.opponent_id = ? AND p.status = 'pending'`, [req.user.id], (err, battles) => {
    res.json(battles || []);
  });
});

app.post('/api/pvp/:battleId/accept', auth, (req, res) => {
  const { charId } = req.body;
  db.get('SELECT * FROM pvp_battles WHERE id = ?', [req.params.battleId], (err, battle) => {
    if (!battle) return res.status(404).json({ error: 'Batalha não encontrada' });
    
    db.get('SELECT * FROM characters WHERE id = ?', [battle.challenger_char_id], (err, char1) => {
      db.get('SELECT * FROM characters WHERE id = ?', [charId], (err, char2) => {
        const power1 = char1.str + char1.int + char1.agi + char1.hp;
        const power2 = char2.str + char2.int + char2.agi + char2.hp;
        const winner = power1 > power2 ? battle.challenger_id : req.user.id;
        
        db.run('UPDATE pvp_battles SET status = ?, opponent_char_id = ?, winner_id = ? WHERE id = ?',
          ['completed', charId, winner, battle.id]);
        
        if (winner === req.user.id) {
          db.run('UPDATE characters SET exp = exp + 50 WHERE id = ?', [charId]);
          db.run('UPDATE characters SET exp = exp + 10 WHERE id = ?', [char1.id]);
          db.run('UPDATE users SET gold = gold + 30 WHERE id = ?', [req.user.id]);
          db.run('UPDATE users SET gold = gold + 5 WHERE id = ?', [battle.challenger_id]);
          res.json({ result: 'victory', message: '🎉 VITÓRIA! +50 EXP, +30 ouro' });
        } else {
          db.run('UPDATE characters SET exp = exp + 50 WHERE id = ?', [char1.id]);
          db.run('UPDATE characters SET exp = exp + 10 WHERE id = ?', [charId]);
          db.run('UPDATE users SET gold = gold + 30 WHERE id = ?', [battle.challenger_id]);
          db.run('UPDATE users SET gold = gold + 5 WHERE id = ?', [req.user.id]);
          res.json({ result: 'defeat', message: '💀 DERROTA! +10 EXP, +5 ouro' });
        }
      });
    });
  });
});

app.post('/api/friends/add', auth, (req, res) => {
  const { friendUsername } = req.body;
  db.get('SELECT id FROM users WHERE username = ?', [friendUsername], (err, friend) => {
    if (!friend) return res.status(404).json({ error: 'Usuário não encontrado' });
    db.run('INSERT INTO friendships (user_id, friend_id) VALUES (?, ?)', [req.user.id, friend.id], () => {
      res.json({ message: 'Pedido de amizade enviado!' });
    });
  });
});

app.get('/api/friends', auth, (req, res) => {
  db.all(`SELECT f.*, u.username FROM friendships f 
          JOIN users u ON f.friend_id = u.id 
          WHERE f.user_id = ? AND f.status = 'accepted'`, [req.user.id], (err, friends) => {
    res.json(friends || []);
  });
});

app.get('/api/friends/requests', auth, (req, res) => {
  db.all(`SELECT f.*, u.username FROM friendships f 
          JOIN users u ON f.user_id = u.id 
          WHERE f.friend_id = ? AND f.status = 'pending'`, [req.user.id], (err, requests) => {
    res.json(requests || []);
  });
});

app.post('/api/friends/:id/accept', auth, (req, res) => {
  db.run('UPDATE friendships SET status = ? WHERE id = ?', ['accepted', req.params.id], () => {
    res.json({ message: 'Amizade aceita!' });
  });
});

app.get('/api/global-chat', auth, (req, res) => {
  db.all('SELECT * FROM global_chat ORDER BY created_at DESC LIMIT 50', (err, messages) => {
    res.json((messages || []).reverse());
  });
});

app.post('/api/global-chat', auth, (req, res) => {
  const { message } = req.body;
  const cleanMsg = sanitize(message);
  db.run('INSERT INTO global_chat (user_id, username, message) VALUES (?, ?, ?)',
    [req.user.id, req.user.username, cleanMsg], () => {
    io.emit('global_message', { username: req.user.username, message: cleanMsg });
    res.json({ success: true });
  });
});

app.get('/api/shop', auth, (req, res) => {
  db.all(`SELECT * FROM shop_items WHERE datetime(added_at, '+' || duration_hours || ' hours') > datetime('now')`, (err, items) => {
    res.json(items || []);
  });
});

app.post('/api/shop/buy/:itemId', auth, (req, res) => {
  db.get('SELECT * FROM shop_items WHERE id = ?', [req.params.itemId], (err, item) => {
    if (!item) return res.status(404).json({ error: 'Item não encontrado' });
    db.get('SELECT gold FROM users WHERE id = ?', [req.user.id], (err, user) => {
      if (user.gold < item.price) return res.status(400).json({ error: 'Ouro insuficiente' });
      db.run('UPDATE users SET gold = gold - ? WHERE id = ?', [item.price, req.user.id]);
      db.run(`INSERT INTO characters (user_id, name, class, hp, max_hp, mp, max_mp, str, int, agi, ultimate_name, ultimate_damage, ultimate_mp_cost) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.id, item.name, item.class, item.hp, item.hp, item.mp, item.mp, item.str, item.int, item.agi, item.ultimate_name, item.ultimate_damage, item.ultimate_mp_cost],
        () => {
        res.json({ message: 'Personagem comprado!' });
      });
    });
  });
});

app.post('/api/admin/shop/add', auth, adminAuth, (req, res) => {
  const { name, characterClass, price, hp, mp, str, int, agi, ultName, ultDmg, ultMp, duration } = req.body;
  db.run(`INSERT INTO shop_items (name, class, price, hp, mp, str, int, agi, ultimate_name, ultimate_damage, ultimate_mp_cost, duration_hours) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, characterClass, price, hp, mp, str, int, agi, ultName, ultDmg, ultMp, duration], () => {
    res.json({ message: 'Item adicionado à loja!' });
  });
});

app.get('/api/admin/users', auth, adminAuth, (req, res) => {
  db.all('SELECT id, username, gold, is_banned, ban_reason, ban_until FROM users WHERE is_admin = 0', (err, users) => {
    res.json(users || []);
  });
});

app.get('/api/user-ip', auth, (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  res.json({ ip });
});

app.post('/api/admin/ban/:userId', auth, adminAuth, (req, res) => {
  const { reason, hours } = req.body;
  const banUntil = hours ? `datetime('now', '+${hours} hours')` : `datetime('now', '+999 years')`;
  db.get('SELECT username FROM users WHERE id = ?', [req.params.userId], (err, user) => {
    db.run(`UPDATE users SET is_banned = 1, ban_reason = ?, ban_until = ${banUntil} WHERE id = ?`, 
      [reason || 'Violação das regras', req.params.userId], () => {
      io.emit('user_banned', { userId: parseInt(req.params.userId), username: user.username });
      res.json({ message: 'Usuário banido' });
    });
  });
});

app.post('/api/admin/unban/:userId', auth, adminAuth, (req, res) => {
  db.run('UPDATE users SET is_banned = 0, ban_reason = NULL, ban_until = NULL WHERE id = ?', [req.params.userId], () => {
    res.json({ message: 'Usuário desbanido' });
  });
});

app.post('/api/admin/ban-ip', auth, adminAuth, (req, res) => {
  const { ip, reason, hours } = req.body;
  const banUntil = hours ? `datetime('now', '+${hours} hours')` : `datetime('now', '+999 years')`;
  db.run(`INSERT OR REPLACE INTO ip_bans (ip, reason, banned_until) VALUES (?, ?, ${banUntil})`,
    [ip, reason || 'Violação das regras'], () => {
    res.json({ message: 'IP banido' });
  });
});

app.get('/api/admin/ip-bans', auth, adminAuth, (req, res) => {
  db.all('SELECT * FROM ip_bans WHERE datetime(banned_until) > datetime("now")', (err, bans) => {
    res.json(bans || []);
  });
});

app.get('/api/check-ban', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  db.get('SELECT * FROM ip_bans WHERE ip = ? AND datetime(banned_until) > datetime("now")', [ip], (err, ban) => {
    if (ban) return res.json({ banned: true, reason: ban.reason, until: ban.banned_until });
    res.json({ banned: false });
  });
});

app.post('/api/admin/give-gold', auth, adminAuth, (req, res) => {
  const { userId, amount } = req.body;
  db.run('UPDATE users SET gold = gold + ? WHERE id = ?', [amount, userId], () => {
    res.json({ message: `${amount} ouro dado!` });
  });
});

app.post('/api/settings/change-password', auth, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  db.get('SELECT * FROM users WHERE id = ?', [req.user.id], async (err, user) => {
    if (!await bcrypt.compare(oldPassword, user.password)) {
      return res.status(401).json({ error: 'Senha atual incorreta' });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.user.id], () => {
      res.json({ message: 'Senha alterada com sucesso!' });
    });
  });
});

app.delete('/api/settings/delete-account', auth, (req, res) => {
  db.run('DELETE FROM characters WHERE user_id = ?', [req.user.id]);
  db.run('DELETE FROM friendships WHERE user_id = ? OR friend_id = ?', [req.user.id, req.user.id]);
  db.run('DELETE FROM users WHERE id = ?', [req.user.id], () => {
    res.json({ message: 'Conta deletada' });
  });
});

io.on('connection', (socket) => {
  console.log('Usuário conectado');
  socket.on('disconnect', () => console.log('Usuário desconectado'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
