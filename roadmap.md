# Finora — roadmap

## Feito
- Lovable Cloud ativo (banco + login por e-mail/senha + Google)
- Tabelas: profiles, messages, transactions (com RLS por usuário)
- Conversa com o agente financeiro (registro, correção de categoria, resumo)
- Identidade visual: paleta, fontes, logo e ícone do app

## Em andamento
- Ajustar tabelas ao formato pedido: profiles (full_name, monthly_income_cents),
  transactions (description, amount_cents, type, category, occurred_at), goals
- Recuperação de senha (envio de link + tela /reset-password)
- Painel com saldo, gastos por categoria e metas, usando dados reais
- Primeiro nome e iniciais do usuário no painel
- Estados de carregando / erro / lista vazia; atualizar após criar, editar, excluir
- Mensagens de erro em português

## Regras
- Sem integração bancária
- user_id sempre vindo da sessão autenticada, nunca do navegador
