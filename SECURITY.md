# 🔒 GUIA DE SEGURANÇA

## ⚠️ IMPORTANTE - CONFIGURAR NO RENDER

Para proteger sua conta admin contra brute force, configure as variáveis de ambiente no Render:

### 1. Acesse o Dashboard do Render
1. Clique no seu serviço
2. Vá em **"Environment"** no menu lateral

### 2. Adicione as Variáveis
Clique em **"Add Environment Variable"** e adicione:

```
ADMIN_USER=SeuNovoUsuarioAdmin
ADMIN_PASS=SuaSenhaForteAqui123!@#
JWT_SECRET=uma_chave_secreta_muito_longa_e_aleatoria_12345
```

### 3. Salve e Redeploy
1. Clique em **"Save Changes"**
2. O Render vai fazer redeploy automaticamente
3. Agora sua senha não está mais no código!

## 🛡️ PROTEÇÕES IMPLEMENTADAS

✅ **Rate Limiting**: Máximo 5 tentativas de login por IP
✅ **Bloqueio Temporário**: 5 minutos após 5 tentativas falhas
✅ **Senha no Ambiente**: Não está mais no código fonte
✅ **Username retornado**: Corrigido bug do nome ao relogar

## 🔐 DICAS DE SEGURANÇA

1. **Senha Forte**: Use letras, números e símbolos
2. **Não Compartilhe**: Nunca compartilhe suas credenciais
3. **Mude Regularmente**: Troque a senha periodicamente
4. **Use Variáveis**: Sempre use variáveis de ambiente

## ⚡ PROTEÇÃO CONTRA BRUTE FORCE

O sistema agora bloqueia automaticamente após 5 tentativas falhas.
Seu amigo não conseguirá mais fazer brute force! 🚫

---

**Configure as variáveis AGORA para máxima segurança!** 🔒