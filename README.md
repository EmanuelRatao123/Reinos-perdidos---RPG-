# 🏰 Reinos Perdidos - RPG Online

Um RPG de mesa online COMPLETO com sistema de login, criação de personagens, combate PvE/PvP, chat em tempo real, poderes especiais e painel administrativo!

## 🎮 Funcionalidades

- **Sistema de Login/Registro** - Crie sua conta e faça login
- **Criação de Personagens** - 3 classes com poderes especiais únicos
- **Combate PvE** - Lute contra monstros e ganhe experiência
- **Combate PvP** - Desafie outros jogadores em batalhas épicas
- **Poderes Especiais** - Cada classe tem habilidade única com cooldown
- **Sistema de Níveis** - Evolua seus personagens e aumente atributos
- **Sistema de Amizades** - Adicione outros jogadores
- **Chat em Tempo Real** - Converse com seus amigos via Socket.IO
- **Painel Admin** - Conta especial para banir usuários e alterar níveis
- **Interface Moderna** - Design bonito com gradientes e animações

## 🚀 Como Hospedar no Render

### 1. Preparar o Código
1. Faça upload de todos os arquivos para um repositório no GitHub
2. Certifique-se que os arquivos estão na raiz do repositório:
   - `package.json`
   - `server.js`
   - `public/index.html`

### 2. Criar Conta no Render
1. Acesse [render.com](https://render.com)
2. Crie uma conta gratuita
3. Conecte sua conta do GitHub

### 3. Deploy no Render
1. No dashboard do Render, clique em **"New +"**
2. Selecione **"Web Service"**
3. Conecte seu repositório do GitHub
4. Configure:
   - **Name**: `reinos-perdidos-rpg`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free (gratuito)

### 4. Variáveis de Ambiente (Opcional)
- `JWT_SECRET`: Uma chave secreta para tokens (ex: `minha_chave_super_secreta_2024`)
- `ADMIN_USER`: Nome do admin (padrão: Emanuel)
- `ADMIN_PASS`: Senha do admin (padrão: Rato123)

### 5. Deploy
1. Clique em **"Create Web Service"**
2. Aguarde o deploy (5-10 minutos)
3. Seu RPG estará online no link fornecido pelo Render!

## 🎯 Como Jogar

1. **Registre-se** - Crie uma conta com usuário e senha
2. **Crie um Personagem** - Escolha nome e classe (cada uma com poder especial)
3. **Batalhe PvE** - Lute contra monstros e ganhe EXP/ouro
4. **Use Poderes Especiais** - Habilidades poderosas com cooldown de 3 turnos
5. **Desafie Jogadores** - Batalhas PvP contra outros jogadores online
6. **Faça Amigos** - Adicione jogadores e converse via chat
7. **Evolua** - Suba de nível e aumente seus atributos

## 👑 Conta Admin

- **Usuário**: Emanuel
- **Senha**: Rato123
- **Poderes**: Banir/desbanir usuários, alterar níveis de personagens

## 🛠️ Tecnologias Usadas

- **Backend**: Node.js + Express
- **Banco**: SQLite
- **Frontend**: HTML + CSS + JavaScript
- **Autenticação**: JWT + bcrypt

## 📱 Classes de Personagem

- **⚔️ Guerreiro**: Mais HP e Força | Poder: Fúria de Batalha
- **🔮 Mago**: Mais MP e Inteligência | Poder: Explosão Arcana
- **🏹 Arqueiro**: Balanceado com Agilidade | Poder: Flecha Perfurante

## 🎮 Sistema de Combate

### PvE (Contra Monstros)
- **Atacar**: Dano baseado na Força
- **Magia**: Dano baseado na Inteligência (custa 10 MP)
- **Defender**: Reduz dano recebido pela metade
- **Poder Especial**: Dano massivo (custa 30 MP, cooldown 3 turnos)
- Ganhe 25 EXP e 15 ouro por vitória!

### PvP (Contra Jogadores)
- Batalha automática baseada nos atributos
- Vitória: +50 EXP, +30 ouro
- Derrota: +10 EXP, +5 ouro

## 💬 Sistema de Chat

- Chat em tempo real com Socket.IO
- Converse com seus amigos
- Mensagens instantâneas

---

**Desenvolvido para ser hospedado no Render - 100% Gratuito!** 🚀