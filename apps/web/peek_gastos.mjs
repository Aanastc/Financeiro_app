import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://wlqmotqxqrgzeqtufkee.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndscW1vdHF4cXJnemVxdHVma2VlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg1MjQ4NjUsImV4cCI6MjA2NDEwMDg2NX0.1HqM1JGEypAIopFHkOaedELsludXaM0aNEGVEabfoCM";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function peekGastos() {
    const { data, error } = await supabase.from('gastos').select('usuario_id, descricao').limit(5);
    if (error) {
        console.error("Error fetching gastos:", error);
        return;
    }
    console.log("Gastos peek:");
    data.forEach(g => console.log(`- User: ${g.usuario_id} | Desc: ${g.descricao}`));
}

peekGastos();
