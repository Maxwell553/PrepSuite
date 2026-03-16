import React, { useState } from 'react';
import { ArrowLeft, User, Mail, Trash2, AlertTriangle, LogOut, Coins, ExternalLink, Loader2 } from 'lucide-react';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { getEnvConfig } from '../lib/env';
import ConfirmationModal from './ConfirmationModal';
import { createCreditsCheckoutSession, createPortalSession } from '../services/subscriptionService';

interface UserSettingsProps {
  user: SupabaseUser;
  onBack: () => void;
  onLogout?: () => void;
  onAccountDeleted?: () => void;
  credits?: number;
  onCreditsPurchased?: () => void;
}

const UserSettings: React.FC<UserSettingsProps> = ({ user, onBack, onLogout, onAccountDeleted, credits = 0, onCreditsPurchased }) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const handleBuyCredits = async (pack: 'starter' | 'standard' | 'pro') => {
    setCheckoutLoading(true);
    try {
      const { url } = await createCreditsCheckoutSession(
        pack,
        `${window.location.origin}/?credits=success`,
        `${window.location.origin}/#pricing`
      );
      window.location.href = url;
    } catch (err) {
      console.error('[UserSettings] Checkout error:', err);
      alert(err instanceof Error ? err.message : 'Failed to start checkout');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleManagePaymentMethods = async () => {
    setCheckoutLoading(true);
    try {
      const { url } = await createPortalSession(window.location.href);
      window.location.href = url;
    } catch (err) {
      console.error('[UserSettings] Portal error:', err);
      alert(err instanceof Error ? err.message : 'Failed to open payment management');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      // Refresh session to ensure we have a valid (non-expired) JWT before calling the edge function.
      // Supabase returns 401 when the JWT is expired; getSession() returns cached data.
      const { data: { session }, error: sessionError } = await supabase.auth.refreshSession();
      
      if (sessionError || !session) {
        alert('Session expired. Please log in again and try deleting your account.');
        setIsDeleting(false);
        setShowDeleteConfirm(false);
        return;
      }

      // Get config for apikey header
      const config = getEnvConfig();

      // Call the delete-user edge function
      const { data, error } = await supabase.functions.invoke('delete-user', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': config.supabaseAnonKey,
        },
      });

      // Surface the actual error from the edge function when available
      const serverError = data?.error ?? data?.details;
      if (error) {
        console.error('[UserSettings] Error calling delete-user function:', error);
        console.error('[UserSettings] Server response:', data);
        throw new Error(
          serverError || error.message || 'Failed to delete account. Check Supabase Edge Function logs for details.'
        );
      }

      if (data?.error) {
        console.error('[UserSettings] Delete function returned error:', data.error);
        throw new Error(data.details ? `${data.error}: ${data.details}` : data.error);
      }

      // Sign out the user after successful deletion
      await supabase.auth.signOut();
      
      // Call the callback if provided
      if (onAccountDeleted) {
        onAccountDeleted();
      }
      
      alert('Your account and all associated data have been permanently deleted.');
    } catch (error) {
      console.error('[UserSettings] Error deleting account:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete account. Please contact support.';
      alert(errorMessage);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-8">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-slate-400 dark:text-slate-400 text-gray-600 hover:text-white dark:hover:text-white hover:text-gray-900 mb-8 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="text-sm font-medium">Back</span>
      </button>

      <div className="bg-slate-900 dark:bg-slate-900 bg-white border border-slate-800 dark:border-slate-800 border-gray-200 rounded-3xl p-8 shadow-2xl">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center">
            <User className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white dark:text-white text-gray-900">User Settings</h1>
            <p className="text-slate-400 dark:text-slate-400 text-gray-600 mt-1">Manage your account preferences</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-950 dark:bg-slate-950 bg-gray-50 border border-slate-800 dark:border-slate-800 border-gray-200 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Mail className="w-5 h-5 text-indigo-400 dark:text-indigo-400 text-indigo-600" />
              <h2 className="text-lg font-semibold text-white dark:text-white text-gray-900">Account Information</h2>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-500 text-gray-500 uppercase tracking-widest font-bold mb-1 block">Email</label>
                <p className="text-slate-300 dark:text-slate-300 text-gray-700">{user.email}</p>
              </div>
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-500 text-gray-500 uppercase tracking-widest font-bold mb-1 block">User ID</label>
                <p className="text-slate-400 dark:text-slate-400 text-gray-600 font-mono text-sm">{user.id}</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-950 dark:bg-slate-950 bg-gray-50 border border-slate-800 dark:border-slate-800 border-gray-200 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Coins className="w-5 h-5 text-amber-400 dark:text-amber-400 text-amber-600" />
              <h2 className="text-lg font-semibold text-white dark:text-white text-gray-900">Credits</h2>
            </div>
            <div className="space-y-4">
              <p className="text-2xl font-bold text-amber-400 dark:text-amber-400 text-amber-600">
                {credits.toLocaleString()} <span className="text-sm font-normal text-slate-500">credits</span>
              </p>
              <p className="text-slate-400 dark:text-slate-400 text-gray-600 text-sm">
                1 credit per 5 games analyzed. Buy more when you run low.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleBuyCredits('starter')}
                  disabled={checkoutLoading}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
                >
                  {checkoutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  1,000 credits
                </button>
                <button
                  onClick={() => handleBuyCredits('standard')}
                  disabled={checkoutLoading}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
                >
                  5,000 credits
                </button>
                <button
                  onClick={() => handleBuyCredits('pro')}
                  disabled={checkoutLoading}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-50"
                >
                  15,000 credits
                </button>
              </div>
              <button
                onClick={handleManagePaymentMethods}
                disabled={checkoutLoading}
                className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white text-sm transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Manage payment methods
              </button>
            </div>
          </div>

          <div className="bg-slate-950 dark:bg-slate-950 bg-gray-50 border border-slate-800 dark:border-slate-800 border-gray-200 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <LogOut className="w-5 h-5 text-indigo-400 dark:text-indigo-400 text-indigo-600" />
              <h2 className="text-lg font-semibold text-white dark:text-white text-gray-900">Session</h2>
            </div>
            <button
              onClick={() => (onLogout ? onLogout() : supabase.auth.signOut())}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-semibold text-sm transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Log out
            </button>
          </div>

          <div className="bg-red-600/10 dark:bg-red-600/10 bg-red-50 border border-red-500/20 dark:border-red-500/20 border-red-200 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-red-400 dark:text-red-400 text-red-600" />
              <h2 className="text-lg font-semibold text-white dark:text-white text-gray-900">Danger Zone</h2>
            </div>
            <p className="text-sm text-red-300 dark:text-red-300 text-red-700 mb-4">
              Once you delete your account, there is no going back. This will permanently delete your account and all associated data, including all scouting reports.
            </p>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeleting}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-600/50 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-sm transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              {isDeleting ? 'Deleting...' : 'Delete Account'}
            </button>
          </div>
        </div>
      </div>

      {showDeleteConfirm && (
        <ConfirmationModal
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleDeleteAccount}
          title="Delete Account"
          message="Are you sure you want to delete your account? This action cannot be undone and will permanently delete all your data, including all scouting reports."
          confirmText="Delete Account"
          type="danger"
        />
      )}
    </div>
  );
};

export default UserSettings;
