/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Missing Supabase Environment Variables. Persistence will be disabled.');
}

export const supabase = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder'
);

export const authActions = {
    async signInWithEmail(email: string) {
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: window.location.origin,
            },
        });
        if (error) throw error;
    },
    async signInWithPassword(email: string, pass: string) {
        const res = await supabase.auth.signInWithPassword({
            email,
            password: pass,
        });
        if (res.error) throw res.error;
        return res;
    },
    async signUp(email: string, pass: string) {
        const res = await supabase.auth.signUp({
            email,
            password: pass,
        });
        if (res.error) throw res.error;
        return res;
    },
    async signInWithGoogle() {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin,
            },
        });
        if (error) throw error;
    },
    async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    }
};
