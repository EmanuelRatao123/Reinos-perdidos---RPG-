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
const ADMIN_USER = 'Emanuel';
const ADMIN_PASS = 'Rato123';

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const db = new sqlite3.Database('./rpg.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    is_admin BOOLEAN DEFAULT 0,
    is_banned BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT NOT NULL,
    class TEXT NOT NULL,
    level INTEGER DEFAULT 1,
    exp INTEGER DEFAULT 0,
    hp INTEGER DEFAULT 100,
    max_hp INTEGER DEFAULT 100,
    mp INTEGER DEFAULT 50,
    max_mp INTEGER DEFAULT 50,
    str INTEGER DEFAULT 10,
    int INTEGER DEFAULT 10,
    agi INTEGER DEFAULT 10,
    gold INTEGER DEFAULT 100,
    special_power TEXT,
    power_cooldown INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS friends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    friend_id INTEGER,
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (friend_id) REFERENCES users (id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id INTEGER,
    to_user_id INTEGER,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
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
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Dados obrigatórios' });
  const hashedPassword = await bcrypt.hash(password, 10);
  db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword], function(err) {
    if (err) return res.status(400).json({ error: 'Usuário já existe' });
    const token = jwt.sign({ id: this.lastID, username, isAdmin: false }, JWT_SECRET);
    res.json({ token, user: { id: this.lastID, username, isAdmin: false } });
  });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
      if (!user) {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run('INSERT INTO users (username, password, is_admin) VALUES (?, ?, 1)', 
          [username, hashedPassword], function(err) {
          const token = jwt.sign({ id: this.lastID, username, isAdmin: true }, JWT_SECRET);
          return res.json({ token, user: { id: this.lastID, username, isAdmin: true } });
        });
      } else {
        db.run('UPDATE users SET is_admin = 1 WHERE id = ?', [user.id]);
        const token = jwt.sign({ id: user.id, username, isAdmin: true }, JWT_SECRET);
        return res.json({ token, user: { id: user.id, username, isAdmin: true } });
      }
    });
    return;
  }
  
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err || !user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    if (user.is_banned) return res.status(403).json({ error: 'Usuário banido' });
    const token = jwt.sign({ id: user.id, username, isAdmin: user.is_admin }, JWT_SECRET);
    res.json({ token, user: { id: user.id, username, isAdmin: user.is_admin } });
  });
});

app.post('/api/characters', auth, (req, res) => {
  const { name, characterClass } = req.body;
  const classData = {
    'Guerreiro': { hp: 120, mp: 30, str: 15, int: 8, agi: 10, power: 'Fúria de Batalha' },
    'Mago': { hp: 80, mp: 100, str: 8, int: 15, agi: 10, power: 'Explosão Arcana' },
    'Arqueiro': { hp: 100, mp: 50, str: 12, int: 10, agi: 15, power: 'Flecha Perfurante' }
  };
  const stats = classData[characterClass];
  db.run(`INSERT INTO characters (user_id, name, class, hp, max_hp, mp, max_mp, str, int, agi, special_power) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, name, characterClass, stats.hp, stats.hp, stats.mp, stats.mp, stats.str, stats.int, stats.agi, stats.power],
    function(err) {
      if (err) return res.status(500).json({ error: 'Erro ao criar personagem' });
      res.json({ id: this.lastID, message: 'Personagem criado!' });
    });
});

app.get('/api/characters', auth, (req, res) => {
  db.all('SELECT * FROM characters WHERE user_id = ?', [req.user.id], (err, characters) => {
    res.json(characters || []);
  });
});

app.get('/api/characters/online', auth, (req, res) => {
  db.all(`SELECT c.*, u.username FROM characters c 
          JOIN users u ON c.user_id = u.id 
          WHERE u.is_banned = 0 AND c.user_id != ?`, [req.user.id], (err, characters) => {
    res.json(characters || []);
  });
});

app.post('/api/battle/:id', auth, (req, res) => {
  const { action } = req.body;
  db.get('SELECT * FROM characters WHERE id = ? AND user_id = ?', [req.params.id, req.user.id], (err, char) => {
    if (err || !char) return res.status(404).json({ error: 'Personagem não encontrado' });
    const enemy = { name: 'Goblin', hp: 60, damage: 12 };
    let playerDmg = 0, enemyDmg = Math.floor(Math.random() * enemy.damage) + 5;
    
    if (action === 'attack') playerDmg = Math.floor(Math.random() * char.str) + 10;
    else if (action === 'magic') {
      if (char.mp < 10) return res.status(400).json({ error: 'MP insuficiente' });
      playerDmg = Math.floor(Math.random() * char.int) + 15;
      char.mp -= 10;
    } else if (action === 'defend') {
      enemyDmg = Math.floor(enemyDmg / 2);
      playerDmg = Math.floor(Math.random() * char.str) + 5;
    } else if (action === 'special') {
      if (char.power_cooldown > 0) return res.status(400).json({ error: `Cooldown: ${char.power_cooldown} turnos` });
      if (char.mp < 30) return res.status(400).json({ error: 'MP insuficiente (30 MP)' });
      playerDmg = Math.floor(Math.random() * (char.str + char.int)) + 25;
      char.mp -= 30;
      char.power_cooldown = 3;
    }
    
    enemy.hp -= playerDmg;
    char.hp -= enemyDmg;
    if (char.power_cooldown > 0 && action !== 'special') char.power_cooldown--;
    
    let result = {
      playerDmg, enemyDmg,
      enemyHp: Math.max(0, enemy.hp),
      playerHp: Math.max(0, char.hp),
      cooldown: char.power_cooldown,
      message: `Você: ${playerDmg} dano | Inimigo: ${enemyDmg} dano`
    };
    
    if (enemy.hp <= 0) {
      char.exp += 25;
      char.gold += 15;
      if (char.exp >= char.level * 100) {
        char.level++;
        char.max_hp += 10;
        char.max_mp += 5;
        char.str += 2;
        char.int += 2;
        char.agi += 2;
        char.hp = char.max_hp;
        char.mp = char.max_mp;
        result.levelUp = true;
      }
      result.victory = true;
      result.message += ' | VITÓRIA! +25 EXP, +15 ouro';
    }
    
    if (char.hp <= 0) {
      char.hp = 1;
      result.defeat = true;
    }
    
    db.run('UPDATE characters SET hp=?, mp=?, exp=?, level=?, max_hp=?, max_mp=?, gold=?, str=?, int=?, agi=?, power_cooldown=? WHERE id=?',
      [char.hp, char.mp, char.exp, char.level, char.max_hp, char.max_mp, char.gold, char.str, char.int, char.agi, char.power_cooldown, req.params.id]);
    
    res.json(result);
  });
});

app.post('/api/pvp/challenge', auth, (req, res) => {
  const { myCharId, opponentCharId } = req.body;
  db.get('SELECT * FROM characters WHERE id = ? AND user_id = ?', [myCharId, req.user.id], (err, myChar) => {
    if (!myChar) return res.status(404).json({ error: 'Seu personagem não encontrado' });
    db.get('SELECT c.*, u.username FROM characters c JOIN users u ON c.user_id = u.id WHERE c.id = ?', 
      [opponentCharId], (err, oppChar) => {
      if (!oppChar) return res.status(404).json({ error: 'Oponente não encontrado' });
      
      let myHp = myChar.hp, oppHp = oppChar.hp, rounds = [];
      while (myHp > 0 && oppHp > 0 && rounds.length < 10) {
        const myDmg = Math.floor(Math.random() * myChar.str) + 10;
        const oppDmg = Math.floor(Math.random() * oppChar.str) + 10;
        oppHp -= myDmg;
        myHp -= oppDmg;
        rounds.push(`Você: ${myDmg} | ${oppChar.username}: ${oppDmg}`);
      }
      
      const victory = myHp > oppHp;
      const expGain = victory ? 50 : 10;
      const goldGain = victory ? 30 : 5;
      myChar.exp += expGain;
      myChar.gold += goldGain;
      myChar.hp = Math.max(1, myHp);
      
      if (myChar.exp >= myChar.level * 100) {
        myChar.level++;
        myChar.max_hp += 10;
        myChar.str += 2;
        myChar.int += 2;
        myChar.agi += 2;
      }
      
      db.run('UPDATE characters SET hp=?, exp=?, level=?, max_hp=?, gold=?, str=?, int=?, agi=? WHERE id=?',
        [myChar.hp, myChar.exp, myChar.level, myChar.max_hp, myChar.gold, myChar.str, myChar.int, myChar.agi, myCharId]);
      
      res.json({ victory, rounds, expGain, goldGain });
    });
  });
});

app.post('/api/friends', auth, (req, res) => {
  const { username } = req.body;
  db.get('SELECT id FROM users WHERE username = ?', [username], (err, friend) => {
    if (err || !friend) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (friend.id === req.user.id) return res.status(400).json({ error: 'Não pode adicionar a si mesmo' });
    db.run('INSERT INTO friends (user_id, friend_id) VALUES (?, ?)', [req.user.id, friend.id], (err) => {
      if (err) return res.status(400).json({ error: 'Já são amigos' });
      res.json({ message: 'Amigo adicionado!' });
    });
  });
});

app.get('/api/friends', auth, (req, res) => {
  db.all(`SELECT DISTINCT u.id, u.username FROM friends f
          JOIN users u ON (f.friend_id = u.id OR f.user_id = u.id)
          WHERE (f.user_id = ? OR f.friend_id = ?) AND u.id != ?`,
    [req.user.id, req.user.id, req.user.id], (err, friends) => {
    res.json(friends || []);
  });
});

app.get('/api/messages/:friendId', auth, (req, res) => {
  db.all(`SELECT m.*, u.username as from_username FROM messages m
          JOIN users u ON m.from_user_id = u.id
          WHERE (m.from_user_id = ? AND m.to_user_id = ?) 
             OR (m.from_user_id = ? AND m.to_user_id = ?)
          ORDER BY m.created_at ASC LIMIT 50`,
    [req.user.id, req.params.friendId, req.params.friendId, req.user.id], (err, messages) => {
    res.json(messages || []);
  });
});

app.post('/api/messages', auth, (req, res) => {
  const { toUserId, message } = req.body;
  db.run('INSERT INTO messages (from_user_id, to_user_id, message) VALUES (?, ?, ?)',
    [req.user.id, toUserId, message], function(err) {
    if (err) return res.status(500).json({ error: 'Erro ao enviar mensagem' });
    io.emit('new_message', { from: req.user.id, to: toUserId, message, username: req.user.username });
    res.json({ success: true });
  });
});

app.get('/api/admin/users', auth, adminAuth, (req, res) => {
  db.all('SELECT id, username, is_banned, created_at FROM users WHERE is_admin = 0', (err, users) => {
    res.json(users || []);
  });
});

app.post('/api/admin/ban/:userId', auth, adminAuth, (req, res) => {
  db.run('UPDATE users SET is_banned = 1 WHERE id = ?', [req.params.userId], (err) => {
    if (err) return res.status(500).json({ error: 'Erro ao banir' });
    res.json({ message: 'Usuário banido' });
  });
});

app.post('/api/admin/unban/:userId', auth, adminAuth, (req, res) => {
  db.run('UPDATE users SET is_banned = 0 WHERE id = ?', [req.params.userId], (err) => {
    if (err) return res.status(500).json({ error: 'Erro ao desbanir' });
    res.json({ message: 'Usuário desbanido' });
  });
});

app.post('/api/admin/setlevel', auth, adminAuth, (req, res) => {
  const { charId, level } = req.body;
  db.run('UPDATE characters SET level = ?, exp = 0 WHERE id = ?', [level, charId], (err) => {
    if (err) return res.status(500).json({ error: 'Erro ao alterar nível' });
    res.json({ message: 'Nível alterado' });
  });
});

app.get('/api/admin/characters', auth, adminAuth, (req, res) => {
  db.all(`SELECT c.*, u.username FROM characters c JOIN users u ON c.user_id = u.id`, (err, chars) => {
    res.json(chars || []);
  });
});

io.on('connection', (socket) => {
  console.log('Usuário conectado');
  socket.on('disconnect', () => console.log('Usuário desconectado'));
});

app.get('*', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>⚔️ Reinos Perdidos - RPG Online</title>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', sans-serif; background: linear-gradient(135deg, #0f0c29, #302b63, #24243e); color: #fff; min-height: 100vh; background-attachment: fixed; }
        .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; padding: 30px; background: rgba(255,255,255,0.05); border-radius: 20px; backdrop-filter: blur(10px); }
        .header h1 { font-size: 4em; background: linear-gradient(45deg, #ffd700, #ffed4e, #ffd700); -webkit-background-clip: text; -webkit-text-fill-color: transparent; animation: glow 2s ease-in-out infinite; }
        @keyframes glow { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.3); } }
        .auth-form, .game-section, .panel { background: rgba(255,255,255,0.08); padding: 30px; border-radius: 20px; margin: 20px 0; backdrop-filter: blur(15px); border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
        .form-group { margin: 15px 0; }
        .form-group label { display: block; margin-bottom: 8px; color: #ffd700; font-weight: bold; }
        .form-group input, .form-group select, .form-group textarea { width: 100%; padding: 14px; border: 2px solid rgba(255,255,255,0.2); border-radius: 10px; background: rgba(255,255,255,0.1); color: #fff; font-size: 16px; transition: all 0.3s; }
        .form-group input:focus, .form-group select:focus, .form-group textarea:focus { outline: none; border-color: #ffd700; background: rgba(255,255,255,0.15); }
        .btn { padding: 14px 28px; border: none; border-radius: 10px; cursor: pointer; font-weight: bold; margin: 5px; transition: all 0.3s; font-size: 16px; text-transform: uppercase; letter-spacing: 1px; }
        .btn-primary { background: linear-gradient(45deg, #4CAF50, #45a049); color: white; }
        .btn-secondary { background: linear-gradient(45deg, #2196F3, #1976D2); color: white; }
        .btn-danger { background: linear-gradient(45deg, #f44336, #d32f2f); color: white; }
        .btn-warning { background: linear-gradient(45deg, #ff9800, #f57c00); color: white; }
        .btn-special { background: linear-gradient(45deg, #9c27b0, #7b1fa2); color: white; }
        .btn:hover { transform: translateY(-3px); box-shadow: 0 6px 20px rgba(0,0,0,0.4); }
        .character-card { background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05)); padding: 25px; border-radius: 15px; margin: 15px 0; border: 2px solid rgba(255,215,0,0.3); transition: all 0.3s; }
        .character-card:hover { transform: translateY(-5px); border-color: rgba(255,215,0,0.6); box-shadow: 0 10px 30px rgba(255,215,0,0.2); }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin: 15px 0; }
        .stat { background: rgba(0,0,0,0.3); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid rgba(255,255,255,0.1); font-weight: bold; }
        .battle-area { background: linear-gradient(135deg, rgba(255,0,0,0.15), rgba(139,0,0,0.15)); padding: 25px; border-radius: 15px; margin: 20px 0; border: 2px solid rgba(255,0,0,0.3); }
        .chat-area { background: linear-gradient(135deg, rgba(0,255,0,0.1), rgba(0,139,0,0.1)); padding: 25px; border-radius: 15px; border: 2px solid rgba(0,255,0,0.3); }
        .pvp-area { background: linear-gradient(135deg, rgba(255,165,0,0.15), rgba(255,140,0,0.15)); padding: 25px; border-radius: 15px; border: 2px solid rgba(255,165,0,0.3); }
        .admin-panel { background: linear-gradient(135deg, rgba(138,43,226,0.2), rgba(75,0,130,0.2)); padding: 30px; border-radius: 15px; border: 2px solid rgba(138,43,226,0.5); }
        .hidden { display: none; }
        .message { padding: 15px; margin: 10px 0; border-radius: 10px; animation: slideIn 0.3s ease-out; }
        @keyframes slideIn { from { transform: translateX(-100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .success { background: rgba(76, 175, 80, 0.4); border-left: 4px solid #4CAF50; }
        .error { background: rgba(244, 67, 54, 0.4); border-left: 4px solid #f44336; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 20px; }
        .chat-messages { height: 300px; overflow-y: auto; background: rgba(0,0,0,0.3); padding: 15px; border-radius: 10px; margin: 15px 0; }
        .chat-message { padding: 10px; margin: 8px 0; border-radius: 8px; background: rgba(255,255,255,0.1); }
        .player-list { max-height: 400px; overflow-y: auto; }
        .player-card { background: rgba(255,255,255,0.08); padding: 15px; margin: 10px 0; border-radius: 10px; border: 1px solid rgba(255,255,255,0.2); transition: all 0.3s; }
        .player-card:hover { background: rgba(255,255,255,0.12); transform: translateX(5px); }
        ::-webkit-scrollbar { width: 10px; }
        ::-webkit-scrollbar-track { background: rgba(0,0,0,0.3); }
        ::-webkit-scrollbar-thumb { background: rgba(255,215,0,0.5); border-radius: 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>⚔️ REINOS PERDIDOS ⚔️</h1>
            <p style="font-size: 1.2em; color: #ffd700;">RPG de Mesa Online Multiplayer</p>
        </div>
        <div id="auth-section">
            <div class="auth-form">
                <h2 style="text-align: center; margin-bottom: 20px;">🏰 Entrar no Reino</h2>
                <div class="form-group"><label>👤 Usuário:</label><input type="text" id="username" placeholder="Digite seu nome de usuário"></div>
                <div class="form-group"><label>🔒 Senha:</label><input type="password" id="password" placeholder="Digite sua senha"></div>
                <div style="text-align: center;"><button class="btn btn-primary" onclick="login()">Entrar</button><button class="btn btn-secondary" onclick="register()">Criar Conta</button></div>
            </div>
        </div>
        <div id="game-section" class="hidden">
            <div class="game-section">
                <h2>Bem-vindo, <span id="player-name" style="color: #ffd700;"></span>! <span id="admin-badge" class="hidden" style="background: purple; padding: 5px 10px; border-radius: 5px; font-size: 14px;">👑 ADMIN</span></h2>
                <button class="btn btn-danger" onclick="logout()">Sair</button>
                <button id="admin-btn" class="btn btn-warning hidden" onclick="toggleAdmin()">Painel Admin</button>
            </div>
            <div id="admin-panel" class="admin-panel hidden">
                <h2>👑 PAINEL DE ADMINISTRAÇÃO</h2>
                <div class="grid"><div class="panel"><h3>👥 Usuários</h3><div id="admin-users-list"></div><button class="btn btn-secondary" onclick="loadAdminUsers()">Atualizar</button></div>
                <div class="panel"><h3>⚔️ Personagens</h3><div id="admin-chars-list"></div><button class="btn btn-secondary" onclick="loadAdminChars()">Atualizar</button></div></div>
            </div>
            <div class="grid">
                <div class="game-section"><h3>🧙♂️ Criar Personagem</h3><div class="form-group"><label>Nome:</label><input type="text" id="char-name" placeholder="Nome do personagem"></div>
                <div class="form-group"><label>Classe:</label><select id="char-class"><option value="Guerreiro">⚔️ Guerreiro - Fúria de Batalha</option><option value="Mago">🔮 Mago - Explosão Arcana</option><option value="Arqueiro">🏹 Arqueiro - Flecha Perfurante</option></select></div>
                <button class="btn btn-primary" onclick="createCharacter()">Criar Personagem</button></div>
                <div class="game-section"><h3>👥 Seus Personagens</h3><div id="characters-list"></div><button class="btn btn-secondary" onclick="loadCharacters()">Atualizar</button></div>
            </div>
            <div id="battle-section" class="battle-area hidden"><h3>⚔️ ARENA DE BATALHA</h3><div id="battle-info"></div>
                <div style="margin: 20px 0;"><button class="btn btn-danger" onclick="battle('attack')">🗡️ Atacar</button><button class="btn btn-primary" onclick="battle('magic')">✨ Magia (-10 MP)</button>
                <button class="btn btn-secondary" onclick="battle('defend')">🛡️ Defender</button><button class="btn btn-special" onclick="battle('special')" id="special-btn">⚡ Poder Especial (-30 MP)</button></div>
                <div id="battle-result"></div></div>
            <div class="pvp-area"><h3>⚔️ BATALHA PvP - Desafiar Jogadores</h3><div class="player-list" id="online-players"></div><button class="btn btn-warning" onclick="loadOnlinePlayers()">Atualizar Jogadores</button></div>
            <div class="grid"><div class="game-section"><h3>👫 Amigos</h3><div class="form-group"><input type="text" id="friend-username" placeholder="Nome do usuário"><button class="btn btn-primary" onclick="addFriend()">Adicionar</button></div>
                <div id="friends-list"></div><button class="btn btn-secondary" onclick="loadFriends()">Atualizar</button></div>
                <div class="chat-area"><h3>💬 Chat</h3><div class="form-group"><select id="chat-friend-select"><option value="">Selecione um amigo</option></select></div>
                <div class="chat-messages" id="chat-messages"></div><div class="form-group"><textarea id="chat-input" rows="2" placeholder="Digite sua mensagem..."></textarea><button class="btn btn-primary" onclick="sendMessage()">Enviar</button></div></div>
            </div>
        </div>
        <div id="messages"></div>
    </div>
    <script>
let token=localStorage.getItem('token'),currentUser=null,currentCharacter=null,socket=io();token&&(showGame(),loadCharacters(),loadFriends());async function api(e,t="GET",a=null){const n={method:t,headers:{"Content-Type":"application/json"}};return token&&(n.headers.Authorization=\`Bearer \${token}\`),a&&(n.body=JSON.stringify(a)),await(await fetch(\`/api\${e}\`,n)).json()}function showMessage(e,t="success"){const a=document.createElement("div");a.className=\`message \${t}\`,a.textContent=e,document.getElementById("messages").appendChild(a),setTimeout((()=>a.remove()),4e3)}async function register(){const e=document.getElementById("username").value,t=document.getElementById("password").value,a=await api("/register","POST",{username:e,password:t});a.token?(token=a.token,currentUser=a.user,localStorage.setItem("token",token),document.getElementById("player-name").textContent=a.user.username,showGame(),showMessage("✅ Conta criada com sucesso!")):showMessage(a.error,"error")}async function login(){const e=document.getElementById("username").value,t=document.getElementById("password").value,a=await api("/login","POST",{username:e,password:t});a.token?(token=a.token,currentUser=a.user,localStorage.setItem("token",token),document.getElementById("player-name").textContent=a.user.username,a.user.isAdmin&&(document.getElementById("admin-badge").classList.remove("hidden"),document.getElementById("admin-btn").classList.remove("hidden")),showGame(),loadCharacters(),loadFriends(),showMessage("✅ Login realizado!")):showMessage(a.error,"error")}function logout(){token=null,currentUser=null,localStorage.removeItem("token"),document.getElementById("auth-section").classList.remove("hidden"),document.getElementById("game-section").classList.add("hidden"),showMessage("👋 Logout realizado!")}function showGame(){document.getElementById("auth-section").classList.add("hidden"),document.getElementById("game-section").classList.remove("hidden")}async function createCharacter(){const e=document.getElementById("char-name").value,t=document.getElementById("char-class").value;if(!e)return showMessage("Digite um nome!","error");const a=await api("/characters","POST",{name:e,characterClass:t});a.message?(showMessage("✅ "+a.message),document.getElementById("char-name").value="",loadCharacters()):showMessage(a.error,"error")}async function loadCharacters(){const e=await api("/characters"),t=document.getElementById("characters-list");0===e.length?t.innerHTML="<p>Nenhum personagem criado.</p>":t.innerHTML=e.map((e=>\`<div class="character-card"><h4>\${e.name} - \${e.class} (Nível \${e.level})</h4><p style="color: #ffd700;">⚡ \${e.special_power}</p><div class="stats"><div class="stat">❤️ \${e.hp}/\${e.max_hp}</div><div class="stat">💙 \${e.mp}/\${e.max_mp}</div><div class="stat">⭐ \${e.exp}/\${100*e.level}</div><div class="stat">💰 \${e.gold}</div><div class="stat">💪 \${e.str}</div><div class="stat">🧠 \${e.int}</div><div class="stat">⚡ \${e.agi}</div></div><button class="btn btn-danger" onclick="startBattle(\${e.id})">Batalhar PvE</button></div>\`)).join("")}function startBattle(e){currentCharacter=e,document.getElementById("battle-section").classList.remove("hidden"),document.getElementById("battle-info").innerHTML='<p style="font-size: 1.5em;">🐉 Um Goblin selvagem apareceu! (60 HP)</p>',document.getElementById("battle-result").innerHTML=""}async function battle(e){if(!currentCharacter)return;const t=await api(\`/battle/\${currentCharacter}\`,"POST",{action:e});if(t.error)return showMessage(t.error,"error");let a=\`<p style="font-size: 1.2em;">\${t.message}</p>\`;a+=\`<p>🐉 Goblin HP: <span style="color: #f44336;">\${t.enemyHp}</span></p>\`,a+=\`<p>👤 Seu HP: <span style="color: #4CAF50;">\${t.playerHp}</span></p>\`,t.cooldown>0&&(a+=\`<p>⏳ Cooldown Poder: \${t.cooldown} turnos</p>\`),t.levelUp&&(a+='<p style="color: #ffd700; font-size: 1.5em;">🎉 LEVEL UP!</p>'),(t.victory||t.defeat)&&(a+='<button class="btn btn-secondary" onclick="endBattle()">Nova Batalha</button>',loadCharacters()),document.getElementById("battle-result").innerHTML=a}function endBattle(){document.getElementById("battle-section").classList.add("hidden"),currentCharacter=null}async function loadOnlinePlayers(){const e=await api("/characters/online"),t=document.getElementById("online-players");0===e.length?t.innerHTML="<p>Nenhum jogador online.</p>":t.innerHTML=e.map((e=>\`<div class="player-card"><h4>\${e.name} (\${e.username}) - \${e.class} Nv.\${e.level}</h4><p>💪 STR: \${e.str} | 🧠 INT: \${e.int} | ⚡ AGI: \${e.agi}</p><button class="btn btn-warning" onclick="challengePlayer(\${e.id})">⚔️ Desafiar</button></div>\`)).join("")}async function challengePlayer(e){const t=await api("/characters");if(0===t.length)return showMessage("Crie um personagem primeiro!","error");const a=t[0].id,n=await api("/pvp/challenge","POST",{myCharId:a,opponentCharId:e});if(n.error)return showMessage(n.error,"error");let s=n.victory?"🎉 VITÓRIA!":"😢 DERROTA!";s+=\`\n+\${n.expGain} EXP, +\${n.goldGain} ouro\n\nRounds:\n\${n.rounds.join("\n")}\`,alert(s),loadCharacters()}async function addFriend(){const e=document.getElementById("friend-username").value;if(!e)return showMessage("Digite o nome!","error");const t=await api("/friends","POST",{username:e});t.message?(showMessage("✅ "+t.message),document.getElementById("friend-username").value="",loadFriends()):showMessage(t.error,"error")}async function loadFriends(){const e=await api("/friends"),t=document.getElementById("friends-list"),a=document.getElementById("chat-friend-select");0===e.length?t.innerHTML="<p>Nenhum amigo adicionado.</p>":(t.innerHTML=e.map((e=>\`<div style="padding: 12px; margin: 8px 0; background: rgba(255,255,255,0.1); border-radius: 8px;">👤 \${e.username}<button class="btn btn-primary" style="padding: 8px 16px; margin-left: 10px;" onclick="openChat(\${e.id}, '\${e.username}')">💬 Chat</button></div>\`)).join(""),a.innerHTML="<option value=\"\">Selecione um amigo</option>"+e.map((e=>\`<option value="\${e.id}">\${e.username}</option>\`)).join(""))}let currentChatFriend=null;function openChat(e,t){currentChatFriend=e,document.getElementById("chat-friend-select").value=e,loadMessages(e)}async function loadMessages(e){if(!e)return;const t=await api(\`/messages/\${e}\`),a=document.getElementById("chat-messages");a.innerHTML=t.map((e=>\`<div class="chat-message" style="background: \${e.from_user_id==currentUser.id?"rgba(33,150,243,0.3)":"rgba(76,175,80,0.3)"};"><strong>\${e.from_username}:</strong> \${e.message}</div>\`)).join(""),a.scrollTop=a.scrollHeight}async function sendMessage(){const e=document.getElementById("chat-friend-select").value,t=document.getElementById("chat-input").value;if(!e||!t)return showMessage("Selecione um amigo e digite uma mensagem!","error");await api("/messages","POST",{toUserId:e,message:t}),document.getElementById("chat-input").value="",loadMessages(e)}function toggleAdmin(){const e=document.getElementById("admin-panel");e.classList.toggle("hidden"),e.classList.contains("hidden")||(loadAdminUsers(),loadAdminChars())}async function loadAdminUsers(){const e=await api("/admin/users"),t=document.getElementById("admin-users-list");t.innerHTML=e.map((e=>\`<div style="padding: 10px; margin: 5px 0; background: rgba(255,255,255,0.1); border-radius: 5px;"><strong>\${e.username}</strong> - \${e.is_banned?"🚫 Banido":"✅ Ativo"}<button class="btn \${e.is_banned?"btn-primary":"btn-danger"}" style="padding: 5px 10px;" onclick="\${e.is_banned?"unbanUser":"banUser"}(\${e.id})">\${e.is_banned?"Desbanir":"Banir"}</button></div>\`)).join("")}async function loadAdminChars(){const e=await api("/admin/characters"),t=document.getElementById("admin-chars-list");t.innerHTML=e.map((e=>\`<div style="padding: 10px; margin: 5px 0; background: rgba(255,255,255,0.1); border-radius: 5px;"><strong>\${e.name}</strong> (\${e.username}) - Nv.\${e.level}<input type="number" id="level-\${e.id}" value="\${e.level}" style="width: 60px; padding: 5px; margin: 0 5px;"><button class="btn btn-warning" style="padding: 5px 10px;" onclick="setLevel(\${e.id})">Alterar</button></div>\`)).join("")}async function banUser(e){await api(\`/admin/ban/\${e}\`,"POST"),showMessage("✅ Usuário banido"),loadAdminUsers()}async function unbanUser(e){await api(\`/admin/unban/\${e}\`,"POST"),showMessage("✅ Usuário desbanido"),loadAdminUsers()}async function setLevel(e){const t=document.getElementById(\`level-\${e}\`).value;await api("/admin/setlevel","POST",{charId:e,level:t}),showMessage("✅ Nível alterado"),loadAdminChars()}socket.on("new_message",(e=>{currentChatFriend&&(e.from==currentChatFriend||e.to==currentChatFriend)&&loadMessages(currentChatFriend)}));
    </script>
</body>
</html>`);
});

server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});