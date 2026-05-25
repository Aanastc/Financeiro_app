import pandas as pd
import os
import uuid

# Configurações
input_file = r"C:\Users\anale\OneDrive\Documentos\Carreira\Projetos para Portifolio\finance-app\consolidado\gastos_debito.csv"
output_sql = r"C:\Users\anale\OneDrive\Documentos\Carreira\Projetos para Portifolio\finance-app\lançamentos\parte2_gastos_debito.sql"
user_id = '8fc136f2-5b4b-4ce3-9ca7-3b713e1a3fee'

# Regras de Classificação e Limpeza
prefixos_para_remover = [
    "Compra no débito - ",
    "DEBITO VISA ELECTRON BRASIL ",
    "PIX ENVIADO ",
    "Transferência enviada pelo Pix - ",
    "PAGAMENTO DE BOLETO - ",
    "PAGAMENTO BOLETO ",
]

regras_keywords = [
    {"keyword": "Farmacia", "nova_desc": "Farmácia", "cat": "Saúde", "tipo": "Renda fixa (essencial)"},
    {"keyword": "Cacau Show", "nova_desc": "Cacau Show", "cat": "Lazer", "tipo": "Lazer"},
    {"keyword": "TG CLINICA", "nova_desc": "Clínica de Psicologia", "cat": "Saúde", "tipo": "Renda fixa (essencial)"},
    {"keyword": "Rafael Lomas", "nova_desc": "Spotify", "cat": "Lazer", "tipo": "Renda variável"},
    {"keyword": "ANA EUNICE", "nova_desc": "Curso de inglês", "cat": "Educação", "tipo": "Renda fixa (essencial)"},
    {"keyword": "Yukari Adachi", "nova_desc": "Exame médico", "cat": "Saúde", "tipo": "Renda fixa (essencial)"},
    {"keyword": "MANDACARU", "nova_desc": "Passagem de ônibus", "cat": "Transporte", "tipo": "Renda fixa (essencial)"},
    {"keyword": "Amanda Christina", "nova_desc": "Trança (cabelo)", "cat": "Beleza", "tipo": "Renda variável"},
    {"keyword": "Lara Meneses", "nova_desc": "Presente Nath", "cat": "Lazer", "tipo": "Lazer"},
    {"keyword": "Ariane Nogueira", "nova_desc": "Presente Elaine", "cat": "Lazer", "tipo": "Lazer"},
]

def classificar(descricao_bruta):
    desc = str(descricao_bruta)
    # 1. Limpeza de prefixos
    for p in prefixos_para_remover:
        desc = desc.replace(p, "")
    desc = desc.strip()

    # 2. Match por keywords
    for regra in regras_keywords:
        if regra["keyword"].lower() in desc.lower():
            return regra["nova_desc"], regra["cat"], regra["tipo"]
    
    # Se não achar regra, retorna a descrição limpa
    return desc, "Outros", "Renda variável"

try:
    df = pd.read_csv(input_file)
    # Converter data de DD/MM/YYYY para YYYY-MM-DD
    df['data_iso'] = pd.to_datetime(df['data'], dayfirst=True).dt.strftime('%Y-%m-%d')
    
    sql_lines = [
        "-- PARTE 2: LANÇAMENTO DE GASTOS NO DÉBITO (PROCESSADO E LIMPO)",
        f"-- Usuária: Ana Letícia ({user_id})",
        "",
        "BEGIN;",
        ""
    ]

    for _, row in df.iterrows():
        desc_limpa, cat, tipo = classificar(row['descricao'])
        valor = abs(float(row['valor']))
        
        sql = f"INSERT INTO public.gastos (usuario_id, descricao, valor, data, classificacao, categoria, tipo, metodo_pagamento, considerar_soma) " \
              f"VALUES ('{user_id}', '{desc_limpa}', {valor}, '{row['data_iso']}', 'Variável', '{cat}', '{tipo}', 'Débito', true);"
        sql_lines.append(sql)

    sql_lines.append("")
    sql_lines.append("COMMIT;")

    with open(output_sql, 'w', encoding='utf-8') as f:
        f.write("\n".join(sql_lines))
        
    print(f"Sucesso! Gerado {output_sql} com {len(df)} lançamentos.")

except Exception as e:
    print(f"Erro: {e}")
