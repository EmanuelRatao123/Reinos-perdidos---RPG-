# 🔄 MANTER SITE SEMPRE ATIVO (GRÁTIS)

## Problema
O Render no plano gratuito desliga o servidor após 15 minutos sem uso. Quando alguém acessa, demora 30-50 segundos para "acordar".

## Solução Gratuita - Cron-job.org

### Passo 1: Criar Rota de Health Check
Já está pronto! O servidor responde em qualquer rota.

### Passo 2: Configurar Cron-job.org

1. **Acesse**: https://cron-job.org
2. **Crie uma conta gratuita**
3. **Clique em "Create cronjob"**
4. **Configure:**
   - **Title**: Reinos Perdidos Keep Alive
   - **URL**: https://reinos-perdidos-rpg-online.onrender.com
   - **Schedule**: A cada 10 minutos
     - Minute: `*/10` (a cada 10 minutos)
     - Hour: `*`
     - Day: `*`
     - Month: `*`
     - Weekday: `*`
   - **Enabled**: ✅ Sim

5. **Salve!**

### Resultado
✅ Seu site nunca vai dormir
✅ Sempre responde rápido
✅ 100% gratuito
✅ Sem precisar pagar nada

## Alternativas Gratuitas

### Opção 2: UptimeRobot
1. Acesse: https://uptimerobot.com
2. Crie conta gratuita
3. Add New Monitor:
   - Monitor Type: HTTP(s)
   - URL: https://reinos-perdidos-rpg-online.onrender.com
   - Monitoring Interval: 5 minutos
4. Salve!

### Opção 3: Koyeb (Hospedagem Alternativa)
- Não desliga nunca
- 100% gratuito
- Mais rápido que Render
- Link: https://koyeb.com

## ⚠️ Importante
- Cron-job.org: Limite de 50 jobs gratuitos
- UptimeRobot: Limite de 50 monitores gratuitos
- Ambos são mais que suficientes!

## 🎯 Recomendação
Use **Cron-job.org** - é o mais simples e eficiente!