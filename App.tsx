import React, { useState, useEffect } from 'react';
import { Search, History, Shield, Database, LayoutDashboard, ChevronRight, User, Loader2 } from 'lucide-react';
import SearchScreen from './components/SearchScreen';
import ReportDashboard from './components/ReportDashboard';
import Sidebar from './components/Sidebar';
import { ScoutingReport } from './types';
import LandingPage from './components/LandingPage';
import { supabase, authActions } from './lib/supabase';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { playerRepository } from './services/playerRepository';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'search' | 'dashboard' | 'history'>('search');
  const [selectedReport, setSelectedReport] = useState<ScoutingReport | null>(null);
  const [history, setHistory] = useState<ScoutingReport[]>([]);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoadingAuth(false);
    });

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch history when user is available
  useEffect(() => {
    if (user) {
      playerRepository.getUserHistory(user.id).then(data => {
        setHistory(data);
      });
    } else {
      setHistory([]);
    }
  }, [user]);

  const handleReportGenerated = (report: ScoutingReport) => {
    setHistory(prev => [report, ...prev]);
    setSelectedReport(report);
    setActiveTab('dashboard');
  };

  const selectFromHistory = (report: ScoutingReport) => {
    setSelectedReport(report);
    setActiveTab('dashboard');
  };

  const handleLogin = async (loginData: 'google' | { email: string; password?: string; isNewUser?: boolean }) => {
    try {
      if (typeof loginData === 'string') {
        if (loginData === 'google') await authActions.signInWithGoogle();
      } else {
        if (loginData.password) {
          if (loginData.isNewUser) {
            await authActions.signUp(loginData.email, loginData.password);
            // We don't alert here anymore as the LandingPage handles the "success" view
          } else {
            await authActions.signInWithPassword(loginData.email, loginData.password);
          }
        }
      }
    } catch (err: any) {
      console.error('Auth Error:', err);
      alert(err.message || 'Authentication failed');
    }
  };

  const handleLogout = async () => {
    await authActions.signOut();
  };

  if (loadingAuth) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LandingPage onGetStarted={() => {
      const el = document.getElementById('security');
      el?.scrollIntoView({ behavior: 'smooth' });
    }} onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="flex-1 overflow-y-auto relative">
        <header className="sticky top-0 z-10 backdrop-blur-md bg-slate-950/80 border-b border-slate-800 p-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-indigo-500" />
            <h1 className="text-xl font-semibold tracking-tight">PrepSuite <span className="text-xs font-normal text-slate-500 uppercase tracking-widest ml-2">v1.2 Stable</span></h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:block bg-slate-900 border border-slate-700 px-3 py-1 rounded-full text-xs font-medium text-slate-400">
              Live Database Sync
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 hidden md:block">{user.email}</span>
              <div
                onClick={handleLogout}
                className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white cursor-pointer hover:bg-red-500 transition-colors"
              >
                <User className="w-5 h-5" />
              </div>
            </div>
          </div>
        </header>

        <div className="p-6 max-w-7xl mx-auto">
          {activeTab === 'search' && (
            <SearchScreen onReportGenerated={handleReportGenerated} user={user} />
          )}

          {activeTab === 'dashboard' && selectedReport && (
            <ReportDashboard report={selectedReport} />
          )}

          {activeTab === 'dashboard' && !selectedReport && (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center">
              <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mb-4">
                <LayoutDashboard className="w-8 h-8 text-slate-500" />
              </div>
              <h2 className="text-2xl font-bold mb-2">No Active Report</h2>
              <p className="text-slate-400 max-w-md">Select an opponent to initialize the PrepSuite analysis engine.</p>
              <button
                onClick={() => setActiveTab('search')}
                className="mt-6 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-medium transition-colors"
              >
                Start New Prep
              </button>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-4">
              <h2 className="text-2xl font-bold mb-6">Search History</h2>
              {history.length === 0 ? (
                <p className="text-slate-500 italic">No historical searches available.</p>
              ) : (
                <div className="grid gap-4">
                  {history.map((h) => (
                    <div
                      key={h.id}
                      onClick={() => selectFromHistory(h)}
                      className="group bg-slate-900 border border-slate-800 p-4 rounded-xl hover:border-indigo-500/50 cursor-pointer transition-all flex justify-between items-center"
                    >
                      <div>
                        <h3 className="text-lg font-semibold group-hover:text-indigo-400 transition-colors">{h.player.name}</h3>
                        <p className="text-sm text-slate-400">{h.player.country} • Rating: {h.player.currentRating || 'Unrated'}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-slate-500">Report: {new Date(h.lastUpdated).toLocaleDateString()}</span>
                        <ChevronRight className="w-5 h-5 text-slate-600" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
