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
app.use(express.static('.'));

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
  res.sendFile(path.join(__dirname, 'index.html'));
});

server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});