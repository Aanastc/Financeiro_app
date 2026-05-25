import os
import pandas as pd

# Caminhos
base_dir = r"C:\Users\anale\OneDrive\Documentos\Carreira\Projetos para Portifolio\finance-app"
input_dir = os.path.join(base_dir, "lançamentos")
output_dir = os.path.join(base_dir, "consolidado")

if not os.path.exists(output_dir):
    os.makedirs(output_dir)

# Filtrar arquivos CSV, XLS e XLSX
files = [f for f in os.listdir(input_dir) if f.endswith(('.csv', '.xls', '.xlsx'))]

all_dfs = []

# Mapeamento de colunas para padronização
column_mapping = {
    'Data': 'data',
    'date': 'data',
    'Valor': 'valor',
    'amount': 'valor',
    'Descrição': 'descricao',
    'title': 'descricao',
    'Identificador': 'identificador'
}

print(f"Iniciando consolidação de {len(files)} arquivos...\n")

for file in files:
    file_path = os.path.join(input_dir, file)
    print(f"Processando: {file}")
    
    # Determinar Banco e Método Inicial
    banco = "Desconhecido"
    metodo = "Débito"
    
    if file.lower().startswith('nubank_'):
        banco = "Nubank"
        metodo = "Crédito"
    elif file.lower().startswith('nu'):
        banco = "Nubank"
        metodo = "Débito"
    elif file.lower().startswith('planilhaextrato'):
        banco = "Santander"
        metodo = "Débito"
    
    try:
        if file.endswith('.csv'):
            try:
                df = pd.read_csv(file_path)
                if len(df.columns) <= 1:
                    df = pd.read_csv(file_path, sep=';')
            except Exception:
                df = pd.read_csv(file_path, sep=';')
            
            # Padronizar nomes de colunas
            df = df.rename(columns=column_mapping)
            
            if 'valor' in df.columns:
                # Converter para numérico logo no início
                df['valor'] = pd.to_numeric(df['valor'].astype(str).str.replace(',', '.'), errors='coerce')
                
                if metodo == "Crédito":
                    # Fatura Nubank: positivo é compra (debito), negativo é pagamento/estorno (credito)
                    df['tipo'] = df['valor'].apply(lambda x: 'debito' if x > 0 else 'credito')
                else:
                    # Conta corrente: positivo é entrada (credito), negativo é saída (debito)
                    df['tipo'] = df['valor'].apply(lambda x: 'credito' if x > 0 else 'debito')
        
        elif file.endswith(('.xls', '.xlsx')):
            if banco == "Santander":
                df = pd.read_excel(file_path, skiprows=5)
                df.columns = [str(c).strip() for c in df.columns]
                santander_mapping = {
                    'Data': 'data', 'Descrição': 'descricao', 'Descrio': 'descricao',
                    'Crédito (R$)': 'valor_credito', 'Crdito (R$)': 'valor_credito',
                    'Débito (R$)': 'valor_debito', 'Dbito (R$)': 'valor_debito'
                }
                df = df.rename(columns=santander_mapping)
                
                def get_santander_info(row):
                    def parse_ptbr_num(val):
                        if pd.isnull(val) or val == "": return None
                        try:
                            s = str(val).replace('.', '').replace(',', '.')
                            return pd.to_numeric(s, errors='coerce')
                        except: return None
                    cred = parse_ptbr_num(row.get('valor_credito'))
                    debt = parse_ptbr_num(row.get('valor_debito'))
                    if cred is not None and cred != 0: return float(cred), 'credito'
                    elif debt is not None and debt != 0: return -float(abs(debt)), 'debito'
                    return 0, 'outro'
                
                if 'valor_credito' in df.columns and 'valor_debito' in df.columns:
                    info = df.apply(get_santander_info, axis=1)
                    df['valor'] = [x[0] for x in info]
                    df['tipo'] = [x[1] for x in info]
            else:
                df = pd.read_excel(file_path)
                df = df.rename(columns=column_mapping)
                if 'valor' in df.columns:
                    df['valor'] = pd.to_numeric(df['valor'].astype(str).str.replace(',', '.'), errors='coerce')
                    df['tipo'] = df['valor'].apply(lambda x: 'credito' if x > 0 else 'debito')

        # Adicionar colunas extras
        df['banco'] = banco
        df['metodo_pagamento'] = metodo
        df['arquivo_origem'] = file
        all_dfs.append(df)
        
    except Exception as e:
        print(f"Erro ao ler {file}: {e}")

if all_dfs:
    consolidated_df = pd.concat(all_dfs, ignore_index=True, sort=False)
    
    def robust_date_parser(d):
        if pd.isnull(d) or d == '' or str(d).lower() == 'nan': return pd.NaT
        d_str = str(d).strip()
        if '/' in d_str:
            try: return pd.to_datetime(d_str, dayfirst=True)
            except: pass
        if '-' in d_str:
            try:
                # Verifica se é YYYY-MM-DD
                if len(d_str.split('-')[0]) == 4: return pd.to_datetime(d_str, format='%Y-%m-%d')
                else: return pd.to_datetime(d_str, dayfirst=True)
            except: pass
        return pd.to_datetime(d_str, dayfirst=True, errors='coerce')

    print("Padronizando datas e limpando registros...")
    consolidated_df['data'] = consolidated_df['data'].apply(robust_date_parser)
    consolidated_df = consolidated_df.dropna(subset=['data'])
    consolidated_df['valor'] = pd.to_numeric(consolidated_df['valor'], errors='coerce')
    consolidated_df = consolidated_df.dropna(subset=['valor'])
    
    # --- REMOÇÃO DE DUPLICADOS ---
    # Removendo registros idênticos (mesma data, valor, descrição e banco)
    antes = len(consolidated_df)
    consolidated_df = consolidated_df.drop_duplicates(subset=['data', 'valor', 'descricao', 'banco'])
    depois = len(consolidated_df)
    if antes > depois:
        print(f"Foram removidos {antes - depois} registros duplicados.")
    
    # Limpeza de Metadados
    ignorar = ['TOTAL', 'SALDO ANTERIOR', 'Saldo de conta', 'Saldo disponível', 'Saldo bloqueado', 'Provisão de encargos']
    for p in ignorar:
        consolidated_df = consolidated_df[~consolidated_df['descricao'].str.contains(p, case=False, na=False)]
    
    # Filtro de data
    consolidated_df = consolidated_df[(consolidated_df['data'] >= '2026-01-01') & (consolidated_df['data'] <= '2026-05-03')]
    consolidated_df = consolidated_df.sort_values(by='data')
    
    # --- AJUSTES DE CLASSIFICAÇÃO ---
    pix_credito_mask = consolidated_df['descricao'].str.contains('Pix no Crédito', case=False, na=False)
    consolidated_df.loc[pix_credito_mask, 'tipo'] = 'debito'
    consolidated_df.loc[pix_credito_mask, 'metodo_pagamento'] = 'Crédito'
    
    # Converter data para string após o filtro e ordenação
    consolidated_df['data_str'] = consolidated_df['data'].dt.strftime('%d/%m/%Y')
    # Renomear para manter compatibilidade
    output_df = consolidated_df.copy()
    output_df['data'] = output_df['data_str']
    output_df = output_df.drop(columns=['data_str'])
    
    # --- SEPARAÇÃO POR CATEGORIAS ---
    
    # 1. Transferências Próprias (Ana Leticia)
    is_transferencia = output_df['descricao'].str.contains('ANA LETICIA|ANA LETÍCIA', case=False, na=False)
    transferencias_df = output_df[is_transferencia]
    restante = output_df[~is_transferencia]
    
    # 2. Pagamento de Cartão (Adicionado 'Pagamento recebido' que é o termo do Nubank no cartão)
    is_pagamento = restante['descricao'].str.contains('Pagamento de fatura|PAGAMENTO CARTAO CREDITO|Pagamento recebido', case=False, na=False)
    pagamento_cartao_df = restante[is_pagamento]
    restante = restante[~is_pagamento]
    
    # 3. Dívidas (Renegociação de pendências)
    is_divida = restante['descricao'].str.contains('Renegociação de pendências', case=False, na=False)
    dividas_df = restante[is_divida]
    restante = restante[~is_divida]
    
    # 4. Investimentos (RDB)
    is_investimento = restante['descricao'].str.contains('RDB', case=False, na=False)
    investimentos_df = restante[is_investimento]
    restante = restante[~is_investimento]
    
    # 5. Entradas e Gastos Reais
    entradas_df = restante[restante['tipo'] == 'credito']
    gastos_total_df = restante[restante['tipo'] == 'debito']
    
    gastos_debito_df = gastos_total_df[gastos_total_df['metodo_pagamento'] == 'Débito']
    gastos_credito_df = gastos_total_df[gastos_total_df['metodo_pagamento'] == 'Crédito']
    
    # --- SALVAR ARQUIVOS ---
    def save_df(df, name):
        df.to_csv(os.path.join(output_dir, f"{name}.csv"), index=False, encoding='utf-8-sig')
        df.to_excel(os.path.join(output_dir, f"{name}.xlsx"), index=False)

    save_df(entradas_df, "entradas")
    save_df(gastos_debito_df, "gastos_debito")
    save_df(gastos_credito_df, "gastos_credito")
    save_df(investimentos_df, "investimentos")
    save_df(transferencias_df, "transferencias")
    save_df(dividas_df, "dividas")
    save_df(pagamento_cartao_df, "pagamento_cartao")
    
    # Excel Único
    with pd.ExcelWriter(os.path.join(output_dir, "financas_separadas.xlsx")) as writer:
        entradas_df.to_excel(writer, sheet_name='Entradas', index=False)
        gastos_debito_df.to_excel(writer, sheet_name='Gastos Debito', index=False)
        gastos_credito_df.to_excel(writer, sheet_name='Gastos Credito', index=False)
        investimentos_df.to_excel(writer, sheet_name='Investimentos', index=False)
        transferencias_df.to_excel(writer, sheet_name='Transferencias', index=False)
        dividas_df.to_excel(writer, sheet_name='Dividas', index=False)
        pagamento_cartao_df.to_excel(writer, sheet_name='Pagamento Cartao', index=False)
    
    print(f"\nSucesso!")
    print(f"- Entradas: {len(entradas_df)}")
    print(f"- Gastos no Débito: {len(gastos_debito_df)}")
    print(f"- Gastos no Crédito: {len(gastos_credito_df)}")
    print(f"- Investimentos: {len(investimentos_df)}")
    print(f"- Transferências: {len(transferencias_df)}")
    print(f"- Dívidas: {len(dividas_df)}")
    print(f"- Pagamento Cartão: {len(pagamento_cartao_df)}")
else:
    print("❌ Nenhum arquivo processado com sucesso.")
