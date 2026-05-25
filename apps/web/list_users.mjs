import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://wlqmotqxqrgzeqtufkee.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndscW1vdHF4cXJnemVxdHVma2VlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg1MjQ4NjUsImV4cCI6MjA2NDEwMDg2NX0.1HqM1JGEypAIopFHkOaedELsludXaM0aNEGVEabfoCM";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function listUsers() {
    const { data, error } = await supabase.from('usuarios').select('id, nome');
    if (error) {
        console.error("Error fetching users:", error);
        return;
    }
    console.log("Users in DB:");
    data.forEach(u => console.log(`- ${u.id}: ${u.nome}`));
}

listUsers();
