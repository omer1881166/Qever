/* =====================================================
   Pro Event Gallery - Authentication Layer
   ===================================================== */

const SUPABASE_URL = 'https://zqkunpevlcaoybzdtdnj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpxa3VucGV2bGNhb3liemR0ZG5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNTM5NjAsImV4cCI6MjA4NTYyOTk2MH0._8-HT24JHy6EVOWtnDW3wr-mnPdW-5VbPd2BwsnXqW8';

// Use window.sbClient to avoid conflict with SDK's 'supabase' name
if (typeof window.sbClient === 'undefined') {
    window.sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Supabase Client initialized.');
}

window.authManager = {
    async login(email, password, remember = true) {
        console.log('Auth: login attempt...');
        const { data, error } = await window.sbClient.auth.signInWithPassword({
            email,
            password
        });
        if (error) throw error;
        return data;
    },

    async logout() {
        const { error } = await window.sbClient.auth.signOut();
        if (error) throw error;
        window.location.reload();
    },

    async getUser() {
        const { data: { user } } = await window.sbClient.auth.getUser();
        return user;
    },

    onAuthStateChange(callback) {
        console.log('Auth: Setting up state listener...');
        window.sbClient.auth.onAuthStateChange((event, session) => {
            console.log('Auth Event:', event, 'User:', session?.user?.email);
            callback(session?.user || null);
        });
    }
};
