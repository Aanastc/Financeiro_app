# Financeiro App

Bem-vindo ao repositório do **Financeiro App**! Este projeto é um aplicativo completo de gestão financeira, projetado para ajudar os usuários a controlarem seus ganhos, gastos, cartões, dívidas e investimentos de forma intuitiva.

---

## 1. Estrutura do Projeto (Monorepo)
A arquitetura baseia-se em um monorepo estruturado para compartilhar lógica e UI entre as aplicações Frontend.

- `apps/web`: Aplicação web desenvolvida com React, contendo todas as telas, componentes visuais e lógica da versão para navegador.
- `apps/mobile`: Aplicação mobile desenvolvida com React Native / Expo.
- `packages/`: Módulos compartilhados para evitar duplicação de código.
  - `services`: Regras de negócio, chamadas à API, integrações.
  - `types`: Definições de tipos do TypeScript.
  - `ui`: Componentes genéricos e sistema de design (Design System).
- `scripts/`: Scripts em Python voltados para processamento de dados e rotinas de backend (ex: consolidação e importação de lançamentos).

## 2. Páginas (Web App)
As páginas principais da aplicação web estão em `apps/web/src/pages/`. Cada uma foca em um pilar de controle financeiro:

### 2.1. Autenticação e Onboarding
- **LandingPage.tsx**: Página inicial institucional para apresentar o app para novos visitantes.
- **LoginWeb.tsx**: Tela de login do usuário.
- **RegisterWeb.tsx**: Tela de criação de nova conta.
- **ForgotPasswordWeb.tsx**: Solicitação de recuperação de senha.
- **ResetPasswordWeb.tsx**: Definição da nova senha.
- **VerifyWeb.tsx**: Fluxo de verificação de conta (e-mail).

### 2.2. Visões Gerais e Relatórios
- **ConsultorInteligente.tsx**: Painel avançado com insights automáticos sobre os hábitos financeiros.
- **Importador.tsx**: Tela para processar planilhas e extratos importados do banco ou outras ferramentas.

### 2.3. Receitas e Despesas
- **Entradas.tsx**: Gerenciamento de ganhos, salários e rendimentos (adicionar, listar, editar).
- **Gastos.tsx**: Registro de despesas diárias, categorização e histórico completo.

### 2.4. Cartões e Faturas
- **Cartoes.tsx**: Cadastro e gestão de cartões de crédito/débito, limites, datas de vencimento.
- **Faturas.tsx**: Visão mensal detalhada por fatura, controle do que está em aberto, fechado ou pago.

### 2.5. Empréstimos e Dívidas
- **Dividas.tsx**: Registro de pendências e empréstimos.
- **Devedores.tsx**: Gestão de contatos associados a dívidas (quem deve, para quem deve).

### 2.6. Metas e Investimentos
- **Metas.tsx**: Controle de objetivos financeiros e visualização do progresso.
- **Investimentos.tsx**: Acompanhamento da carteira de aplicações.

## 3. Funcionalidades Detalhadas

1. **Controle de Fluxo de Caixa (Entradas e Gastos)**
   - Lançamento de despesas e receitas.
   - Categorização avançada para analisar de onde vem e para onde vai o dinheiro.
   - Consolidação de saldo geral.

2. **Gestão de Crédito e Faturas**
   - Vinculação de gastos a cartões de crédito específicos.
   - Visualização por fatura, prevenindo surpresas na data de fechamento e vencimento.
   
3. **Cobranças e Dívidas**
   - Mantém um histórico de pessoas com pendências financeiras com o usuário (ou vice-versa), unindo o aspecto de relacionamento à cobrança financeira.

4. **Automação de Importação de Dados**
   - Possibilidade de importar extratos massivos em formato de planilha.
   - Exportação de relatórios para `.xlsx` para backup e análises externas.

5. **Acompanhamento Patrimonial**
   - Visão consolidada de Metas e Investimentos para focar a longo prazo.

## 4. Aspectos Técnicos e Lógicos

### 4.1. Stack Tecnológico
- **Frontend / Mobile**: React, React Native (Expo), TypeScript.
- **Backend / Processamento de Dados**: Utiliza Python para rotinas pesadas.
  - Script `finance_processor.py`: Lida com regras de negócio em lote, processando gastos e consolidando lançamentos.
  - Script `consolidar_lançamentos.py`: Agrupa lançamentos por períodos, categorias, ou contas, gerando visões preparadas para a interface.
  - Integração aparente com o banco de dados (ex. via Supabase, sugerido pelo arquivo `peek_supabase.py`).

### 4.2. Fluxo Lógico do Processamento
Quando o usuário importa um extrato bancário ou uma planilha de dados consolidados:
1. Os dados chegam brutos e são lidos via `Importador.tsx`.
2. O processamento assíncrono (ou script Python) normaliza as categorias e verifica inconsistências (gastos de débito via `processar_gastos_debito.py`).
3. O `finance_processor.py` orquestra a persistência e garante a integridade referencial (por exemplo, abatendo valores das faturas, atribuindo a cartões adequados e atualizando os devedores ou saldos).
4. O backend expõe as visualizações consolidadas de volta para a UI (Web/Mobile), alimentando gráficos e relatórios dinamicamente.
