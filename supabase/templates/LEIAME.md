# Modelos de e-mail (Supabase Auth)

Cole cada arquivo em **Authentication → Emails → Templates** no painel do Supabase:

| Modelo no Supabase | Arquivo | Assunto sugerido |
|---|---|---|
| Confirm signup | `confirmar-cadastro.html` | Seu código de ativação do Tech Finance |
| Change Email Address | `trocar-email.html` | Confirme a troca de e-mail da sua conta |
| Reset Password | `redefinir-senha.html` | Redefinição de senha do Tech Finance |
| Magic Link | `link-magico.html` | Seu link de acesso ao Tech Finance |

Para o e-mail sair com o nome **Tech Finance** (e não "Supabase Auth"), configure um SMTP próprio em
**Authentication → Emails → SMTP Settings** (ex.: o mesmo domínio usado no Resend). O SMTP padrão do
Supabase também limita o envio a poucos e-mails por hora.
