# Levi Baby Shower (PWA)
Projeto estático com funções serverless no Vercel.

## Configuração do Supabase
1. No SQL Editor do projeto Supabase, execute [`supabase/schema.sql`](./supabase/schema.sql).
2. No Vercel, adicione estas variáveis em **Settings > Environment Variables**:
   - `SUPABASE_URL`: Project URL do Supabase.
   - `SUPABASE_SERVICE_ROLE_KEY`: chave `service_role` do Supabase. Mantenha-a somente no servidor; nunca a coloque no HTML.
   - `LEVI_SHARED_PASSWORD`: senha aleatória de pelo menos 16 caracteres, compartilhada com quem planeja a festa.
   - `LEVI_SESSION_SECRET`: segredo aleatório com pelo menos 32 caracteres para assinar as sessões.
3. Faça redeploy. Ao entrar com a senha compartilhada, os dados locais existentes serão enviados se ainda não houver dados no Supabase.

Os dados são salvos em uma única linha compartilhada no Supabase. O `localStorage` permanece como cópia local. A sessão fica ativa por até sete dias; use o botão com a letra **M** para sair.

## Levi AI
Configure `GEMINI_API_KEY` (e, opcionalmente, `GEMINI_MODEL`) no Vercel. Sem a chave, a Levi AI responde em modo demonstração.
