import urllib.request
import json

url = "https://wlqmotqxqrgzeqtufkee.supabase.co/rest/v1"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndscW1vdHF4cXJnemVxdHVma2VlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg1MjQ4NjUsImV4cCI6MjA2NDEwMDg2NX0.1HqM1JGEypAIopFHkOaedELsludXaM0aNEGVEabfoCM"

def query_supabase(table, query_params=""):
    full_url = f"{url}/{table}?{query_params}"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json"
    }
    req = urllib.request.Request(full_url, headers=headers)
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Error querying {table}: {e}")
        return None

print("=== Checking DB tables (all users) ===")

cartoes = query_supabase("cartoes")
print(f"Total Cartoes in DB: {len(cartoes) if cartoes else 0}")
if cartoes:
    for c in cartoes:
        print(f"  - Card: {c['nome']} | User: {c['usuario_id']} | ID: {c['id']}")

contatos = query_supabase("contatos")
print(f"Total Contatos in DB: {len(contatos) if contatos else 0}")
if contatos:
    for c in contatos:
        print(f"  - Contato: {c['nome']} | User: {c['usuario_id']} | ID: {c['id']}")

gastos = query_supabase("gastos")
print(f"Total Gastos in DB: {len(gastos) if gastos else 0}")
if gastos:
    # Print first 5
    for g in gastos[:5]:
        print(f"  - Gasto: {g['descricao']} | Valor: {g['valor']} | Data: {g['data']} | User: {g['usuario_id']}")

entradas = query_supabase("entradas")
print(f"Total Entradas in DB: {len(entradas) if entradas else 0}")
if entradas:
    for e in entradas[:5]:
        print(f"  - Entrada: {e['descricao']} | Valor: {e['valor']} | Data: {e['data']} | User: {e['usuario_id']}")

dividas = query_supabase("dividas")
print(f"Total Dividas in DB: {len(dividas) if dividas else 0}")

# Check users in public.usuarios if possible
usuarios = query_supabase("usuarios")
print(f"Total Usuarios in DB: {len(usuarios) if usuarios else 0}")
if usuarios:
    for u in usuarios:
        print(f"  - User: {u['id']} | Email: {u.get('email', 'N/A')}")
