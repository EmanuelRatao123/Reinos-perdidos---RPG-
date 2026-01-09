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

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const db = new sqlite3.Database('./rpg.db');

const sanitize = (str) => String(str).replace(/[<>\"']/g, '');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    gold INTEGER DEFAULT 500,
    is_admin BOOLEAN DEFAULT 0,
    is_banned BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS character_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    class TEXT NOT NULL,
    hp INTEGER,
    mp INTEGER,
    str INTEGER,
    int INTEGER,
    agi INTEGER,
    price INTEGER DEFAULT 0,
    image TEXT,
    description TEXT,
    created_by_admin BOOLEAN DEFAULT 1
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS user_characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    template_id INTEGER,
    nickname TEXT,
    level INTEGER DEFAULT 1,
    exp INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (template_id) REFERENCES character_templates (id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    damage INTEGER,
    mp_cost INTEGER,
    cooldown INTEGER,
    effect TEXT,
    created_by_admin BOOLEAN DEFAULT 1
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS shop_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_type TEXT,
    item_id INTEGER,
    price INTEGER,
    duration_hours INTEGER DEFAULT 24,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS battle_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challenger_id INTEGER,
    opponent_id INTEGER,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS global_chat (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`INSERT OR IGNORE INTO character_templates (id, name, class, hp, mp, str, int, agi, price, description) VALUES
    (1, 'Guerreiro Lendário', 'Guerreiro', 150, 50, 20, 10, 12, 1000, 'Um guerreiro poderoso'),
    (2, 'Mago Supremo', 'Mago', 100, 150, 10, 25, 15, 1200, 'Mestre das artes arcanas'),
    (3, 'Arqueiro Élfico', 'Arqueiro', 120, 80, 15, 12, 25, 1100, 'Precisão mortal')`);

  db.run(`INSERT OR IGNORE INTO skills (id, name, damage, mp_cost, cooldown, effect) VALUES
    (1, 'Golpe Devastador', 50, 20, 2, 'Dano massivo'),
    (2, 'Bola de Fogo', 60, 30, 3, 'Dano mágico'),
    (3, 'Flecha Tripla', 45, 25, 2, 'Ataque múltiplo')`);
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
  const cleanUser = sanitize(username);
  const hashedPassword = await bcrypt.hash(password, 10);
  db.run('INSERT INTO users (username, password) VALUES (?, ?)', [cleanUser, hashedPassword], function(err) {
    if (err) return res.status(400).json({ error: 'Usuário já existe' });
    const token = jwt.sign({ id: this.lastID, username: cleanUser, isAdmin: false }, JWT_SECRET);
    res.json({ token, user: { id: this.lastID, username: cleanUser, isAdmin: false } });
  });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const ip = req.ip || req.connection.remoteAddress;
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
      attempts.count++;
      attempts.lastAttempt = Date.now();
      loginAttempts.set(ip, attempts);
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    loginAttempts.delete(ip);
    if (user.is_banned) return res.status(403).json({ error: 'Usuário banido' });
    const token = jwt.sign({ id: user.id, username: user.username, isAdmin: user.is_admin }, JWT_SECRET);
    res.json({ token, user: { id: user.id, username: user.username, isAdmin: user.is_admin, gold: user.gold } });
  });
});

app.get('/api/shop', auth, (req, res) => {
  db.all(`SELECT s.*, c.name, c.class, c.description, c.price as base_price 
          FROM shop_items s 
          JOIN character_templates c ON s.item_id = c.id 
          WHERE s.item_type = 'character' 
          AND datetime(s.added_at, '+' || s.duration_hours || ' hours') > datetime('now')`,
    (err, items) => {
    res.json(items || []);
  });
});

app.post('/api/shop/buy/:itemId', auth, (req, res) => {
  db.get('SELECT * FROM character_templates WHERE id = ?', [req.params.itemId], (err, template) => {
    if (!template) return res.status(404).json({ error: 'Item não encontrado' });
    db.get('SELECT gold FROM users WHERE id = ?', [req.user.id], (err, user) => {
      if (user.gold < template.price) return res.status(400).json({ error: 'Ouro insuficiente' });
      db.run('UPDATE users SET gold = gold - ? WHERE id = ?', [template.price, req.user.id]);
      db.run('INSERT INTO user_characters (user_id, template_id, nickname) VALUES (?, ?, ?)',
        [req.user.id, template.id, template.name], function(err) {
        res.json({ message: 'Personagem comprado!', charId: this.lastID });
      });
    });
  });
});

app.get('/api/my-characters', auth, (req, res) => {
  db.all(`SELECT uc.*, ct.name, ct.class, ct.hp, ct.mp, ct.str, ct.int, ct.agi 
          FROM user_characters uc 
          JOIN character_templates ct ON uc.template_id = ct.id 
          WHERE uc.user_id = ?`, [req.user.id], (err, chars) => {
    res.json(chars || []);
  });
});

app.post('/api/battle/request', auth, (req, res) => {
  const { opponentId } = req.body;
  db.run('INSERT INTO battle_requests (challenger_id, opponent_id) VALUES (?, ?)',
    [req.user.id, opponentId], function(err) {
    if (err) return res.status(500).json({ error: 'Erro ao enviar desafio' });
    io.emit('battle_request', { from: req.user.username, toId: opponentId, requestId: this.lastID });
    res.json({ message: 'Desafio enviado!' });
  });
});

app.get('/api/battle/requests', auth, (req, res) => {
  db.all(`SELECT br.*, u.username as challenger_name 
          FROM battle_requests br 
          JOIN users u ON br.challenger_id = u.id 
          WHERE br.opponent_id = ? AND br.status = 'pending'`, [req.user.id], (err, requests) => {
    res.json(requests || []);
  });
});

app.post('/api/battle/accept/:requestId', auth, (req, res) => {
  db.run('UPDATE battle_requests SET status = ? WHERE id = ?', ['accepted', req.params.requestId]);
  res.json({ message: 'Desafio aceito!' });
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
    [req.user.id, req.user.username, cleanMsg], function(err) {
    io.emit('global_message', { username: req.user.username, message: cleanMsg });
    res.json({ success: true });
  });
});

app.post('/api/admin/character/create', auth, adminAuth, (req, res) => {
  const { name, characterClass, hp, mp, str, int, agi, price, description } = req.body;
  db.run(`INSERT INTO character_templates (name, class, hp, mp, str, int, agi, price, description) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, characterClass, hp, mp, str, int, agi, price, description], function(err) {
    res.json({ message: 'Personagem criado!', id: this.lastID });
  });
});

app.post('/api/admin/skill/create', auth, adminAuth, (req, res) => {
  const { name, damage, mpCost, cooldown, effect } = req.body;
  db.run('INSERT INTO skills (name, damage, mp_cost, cooldown, effect) VALUES (?, ?, ?, ?, ?)',
    [name, damage, mpCost, cooldown, effect], function(err) {
    res.json({ message: 'Skill criada!', id: this.lastID });
  });
});

app.post('/api/admin/shop/add', auth, adminAuth, (req, res) => {
  const { itemId, price, duration } = req.body;
  db.run('INSERT INTO shop_items (item_type, item_id, price, duration_hours) VALUES (?, ?, ?, ?)',
    ['character', itemId, price, duration], function(err) {
    res.json({ message: 'Item adicionado à loja!' });
  });
});

app.get('/api/admin/characters', auth, adminAuth, (req, res) => {
  db.all('SELECT * FROM character_templates', (err, chars) => {
    res.json(chars || []);
  });
});

app.get('/api/admin/skills', auth, adminAuth, (req, res) => {
  db.all('SELECT * FROM skills', (err, skills) => {
    res.json(skills || []);
  });
});

app.post('/api/admin/give-character', auth, adminAuth, (req, res) => {
  const { userId, templateId } = req.body;
  db.run('INSERT INTO user_characters (user_id, template_id, nickname) SELECT ?, ?, name FROM character_templates WHERE id = ?',
    [userId, templateId, templateId], function(err) {
    res.json({ message: 'Personagem dado ao jogador!' });
  });
});

app.get('/api/admin/users', auth, adminAuth, (req, res) => {
  db.all('SELECT id, username, gold, is_banned FROM users WHERE is_admin = 0', (err, users) => {
    res.json(users || []);
  });
});

app.post('/api/admin/ban/:userId', auth, adminAuth, (req, res) => {
  db.run('UPDATE users SET is_banned = 1 WHERE id = ?', [req.params.userId]);
  res.json({ message: 'Usuário banido' });
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