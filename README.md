# PendixApp

App mobile do Pendix (gestão de pendências de documentos para escritórios de
contabilidade), construído com Expo + React Native, espelhando o produto web
em `Flash20/src/pendix/`.

## Stack

- Expo SDK 57 + Expo Router (navegação por arquivos)
- NativeWind (Tailwind para React Native) — mesma paleta do site (`#06000f`, roxo/violeta)
- Supabase JS (mesmo projeto do Flash20) com sessão persistida via AsyncStorage
- lucide-react-native (mesmos ícones do site)

## Rodando

```bash
npm install
npm start          # abre o menu do Expo (QR code p/ Expo Go, ou pressione w/a/i)
npm run web         # abre direto no navegador
```

Configure `.env` (veja `.env.example`) com a URL e a anon key do projeto Supabase.

## Autenticação

Login real via Supabase Auth (`supabase.auth.signInWithPassword`), buscando o
perfil (`role`, `escritorio_id`, `telas`) na tabela `usuarios` — mesmo fluxo do
`AuthProvider` do site, adaptado para React Native (`context/AuthContext.tsx`).

## Estrutura

```
app/
  _layout.tsx          # layout raiz (AuthProvider + Stack)
  index.tsx             # redireciona pra /login ou /(app) conforme sessão
  login.tsx
  (app)/
    _layout.tsx          # tabs protegidas por autenticação
    index.tsx             # Dashboard
    pendencias/
      index.tsx           # lista + filtros
      [id].tsx             # detalhe + conversa do WhatsApp
      nova.tsx             # criar pendência
lib/
  supabase.ts           # cliente Supabase (AsyncStorage)
  session.ts             # espelho síncrono do usuário logado, usado pelos services
context/
  AuthContext.tsx
services/
  pendix.ts              # camada de dados (Supabase), porta de src/pendix/services/pendix.ts
```

## Status

Fluxo principal (login → dashboard → listar/criar/ver pendências) funcionando
com dados reais. Ainda faltam: Clientes, Calendário, Histórico, Notificações,
Configurações — a portar do site em `Flash20/src/pendix/pages/`.
