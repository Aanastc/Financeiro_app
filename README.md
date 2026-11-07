# 💎 Finance App — Gestão Financeira Pessoal com IA de Ponta

O **Finance App** é uma plataforma moderna e completa de gestão financeira pessoal construída com arquitetura em camadas, banco de dados relacional (PostgreSQL / Supabase) com isolamento multi-tenant via RLS, e inteligência artificial multimodal (Google Gemini 2.5) para interpretação e estruturação automática de documentos financeiros.

### Principais módulos
- **Finanças pessoais (PF)**: entradas, gastos (com edição de lançamentos e estornos), contas, cartões e faturas, dívidas e renegociações, metas, investimentos e caixinhas.
- **Importador com IA**: extratos, faturas, contratos e comprovantes (PDF, imagem, CSV, OFX, XLSX) viram lançamentos auditáveis.
- **Divisão de contas**: despesas com pessoas e grupos, cobranças opcionais (aceitar/recusar — o aceite vale para as parcelas seguintes), convite para a outra pessoa entrar no app e ver o que foi dividido com ela, **"Paguei" por item/parcela com confirmação de quem recebe**, relatórios em Excel e avisos no app (sino em tempo real) e por e-mail.
- **Empresa (CNPJ/MEI)**: módulo opcional, ativado no cadastro ou no perfil — faturamento, impostos, pró-labore e contas da empresa separadas das pessoais.
- **Consultor financeiro (educador com IA)**: diagnóstico com base nos números reais do usuário (médias mensais, reserva em meses, peso das dívidas, gastos recorrentes, metas), jornada em 4 etapas, plano de ação passo a passo, lição prática e chat com memória da conversa. Se a IA estiver indisponível, o app gera o plano com as mesmas regras.

---

## 🏛️ 1. Arquitetura em Camadas da IA de Importação

A IA atua estritamente como **camada de interpretação, classificação e estruturação**. **Em nenhuma hipótese a IA gera SQL ou executa inserções cegas no banco de dados.**

```text
               ARQUIVO DO USUÁRIO (PDF, Imagem, CSV, OFX, XLSX)
                                     │
                                     ▼
                CAMADA 1: PROCESSAMENTO & IDEMPOTÊNCIA
               • Hash criptográfico SHA-256 do arquivo (Web Crypto API)
               • Verificação de duplicidade em documentos_importados
               • Registro inicial: status = 'PROCESSANDO'
                                     │
                                     ▼
                 CAMADA 2: IA & EXTRAÇÃO ESTRUTURADA
               • Gemini 2.0 / 2.5 Flash Multimodal
               • Extração estruturada com nível de confiança (0.00 a 1.00)
               • Retorno de JSON estrito (PROIBIDO QUALQUER SQL OU INSERT)
                                     │
                                     ▼
                  CAMADA 3: VALIDAÇÃO DE SCHEMA
               • Validador de Tipos por Tipo de Documento
               • Rejeição imediata de campos essenciais faltantes
                                     │
                                     ▼
               CAMADA 4: REGRAS DE NEGÓCIO & SEGURANÇA
               • Isolamento Multi-Tenant: auth.uid() obrigatório
               • Validação de Contas/Cartões/Faturas pertencentes ao mesmo usuário
               • Proibição de inventar dados (campos ausentes ficam nulos)
                                     │
                                     ▼
                      DECISÃO DE CONFIRMAÇÃO
               • Empréstimos / Renegociações / Confiança < 0.85 ─► AGUARDANDO_CONFIRMAÇÃO
               • Extratos / Faturas seguros (Confiança >= 0.85) ─► AUDITORIA / SALVAMENTO
                                     │
                                     ▼
                 CAMADA 5: SERVIÇOS DE DOMÍNIO FINANCEIRO
               • Empréstimo: cria dividas + parcelas_divida (0 transações imediatas)
               • Renegociação: cria divida renegociacao_cartao + parcelas + link fatura_origem
               • Extrato Bancário: cria transacoes + movimentacoes de conta
               • Fatura de Cartão: compras vinculadas à fatura (sem debitar conta)
               • Comprovante: quitação de parcelas ou despesa confirmada
                                     │
                                     ▼
                 CAMADA 6: BANCO DE DADOS & RASTREABILIDADE
               • Tabelas atualizadas com FK documento_importado_id
               • documentos_importados atualizado com status = 'PROCESSADO'
```

---

## 📑 2. Tipos de Documentos Suportados pela IA

A arquitetura possui discriminadores e validadores de schema especializados para:

| Tipo de Documento | Identificação pela IA | Ação Contábil no Domínio | Confirmação |
| :--- | :--- | :--- | :---: |
| **Contrato de Empréstimo** | Termos de contrato, quadro resumo, CET, parcelamento | Cria `dividas` e $N$ `parcelas_divida`. **Zero despesas imediatas**. | **Obrigatória** |
| **Contrato de Financiamento** | Financiamentos imobiliários/veiculares | Cria obrigação futura em `dividas` e `parcelas_divida`. | **Obrigatória** |
| **Renegociação de Cartão** | Acordos de fatura, parcelamentos de saldo rotativo | Cria dívida `renegociacao_cartao`, parcelas e link com `fatura_origem_id`. | **Obrigatória** |
| **Fatura de Cartão** | Extratos de cartão (CSV, PDF), parcelamentos 1/10 | Cria `transacoes` atreladas a `cartao_id` e `fatura_id`. **Não debita conta corrente**. | Auditável |
| **Extrato Bancário** | Débitos, PIX, TEDs, saques (PDF, CSV, OFX) | Cria `transacoes` e `movimentacoes` de débito/crédito na conta corrente. | Auditável |
| **Comprovante de Pagamento** | Boletos, comprovantes de quitação | Localiza parcela de dívida ou fatura em aberto e dá baixa no saldo e obrigação. | **Obrigatória** |
| **Comprovante de Transferência** | Pix/TED entre contas próprias | Cria 1 transação contábil e 2 movimentações (saída na origem e entrada no destino). | Auditável |
| **Documento de Investimento** | Extratos de fundos, CDBs, ações | Cria ou atualiza registros patrimoniais em `investimentos`. | Auditável |

---

## 🔒 3. Segurança, Idempotência e Rastreabilidade

- **Idempotência Real**: Antes de qualquer chamada externa, é computado o hash criptográfico **SHA-256** do documento no navegador (`window.crypto.subtle.digest`). Arquivos idênticos reenviados são interceptados pela constraint `UNIQUE (usuario_id, hash_arquivo)` na tabela `documentos_importados`.
- **Rastreabilidade Contábil**: As tabelas `transacoes`, `dividas` e `faturas` possuem a coluna de chave estrangeira `documento_importado_id`, permitindo auditar a qualquer momento qual documento originou cada obrigação ou lançamento.
- **Isolamento Multi-Tenant**: Políticas ativas de **Row Level Security (RLS)** no PostgreSQL garantem que usuários nunca acessem, alterem ou associem dados, contas ou faturas pertencentes a outros usuários (`auth.uid() = usuario_id`).

---

## 🗄️ 4. Estrutura do Banco de Dados (PostgreSQL / Supabase)

### Núcleo Contábil
- **`transacoes`**: O livro-razão (ledger) contábil. Toda entrada, despesa, fatura, aporte ou transferência possui um registro imutável aqui.
- **`movimentacoes`**: O reflexo de caixa nas contas bancárias (`ENTRADA` ou `SAIDA`). Compras no crédito geram `transacoes`, mas não geram `movimentacoes` de conta até a fatura ser paga.
- **`transferencias`**: Metadados de transferências entre duas contas próprias.
- **`contas_bancarias`**: Contas correntes, carteiras e contas de pagamento.
- **`cartoes` & `faturas`**: Cartões de crédito, limites, datas de fechamento/vencimento e faturas mensais.
- **`dividas`, `parcelas_divida` & `pagamentos_divida`**: Módulo dedicado a contratos de empréstimos, financiamentos e renegociações com controle de parcelas futuras e quitações parciais/totais.
- **`documentos_importados`**: Tabela de auditoria do motor de IA contendo hash do arquivo, status (`PENDENTE`, `PROCESSANDO`, `AGUARDANDO_CONFIRMACAO`, `PROCESSADO`, `ERRO`), JSONB extraído e nível de confiança.
- **`metas` & `metas_depositos`**: Objetivos financeiros com progresso e histórico de aportes.
- **`investimentos` & `historico_investimentos`**: Carteira de ativos e rentabilidade.
- **`contatos`**: Gestão de devedores e terceiros para divisão de despesas (com vínculo à conta de quem aceitou o convite).
- **`grupos` & `grupo_membros`**: Grupos de divisão (viagem, casa, casal...). Quem foi convidado lê os grupos de que participa por funções `SECURITY DEFINER`, que expõem só nomes — nunca e-mail ou telefone.
- **`notificacoes` & `notificacoes_email`**: Avisos do sino (tempo real) e registro de e-mails enviados. Avisos para outra pessoa só nascem de funções do banco que conferem o vínculo.
- **`empresas`**: Empresa (CNPJ/MEI) do usuário; contas e cartões da empresa ficam fora das telas pessoais.

---

## 💻 5. Estrutura do Monorepo

```text
finance-app/
├── apps/
│   ├── web/                               # Aplicação Web (Vite + React 19 + Tailwind v4)
│   │   └── src/
│   │       ├── components/                # Componentes reutilizáveis e modais
│   │       │   ├── divisao/               # Divisão de contas (pessoas, histórico, pagamentos para confirmar)
│   │       │   └── pj/                    # Componentes do módulo empresa
│   │       ├── contexts/                  # Contextos globais (ImportarContext, etc.)
│   │       ├── layouts/                   # DashboardLayout (sidebar responsiva, topo, PF x Empresa)
│   │       ├── lib/                       # Regras de tela sem React
│   │       │   ├── contextoFinanceiro.ts  # Retrato financeiro do usuário para o consultor
│   │       │   ├── educadorFinanceiro.ts  # Persona, prompts e plano local do consultor
│   │       │   ├── lancamentos.ts         # Regras comuns de lançamentos (o que soma, parte de terceiros)
│   │       │   └── relatorioDivisao.ts    # Planilhas Excel da divisão de contas
│   │       ├── pages/
│   │       │   ├── acesso/                # Landing, login, cadastro, verificação e senha
│   │       │   ├── comum/                 # Contas e Importador (PF e empresa)
│   │       │   ├── pf/                    # Entradas, Gastos, Cartões, Faturas, Dívidas, Devedores,
│   │       │   │                          # Metas, Investimentos e Consultor
│   │       │   └── pj/                    # Empresa (CNPJ/MEI)
│   │       └── index.css                  # Design system Dark/Light e barras de rolagem
│   └── mobile/                            # App mobile (Expo / React Native)
├── packages/
│   ├── services/                          # Serviços de domínio financeiro e integrações
│   │   ├── ai.service.ts                  # Cliente da IA (chama a Edge Function, sem chave no navegador)
│   │   ├── auth.service.ts                # Cadastro, login, perfil e recuperação de senha
│   │   ├── convite.service.ts             # Convites, "compartilhado comigo", grupos e "Paguei"
│   │   ├── despesas-compartilhadas.service.ts # Grupos e divisão de despesas
│   │   ├── document-import.service.ts     # Pipeline de importação com IA e validação de schema
│   │   ├── empresa.service.ts             # Módulo empresa (CNPJ/MEI) e retiradas
│   │   ├── finance.service.ts             # Regras de negócio contábeis e persistência
│   │   ├── notificacoes.service.ts        # Sino de avisos e lembretes de vencimento
│   │   ├── recebimentos-divisao.service.ts # Recebimentos da divisão de contas e conciliação do Pix
│   │   ├── paginacao.ts                   # Busca paginada (o Supabase limita 1000 linhas por consulta)
│   │   └── supabase.ts                    # Cliente Supabase com persistência segura
│   └── utils/                             # Ciclos de fatura, datas, parcelas, dívidas, instituições
├── supabase/
│   ├── functions/
│   │   ├── ai-generate/                   # Edge Function: proxy autenticado para o Gemini
│   │   └── notificar-divisao/             # Edge Function: e-mail para quem participa de uma divisão
│   ├── migrations/                        # (ignorado pelo git) ajustes_supabase.sql — só o que falta rodar
│   └── historico/                         # (ignorado pelo git) SQL já aplicado
├── scripts/                               # Scripts de automação e testes automatizados
│   └── test_auditoria_regras_financeiras.mjs
└── lançamentos/                           # (ignorado pelo git) amostras locais de documentos
```

---

## 🚀 6. Como Executar o Projeto

### Pré-requisitos
- Node.js 20+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (para as Edge Functions)
- Chave de API do Google AI Studio (Gemini) — fica **somente no servidor**

### 1. Clonar e Instalar Dependências
```bash
git clone https://github.com/Aanastc/Financeiro_app.git
cd Financeiro_app
npm install
```

### 2. Configurar o Supabase (banco + IA)
```bash
supabase link --project-ref <seu-project-ref>
supabase secrets set GEMINI_API_KEY=sua_chave      # a chave NUNCA vai para o front-end
supabase functions deploy ai-generate

# E-mails da divisão de contas (opcional; sem isso, os avisos ficam só no sino do app)
supabase secrets set RESEND_API_KEY=re_xxx EMAIL_REMETENTE="Tech Finance <avisos@seudominio.com>" APP_URL=https://<seu-dominio>
supabase functions deploy notificar-divisao
```
> ⚠️ Não use variáveis `VITE_*` para chaves secretas: tudo que começa com `VITE_` é embutido no JavaScript publicado.

O SQL do banco fica fora do git: `supabase/migrations/ajustes_supabase.sql` traz **somente o que ainda falta rodar** no **SQL Editor** do Supabase (sempre aditivo e idempotente); o que já foi aplicado fica guardado em `supabase/historico/sql_ja_aplicado.sql`.

No painel do Supabase, em **Authentication → URL Configuration**, inclua `https://<seu-dominio>/reset-password` (e `http://localhost:5173/reset-password`) em **Redirect URLs** para a recuperação de senha.

### 3. Iniciar o Servidor de Desenvolvimento
```bash
cd apps/web
npm run dev
```
Acesse a aplicação no navegador em `http://localhost:5173`.

### 4. Executar os Testes de Regras Financeiras
```bash
node scripts/test_auditoria_regras_financeiras.mjs
```

### 5. Validar Tipos e Build de Produção
```bash
cd apps/web
npm run build      # roda a checagem de tipos (tsconfig.app.json) e depois o build do Vite
```

Para a divisão de contas funcionar entre duas contas (convite, "compartilhado comigo", grupos e "Paguei"), o SQL pendente precisa ter sido aplicado no Supabase **antes** de publicar o front-end.

---

## 🎨 7. Design System e Acessibilidade
- **Dark Mode & Light Mode**: Implementação com Tailwind CSS v4 e variáveis semânticas para contraste e legibilidade ideais em qualquer tela.
- **Responsivo**: sidebar aberta em telas grandes, só com ícones em telas médias (abre por cima do conteúdo) e gaveta no celular; barras de rolagem finas que seguem o tema.
- **Componentes Dinâmicos**: Animações fluidas via `framer-motion`, ícones consistentes via `lucide-react` e notificações reativas com `react-hot-toast`.
- **Prevenção de Falhas**: Modais com backdrop blur, validação em tempo real de inputs e bloqueio de envios inválidos.

---

## 📄 8. Licença
© ANA LETICIA TECH. Todos os direitos reservados.

Este projeto é de propriedade da ANA LETICIA TECH e está publicado apenas para fins de portfólio. Não é permitido copiar, modificar, distribuir ou usar comercialmente o código sem autorização expressa.
