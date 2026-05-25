import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabaseUrl = "https://wlqmotqxqrgzeqtufkee.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndscW1vdHF4cXJnemVxdHVma2VlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg1MjQ4NjUsImV4cCI6MjA2NDEwMDg2NX0.1HqM1JGEypAIopFHkOaedELsludXaM0aNEGVEabfoCM";

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const csvPath = "c:\\Users\\anale\\OneDrive\\Documentos\\Carreira\\Projetos para Portifolio\\finance-app\\consolidado\\gastos_credito.csv";
const userId = '8fc136f2-5b4b-4ce3-9ca7-3b713e1a3fee';

async function checkDuplicates() {
    const csvData = fs.readFileSync(csvPath, 'utf8');
    const lines = csvData.split('\n');
    const headers = lines[0].split(',');
    
    const records = [];
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = lines[i].split(',');
        const obj = {};
        headers.forEach((h, idx) => obj[h] = values[idx]);
        records.push(obj);
    }

    console.log(`Checking ${records.length} records...`);

    const duplicates = [];
    const newRecords = [];

    // Fetch existing records for this user
    const { data: existing, error } = await supabase
        .from('gastos')
        .select('data, valor, descricao, parcela_atual')
        .eq('usuario_id', userId);

    if (error) {
        console.error("Error fetching existing records:", error);
        return;
    }

    console.log(`Fetched ${existing.length} existing records for user.`);

    records.forEach(r => {
        const rValor = Math.abs(parseFloat(r.valor));
        const rData = r.data_iso || r.data;
        const rDesc = r.desc_limpa || r.descricao;
        const rParcela = parseInt(r.parcela_atual) || 1;

        const isDuplicate = existing.some(e => 
            e.data === rData && 
            Math.abs(Math.abs(parseFloat(e.valor)) - rValor) < 0.01 && 
            e.descricao === rDesc &&
            parseInt(e.parcela_atual) === rParcela
        );

        if (isDuplicate) {
            duplicates.push(r);
        } else {
            newRecords.push(r);
        }
    });

    console.log("\n--- RESULT ---");
    console.log(`Total in CSV: ${records.length}`);
    console.log(`Already in DB: ${duplicates.length}`);
    console.log(`New to insert: ${newRecords.length}`);

    if (duplicates.length > 0) {
        console.log("\nSome duplicates found (examples):");
        duplicates.slice(0, 5).forEach(d => {
            console.log(`- ${d.data} | ${d.desc_limpa} | R$ ${d.valor} (${d.parcela_atual}/${d.total_parcelas})`);
        });
    }

    if (newRecords.length > 0) {
        console.log("\nNew records to insert (examples):");
        newRecords.slice(0, 5).forEach(n => {
            console.log(`- ${n.data} | ${n.desc_limpa} | R$ ${n.valor} (${n.parcela_atual}/${n.total_parcelas})`);
        });
    }
    
    fs.writeFileSync('C:\\Users\\anale\\.gemini\\antigravity\\brain\\c723cc70-f85f-4aad-b689-01aa5b49bcea\\scratch\\novos_gastos.json', JSON.stringify(newRecords, null, 2));
}

checkDuplicates();
