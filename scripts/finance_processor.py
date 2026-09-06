import os
import pandas as pd
import uuid
import re
from datetime import datetime

# ==========================================
# CONFIGURAÇÕES DE CAMINHOS
# ==========================================
base_dir = r"C:\Users\anale\OneDrive\Documentos\Carreira\Projetos para Portifolio\finance-app"
input_dir = os.path.join(base_dir, "lançamentos")
output_dir = os.path.join(base_dir, "consolidado")
user_id = '8fc136f2-5b4b-4ce3-9ca7-3b713e1a3fee'

if not os.path.exists(output_dir):
    os.makedirs(output_dir)

# ==========================================
# REGRAS DE LIMPEZA E CLASSIFICAÇÃO
# ==========================================
prefixos_para_remover = [
    r"Compra no d[eé]bito - ",
    r"DEBITO VISA ELECTRON BRASIL ",
    r"PIX ENVIADO ",
    r"Transferência enviada pelo Pix - ",
    r"PAGAMENTO DE BOLETO - ",
    r"PAGAMENTO BOLETO ",
    r"\d{2}\.\d{3}\.\d{3}\s+", 
]

regras_keywords = [
    {"keyword": "Farmacia", "nova_desc": "Farmácia", "cat": "Saúde", "tipo": "Renda fixa (essencial)"},
    {"keyword": "Drogasil", "nova_desc": "Farmácia", "cat": "Saúde", "tipo": "Renda fixa (essencial)"},
    {"keyword": "TG CLINICA", "nova_desc": "Psicóloga", "cat": "Saúde", "tipo": "Renda fixa (essencial)"},
    {"keyword": "Porao Messejana", "nova_desc": "Academia", "cat": "Saúde", "tipo": "Renda fixa (essencial)"},
    {"keyword": "Fiap", "nova_desc": "Pós-graduação", "cat": "Educação", "tipo": "Renda fixa (essencial)"},
    {"keyword": "TEACHER DEBORA", "nova_desc": "Curso de Inglês", "cat": "Educação", "tipo": "Renda fixa (essencial)"},
    {"keyword": "Centerbox", "nova_desc": "Supermercado", "cat": "Alimentação", "tipo": "Renda fixa (essencial)"},
    {"keyword": "R Center", "nova_desc": "Supermercado", "cat": "Alimentação", "tipo": "Renda fixa (essencial)"},
    {"keyword": "Bom Vizinho", "nova_desc": "iFood (Mercado)", "cat": "Alimentação", "tipo": "Renda variável"},
    {"keyword": "la Mozzarella", "nova_desc": "iFood (Pizzaria)", "cat": "Alimentação", "tipo": "Lazer"},
    {"keyword": "Rv Comida Veg", "nova_desc": "Restaurante", "cat": "Alimentação", "tipo": "Renda variável"},
    {"keyword": "Claro P*Fatura", "nova_desc": "Plano de Celular", "cat": "Serviços", "tipo": "Renda fixa (essencial)"},
    {"keyword": "Amanda Christina", "nova_desc": "Cabelo", "cat": "Beleza", "tipo": "Renda variável"},
    {"keyword": "Cacau Show", "nova_desc": "Cacau Show", "cat": "Lazer", "tipo": "Lazer", "dividir": True},
    {"keyword": "Spotify", "nova_desc": "Spotify", "cat": "Lazer", "tipo": "Renda variável"},
    {"keyword": "Microsoft Store", "nova_desc": "Microsoft / Jogos", "cat": "Lazer", "tipo": "Lazer"},
    {"keyword": "SMARTGAMES", "nova_desc": "Jogos", "cat": "Lazer", "tipo": "Lazer"},
    {"keyword": "NATURA PAY", "nova_desc": "Natura", "cat": "Beleza", "tipo": "Renda variável"},
    {"keyword": "OBOTICARIO", "nova_desc": "O Boticário", "cat": "Beleza", "tipo": "Renda variável"},
    {"keyword": "SHEIN", "nova_desc": "Shein / Roupas", "cat": "Lazer", "tipo": "Lazer"},
    {"keyword": "MP JOIAS", "nova_desc": "Acessórios / Joias", "cat": "Lazer", "tipo": "Lazer"},
    {"keyword": "ANA EUNICE ARA", "nova_desc": "Curso de Inglês", "cat": "Educação", "tipo": "Renda fixa (essencial)"},
    {"keyword": "PGTO BOLETO", "nova_desc": "Curso de Inglês", "cat": "Educação", "tipo": "Renda fixa (essencial)"},
    {"keyword": "Rafael Lomas", "nova_desc": "Pix Mensal (Rafael)", "cat": "Outros", "tipo": "Renda variável"},
    {"keyword": "Uber", "nova_desc": "Uber", "cat": "Transporte", "tipo": "Renda variável"},
    {"keyword": "99app", "nova_desc": "99 App", "cat": "Transporte", "tipo": "Renda variável"},
    {"keyword": "99 app", "nova_desc": "99 App", "cat": "Transporte", "tipo": "Renda variável"},
    {"keyword": "ifood", "nova_desc": "iFood", "cat": "Alimentação", "tipo": "Lazer"},
    {"keyword": "Htm", "nova_desc": "HTM (Educação)", "cat": "Educação", "tipo": "Renda fixa (essencial)"},
    {"keyword": "007373", "nova_desc": "Pagamento Salário - UNIFOR", "cat": "Renda fixa", "tipo": "Renda fixa (essencial)"},
    {"keyword": "LIQUIDO DE VENCIMENTO", "nova_desc": "Pagamento Salário - UNIFOR", "cat": "Renda fixa", "tipo": "Renda fixa (essencial)"},
]

def clean_valor(v):
    v_str = str(v).replace('"', '').strip()
    if ',' in v_str:
        v_str = v_str.replace('.', '').replace(',', '.')
    return pd.to_numeric(v_str, errors='coerce')

def processar_descricao(desc_bruta, parcela_raw=None):
    desc = str(desc_bruta)
    p_atual, t_parcelas = 1, 1
    
    if pd.notnull(parcela_raw) and "/" in str(parcela_raw):
        try:
            parts = str(parcela_raw).split('/')
            p_atual, t_parcelas = int(parts[0]), int(parts[1])
        except: pass
    else:
        match_parcela = re.search(r"Parcela\s+(\d+)/(\d+)|(?<![\d.])(\d{1,2})/(\d{1,2})(?![\d.])", desc)
        if match_parcela:
            groups = match_parcela.groups()
            if groups[0]:
                p_atual, t_parcelas = int(groups[0]), int(groups[1])
                desc = re.sub(r"\s*-?\s*Parcela\s+\d+/\d+", "", desc)
            elif groups[2]:
                p_atual, t_parcelas = int(groups[2]), int(groups[3])
                desc = re.sub(r"\s*-?\s*\d{1,2}/\d{1,2}", "", desc)

    for p in prefixos_para_remover: desc = re.sub(p, "", desc, flags=re.IGNORECASE)
    desc = re.sub(r"\d{2}/\d{2}\s+", "", desc)
    desc = desc.strip()
    
    for regra in regras_keywords:
        if regra["keyword"].lower() in desc.lower():
            return regra["nova_desc"], regra["cat"], regra["tipo"], p_atual, t_parcelas, regra.get("dividir", False)
    
    return desc, "Outros", "Renda variável", p_atual, t_parcelas, False

# ==========================================
# PROCESSAMENTO DE ARQUIVOS
# ==========================================
files = [f for f in os.listdir(input_dir) if f.endswith(('.csv', '.xls', '.xlsx'))]
all_dfs = []

# Mapeamento totalmente em minúsculo
column_mapping = {
    'data': 'data', 'descrição': 'descricao', 'valor (r$)': 'valor', 
    'cartão final': 'cartao_final', 'parcela': 'parcela_raw',
    'date': 'data', 'amount': 'valor', 'title': 'descricao', 'mês fatura': 'mes_fatura',
    'valor': 'valor', 'descrição': 'descricao', 'data': 'data' 
}

print(f"Iniciando Processador Financeiro Master ({len(files)} arquivos)...\n")

for file in files:
    file_path = os.path.join(input_dir, file)
    banco, metodo = "Desconhecido", "Débito"
    
    if file.lower().startswith('nubank_'): banco, metodo = "Nubank", "Crédito"
    elif file.lower().startswith('nu'): banco, metodo = "Nubank", "Débito"
    elif file.lower().startswith('planilhaextrato'): banco, metodo = "Santander", "Débito"
    elif 'credito' in file.lower() and 'santander' in file.lower(): banco, metodo = "Santander", "Crédito"
    
    try:
        if file.endswith('.csv'):
            df = pd.read_csv(file_path, sep=None, engine='python')
            df.columns = [c.strip().lower() for c in df.columns]
            df = df.rename(columns=column_mapping)
        elif file.endswith(('.xls', '.xlsx')):
            if banco == "Santander" and metodo == "Débito":
                df = pd.read_excel(file_path, skiprows=5)
                df.columns = [c.strip().lower() for c in df.columns]
                df = df.rename(columns={'data': 'data', 'descrição': 'descricao', 'crédito (r$)': 'cred', 'débito (r$)': 'debt'})
                df['valor'] = df.apply(lambda r: clean_valor(r['cred']) if pd.notnull(r.get('cred')) and str(r.get('cred')).strip() != '' else -abs(clean_valor(r['debt'])) if pd.notnull(r.get('debt')) and str(r.get('debt')).strip() != '' else 0, axis=1)
            else:
                df = pd.read_excel(file_path)
                df.columns = [c.strip().lower() for c in df.columns]
                df = df.rename(columns=column_mapping)
        
        if banco == "Santander" and metodo == "Crédito":
            def fix_santander_date(row):
                d = str(row['data'])
                if len(d.split('/')) == 2:
                    mes_gasto = int(d.split('/')[1])
                    ano = 2026
                    if mes_gasto > 9 and row.get('mes_fatura') in ['Janeiro', 'Fevereiro']: ano = 2025
                    return f"{d}/{ano}"
                return d
            df['data'] = df.apply(fix_santander_date, axis=1)

        df['banco'], df['metodo_origem'], df['arquivo'] = banco, metodo, file
        df['valor'] = df['valor'].apply(clean_valor)
        print(f"OK: {file:<30} | Banco: {banco:<10} | Registros: {len(df)}")
        all_dfs.append(df)
    except Exception as e:
        print(f"Erro em {file}: {e}")

if not all_dfs: exit()

full_df = pd.concat(all_dfs, ignore_index=True, sort=False)

def parse_date(d):
    d_str = str(d).strip()
    if not d_str or d_str == 'nan': return pd.NaT
    try:
        # Se tem hífen e parece ISO (2026-01-07)
        if '-' in d_str and len(d_str.split('-')[0]) == 4:
            return pd.to_datetime(d_str, yearfirst=True)
        # Caso contrário (19/01/2026)
        return pd.to_datetime(d_str, dayfirst=True)
    except:
        return pd.NaT

# Converter datas e limpar NaNs
full_df['data'] = full_df['data'].apply(parse_date)
full_df = full_df.dropna(subset=['data', 'valor'])

if 'cartao_final' not in full_df.columns:
    full_df['cartao_final'] = None

full_df['is_divida_master'] = (full_df['descricao'].str.contains('REORGANIZACAO', case=False, na=False)) & (full_df['cartao_final'].astype(str).str.contains('8282', na=False))

def aplicar_logica_final(row):
    desc_bruta = str(row['descricao'])
    metodo = row['metodo_origem']
    parcela_raw = row.get('parcela_raw')
    
    # Detectar Pix no Crédito para evitar duplicidade com a conta corrente
    is_pix_credito = "Pix no Crédito" in desc_bruta or "Psicóloga" in desc_bruta or "Amanda Christina" in desc_bruta
    if is_pix_credito:
        if metodo == "Débito": return pd.Series([None]*8) # Ignora na conta corrente
        metodo = "Crédito"

    tipo_trans = "debito" if (metodo == "Crédito" and row['valor'] > 0) or (metodo == "Débito" and row['valor'] < 0) else "credito"

    desc_limpa, categoria, tipo_orc, p_atual, t_parc, deve_dividir = processar_descricao(desc_bruta, parcela_raw)
    return pd.Series([desc_limpa, categoria, tipo_orc, metodo, tipo_trans, desc_bruta, p_atual, t_parc, deve_dividir])

full_df[['desc_limpa', 'categoria', 'tipo_orcamento', 'metodo_final', 'tipo_transacao', 'observacao', 'parcela_atual', 'total_parcelas', 'deve_dividir']] = full_df.apply(aplicar_logica_final, axis=1)
full_df = full_df.dropna(subset=['desc_limpa']) # Remove itens ignorados (como Pix no crédito no débito)

# Remover duplicados com tolerância (mesmo valor e descrição parecida no mesmo mês)
# Primeiro arredonda valores para evitar erro de float
full_df['valor'] = full_df['valor'].round(2)
# Criar uma chave de "mês" para ajudar na detecção de duplicados
full_df['mes_ref'] = full_df['data'].dt.strftime('%Y-%m')

# Drop de duplicados mais agressivo
full_df = full_df.drop_duplicates(subset=['mes_ref', 'valor', 'desc_limpa', 'metodo_final'])

full_df['data_iso'] = full_df['data'].dt.strftime('%Y-%m-%d')

# SEPARAÇÃO
dividas_df = full_df[full_df['is_divida_master']]
restante = full_df[~full_df['is_divida_master']]

# Remover Renegociações (vão para dívidas, não para gastos)
is_reneg = restante['desc_limpa'].str.contains('Renegociação|Renegociacao', case=False)
reneg_df = restante[is_reneg]
restante = restante[~is_reneg]

# Adicionar renegociações à tabela de dívidas para exportação
dividas_df = pd.concat([dividas_df, reneg_df], ignore_index=True)

is_transf = restante['desc_limpa'].str.contains('ANA LETICIA|ANA LETÍCIA', case=False)
transf_df = restante[is_transf]
restante = restante[~is_transf]

is_pag = restante['desc_limpa'].str.contains('Pagamento de fatura|PAGAMENTO CARTAO CREDITO', case=False)
pag_df = restante[is_pag]
restante = restante[~is_pag]

is_inv = restante['desc_limpa'].str.contains('RDB', case=False)
inv_df = restante[is_inv]
restante = restante[~is_inv]

entradas_df = restante[restante['tipo_transacao'] == 'credito']
gastos_df = restante[restante['tipo_transacao'] == 'debito']

# SALVAMENTO
def save(df, name):
    if df.empty: return
    df_out = df.copy()
    df_out['data'] = df_out['data_iso']
    df_out.to_csv(os.path.join(output_dir, f"{name}.csv"), index=False, encoding='utf-8-sig')

save(entradas_df, "entradas")
save(gastos_df[gastos_df['metodo_final']=='Débito'], "gastos_debito")
save(gastos_df[gastos_df['metodo_final']=='Crédito'], "gastos_credito")
save(inv_df, "investimentos")
save(dividas_df, "dividas")
save(transf_df, "transferencias")

# SQL
sql_file = os.path.join(base_dir, "lançamentos", "importacao_master.sql")
with open(sql_file, 'w', encoding='utf-8') as f:
    f.write("-- SCRIPT DE IMPORTACAO MASTER (SEGURO - NAO DUPLICA)\nBEGIN;\n\n")
    
    for _, row in gastos_df.iterrows():
        is_cred = row['metodo_final'] == 'Crédito'
        num_parcelas = int(row['total_parcelas']) if pd.notnull(row['total_parcelas']) else 1
        parcela_atual = int(row['parcela_atual']) if pd.notnull(row['parcela_atual']) else 1
        
        obs = str(row['observacao']).replace("'", "''")
        desc = str(row['desc_limpa']).replace("'", "''")
        dt_base = row['data_iso']
        valor_total = abs(row['valor'])

        # Se for a primeira parcela de um plano no crédito, gera todas as parcelas no SQL
        if is_cred and num_parcelas > 1 and parcela_atual == 1:
            from dateutil.relativedelta import relativedelta
            dt_obj = datetime.strptime(dt_base, '%Y-%m-%d')
            
            # Decidir se divide o valor ou usa o valor cheio como parcela
            deve_dividir = row.get('deve_dividir', False)
            valor_parcela = round(valor_total / num_parcelas, 2) if deve_dividir else round(valor_total, 2)
            
            for i in range(num_parcelas):
                dt_parc = (dt_obj + relativedelta(months=i)).strftime('%Y-%m-%d')
                p_atual = i + 1
                f.write(f"INSERT INTO public.gastos (usuario_id, descricao, valor, data, categoria, tipo, metodo_pagamento, considerar_soma, total_parcelas, parcela_atual, observacao) "
                        f"SELECT '{user_id}', '{desc}', {valor_parcela}, '{dt_parc}', '{row['categoria']}', '{row['tipo_orcamento']}', '{row['metodo_final']}', false, {num_parcelas}, {p_atual}, '{obs}' "
                        f"WHERE NOT EXISTS (SELECT 1 FROM public.gastos WHERE usuario_id = '{user_id}' AND descricao = '{desc}' AND parcela_atual = {p_atual});\n")
        else:
            # Para despesas normais, checa descricao e o mes/ano
            mes_ano = dt_base[:7] # YYYY-MM
            f.write(f"INSERT INTO public.gastos (usuario_id, descricao, valor, data, categoria, tipo, metodo_pagamento, considerar_soma, total_parcelas, parcela_atual, observacao) "
                    f"SELECT '{user_id}', '{desc}', {valor_total}, '{dt_base}', '{row['categoria']}', '{row['tipo_orcamento']}', '{row['metodo_final']}', {str(not is_cred).lower()}, {num_parcelas}, {parcela_atual}, '{obs}' "
                    f"WHERE NOT EXISTS (SELECT 1 FROM public.gastos WHERE usuario_id = '{user_id}' AND TO_CHAR(data, 'YYYY-MM') = '{mes_ano}' AND ABS(valor - {valor_total}) < 0.05 AND descricao = '{desc}' AND parcela_atual = {parcela_atual});\n")
    
    for _, row in entradas_df.iterrows():
        desc = str(row['desc_limpa']).replace("'", "''")
        val = abs(row['valor'])
        dt = row['data_iso']
        mes_ano = dt[:7]
        f.write(f"INSERT INTO public.entradas (usuario_id, descricao, valor, data) "
                f"SELECT '{user_id}', '{desc}', {val}, '{dt}' "
                f"WHERE NOT EXISTS (SELECT 1 FROM public.entradas WHERE usuario_id = '{user_id}' AND TO_CHAR(data, 'YYYY-MM') = '{mes_ano}' AND ABS(valor - {val}) < 0.05 AND descricao = '{desc}');\n")
    
    f.write("\nCOMMIT;")

print(f"\nProcessamento concluido com sucesso!")
print(f"Resumo: {len(gastos_df)} Gastos, {len(entradas_df)} Entradas, {len(dividas_df)} Dividas.")

# Log de Conferência
if not gastos_df.empty:
    sant_c = gastos_df[gastos_df['banco'] == 'Santander']
    if not sant_c.empty:
        print("\n--- CONFERENCIA SANTANDER CREDITO ---")
        for _, r in sant_c.iterrows():
            print(f"- {r['data_iso']} | {r['desc_limpa']:<25} | R$ {abs(r['valor']):<8.2f} | {r['parcela_atual']}/{r['total_parcelas']}")
