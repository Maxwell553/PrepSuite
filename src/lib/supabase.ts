/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';
import { getEnvConfig, isSupabaseConfigured } from './env';

const config = getEnvConfig();

if (!isSupabaseConfigured()) {
    console.warn('⚠️ Missing Supabase Environment Variables. Persistence will be disabled.');
    console.warn('Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env.local file');
}

export const supabase = createClient(
    config.supabaseUrl,
    config.supabaseAnonKey,
    {
        auth: {
            detectSessionInUrl: isSupabaseConfigured(),
            persistSession: isSupabaseConfigured(),
            autoRefreshToken: isSupabaseConfigured(),
            flowType: 'pkce',
        },
    }
);

export function requireAuthConfiguration() {
    if (!isSupabaseConfigured()) {
        throw new Error('Sign-in is not configured on this installation. Please contact the site owner.');
    }
}

export const authActions = {
    async signInWithEmail(email: string) {
        requireAuthConfiguration();
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: window.location.origin,
            },
        });
        if (error) throw error;
    },
    async signInWithPassword(email: string, pass: string) {
        requireAuthConfiguration();
        const res = await supabase.auth.signInWithPassword({
            email,
            password: pass,
        });
        if (res.error) throw res.error;
        return res;
    },
    async signUp(email: string, pass: string) {
        requireAuthConfiguration();
        const res = await supabase.auth.signUp({
            email,
            password: pass,
            options: {
                emailRedirectTo: window.location.origin,
            },
        });
        if (res.error) throw res.error;
        return res;
    },
    async signInWithGoogle() {
        requireAuthConfiguration();
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/analysis`,
            },
        });
        if (error) throw error;
    },
    async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    }
};
