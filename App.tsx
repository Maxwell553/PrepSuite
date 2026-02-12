import React, { useState, useEffect } from 'react';
import { Search, History, Shield, Database, LayoutDashboard, ChevronRight, User, Loader2, Trash2 } from 'lucide-react';
import SearchScreen from './components/SearchScreen';
import ReportDashboard from './components/ReportDashboard';
import Sidebar from './components/Sidebar';
import { ScoutingReport } from './types';
import LandingPage from './components/LandingPage';
import { supabase, authActions } from './lib/supabase';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { playerRepository } from './services/playerRepository';
import Toast, { ToastType } from './components/Toast';
import ConfirmationModal from './components/ConfirmationModal';
import { getUserFriendlyError, logError } from './lib/errorUtils';
import UserSettings from './components/UserSettings';
import PrivacyPolicy from './components/PrivacyPolicy';
import TermsOfService from './components/TermsOfService';
import { ThemeProvider } from './lib/themeContext';
import { setSentryUser, clearSentryUser } from './lib/sentry';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'search' | 'dashboard' | 'history'>('search');
  const [selectedReport, setSelectedReport] = useState<ScoutingReport | null>(null);
  const [history, setHistory] = useState<ScoutingReport[]>([]);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; reportId: string | null }>({ isOpen: false, reportId: null });
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [showLandingPage, setShowLandingPage] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [showTermsOfService, setShowTermsOfService] = useState(false);
  // Persist loading state across tab switches
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStage, setLoadingStage] = useState<'identity' | 'fetching' | 'analyzing' | 'generating' | null>(null);
  const [scanningStatus, setScanningStatus] = useState<string>('');

  const showToast = (message: string, type: ToastType) => {
    setToast({ message, type });
  };

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      setLoadingAuth(false);
      
      // Set Sentry user context
      if (currentUser) {
        setSentryUser({
          id: currentUser.id,
          email: currentUser.email,
        });
      } else {
        clearSentryUser();
      }
    });

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      
      // Update Sentry user context
      if (currentUser) {
        setSentryUser({
          id: currentUser.id,
          email: currentUser.email,
        });
      } else {
        clearSentryUser();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch history when user is available (only once, not on every render)
  useEffect(() => {
    const fetchHistory = async () => {
      if (!user) return;
      try {
        const data = await playerRepository.getUserHistory(user.id);
        setHistory(data);
      } catch (error) {
        console.error('Failed to fetch history:', error);
        // Don't show error toast here as it's a background operation
        // User can retry by navigating to history tab
      }
    };
    fetchHistory();
    // Only fetch when user changes, not on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleReportGenerated = (report: ScoutingReport) => {
    setSelectedReport(report);
    setActiveTab('dashboard');
    // We don't add to history yet, wait for manual save or show in dashboard
  };

  const handleSaveReport = async () => {
    if (!selectedReport || !user) return;

    try {
      console.log('[Save] Starting save process for report:', selectedReport.id);
      
      // Validate report has required fields
      if (!selectedReport.player.name) {
        throw new Error('Report is missing player name');
      }
      if (!selectedReport.id) {
        throw new Error('Report is missing ID');
      }

      // 1. Create or update player record
      console.log('[Save] Creating/updating player record with data:', {
        full_name: selectedReport.player.name,
        fide_id: selectedReport.player.fideId || '',
        uscf_id: selectedReport.player.uscfId || '',
        chess_com_username: selectedReport.player.platforms?.chessCom || '',
        lichess_username: selectedReport.player.platforms?.lichess || ''
      });
      
      const player = await playerRepository.createVerifiedPlayer({
        full_name: selectedReport.player.name,
        fide_id: selectedReport.player.fideId || '',
        uscf_id: selectedReport.player.uscfId || '',
        chess_com_username: selectedReport.player.platforms?.chessCom || '',
        lichess_username: selectedReport.player.platforms?.lichess || '',
        metadata: {}
      });

      if (!player || !player.id) {
        throw new Error('Failed to create/update player record: No player ID returned');
      }

      console.log('[Save] Player record created/updated:', player.id);

      // 2. Save the report
      await playerRepository.saveReport(player.id, selectedReport, user.id);

      console.log('[Save] Report saved successfully');

      // Update local history
      const updatedHistory = await playerRepository.getUserHistory(user.id);
      setHistory(updatedHistory);

      showToast('Dossier saved successfully!', 'success');
    } catch (error) {
      logError(error, { operation: 'save report', source: 'App' });
      const errorMessage = getUserFriendlyError(error, { operation: 'save dossier' });
      console.error('[Save] Error details:', error);
      showToast(errorMessage, 'error');
    }
  };

  const handleDeleteClick = (reportId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setConfirmModal({ isOpen: true, reportId });
  };

  const handleConfirmDelete = async () => {
    if (!user || !confirmModal.reportId) return;

    try {
      await playerRepository.deleteReport(confirmModal.reportId);

      // Update local history
      const updatedHistory = await playerRepository.getUserHistory(user.id);
      setHistory(updatedHistory);

      // If the deleted report was currently selected, clear it
      if (selectedReport?.id === confirmModal.reportId) {
        setSelectedReport(null);
        setActiveTab('search');
      }

      showToast('Dossier deleted successfully!', 'success');
    } catch (error) {
      logError(error, { operation: 'delete report', source: 'App' });
      const errorMessage = getUserFriendlyError(error, { operation: 'delete dossier' });
      showToast(errorMessage, 'error');
    } finally {
      setConfirmModal({ isOpen: false, reportId: null });
    }
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
    } catch (err: unknown) {
      logError(err, { operation: 'authentication', source: 'App' });
      const errorMessage = getUserFriendlyError(err, { operation: 'authentication' });
      alert(errorMessage);
    }
  };

  const handleLogout = async () => {
    await authActions.signOut();
  };

  const handleNavigateToLanding = () => {
    setShowLandingPage(true);
  };

  const handleNavigateToApp = () => {
    setShowLandingPage(false);
  };

  if (loadingAuth) {
    return (
      <ThemeProvider>
        <div className="h-screen bg-slate-950 dark:bg-slate-950 bg-gray-50 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-indigo-500 dark:text-indigo-500 text-indigo-600 animate-spin" />
        </div>
      </ThemeProvider>
    );
  }

  if (showPrivacyPolicy) {
    return (
      <ThemeProvider>
        <PrivacyPolicy onBack={() => setShowPrivacyPolicy(false)} />
      </ThemeProvider>
    );
  }

  if (showTermsOfService) {
    return (
      <ThemeProvider>
        <TermsOfService onBack={() => setShowTermsOfService(false)} />
      </ThemeProvider>
    );
  }

  if (!user || showLandingPage) {
    return (
      <ThemeProvider>
        <LandingPage 
          onGetStarted={() => {
            if (user) {
              handleNavigateToApp();
            } else {
              const el = document.getElementById('access');
              el?.scrollIntoView({ behavior: 'smooth' });
            }
          }} 
          onLogin={handleLogin}
          user={user}
          onShowPrivacyPolicy={() => setShowPrivacyPolicy(true)}
          onShowTermsOfService={() => setShowTermsOfService(true)}
        />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <div className="flex h-screen bg-slate-950 dark:bg-slate-950 bg-gray-50 text-slate-100 dark:text-slate-100 text-gray-900 overflow-hidden">
        {!showUserSettings && (
          <Sidebar 
            activeTab={activeTab} 
            setActiveTab={setActiveTab}
            onLogoClick={handleNavigateToLanding}
          />
        )}

        <main className="flex-1 overflow-y-auto relative bg-slate-950 dark:bg-slate-950 bg-gray-50 overscroll-none" style={{ overscrollBehavior: 'none' }}>
          {showUserSettings ? (
            <div className="h-full overflow-y-auto">
              <UserSettings 
                user={user} 
                onBack={() => setShowUserSettings(false)}
                onAccountDeleted={() => {
                  setShowUserSettings(false);
                  setShowLandingPage(true);
                  // User will be signed out by UserSettings component
                }}
              />
            </div>
          ) : (
            <>
              <header className="sticky top-0 z-10 backdrop-blur-md bg-slate-950/80 dark:bg-slate-950/80 bg-gray-50/80 border-b border-slate-800 dark:border-slate-800 border-gray-200 p-4 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="p-1">
                    <Shield className="w-6 h-6 text-indigo-500 dark:text-indigo-500 text-indigo-600" />
                  </div>
                  <h1 className="text-xl font-semibold tracking-tight text-white dark:text-slate-100 text-gray-900">PrepSuite <span className="text-xs font-normal text-slate-500 dark:text-slate-500 text-gray-600 uppercase tracking-widest ml-2">v1.2 Stable</span></h1>
                </div>
                <div className="flex items-center gap-4">
                  <div className="hidden sm:block bg-slate-900 dark:bg-slate-900 bg-gray-100 border border-emerald-500/50 dark:border-emerald-500/50 border-emerald-400 px-3 py-1 rounded-full text-xs font-medium text-emerald-400 dark:text-emerald-400 text-emerald-600">
                    Live Database Sync
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 dark:text-slate-500 text-gray-600 hidden md:block">{user.email}</span>
                    <div
                      onClick={() => setShowUserSettings(true)}
                      className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white cursor-pointer hover:bg-indigo-500 transition-colors"
                    >
                      <User className="w-5 h-5" />
                    </div>
                  </div>
                </div>
              </header>

              <div className="p-6 max-w-7xl mx-auto">
                {activeTab === 'search' && (
                  <SearchScreen 
                    onReportGenerated={handleReportGenerated} 
                    user={user}
                    isAnalyzing={isAnalyzing}
                    setIsAnalyzing={setIsAnalyzing}
                    loadingProgress={loadingProgress}
                    setLoadingProgress={setLoadingProgress}
                    loadingStage={loadingStage}
                    setLoadingStage={setLoadingStage}
                    scanningStatus={scanningStatus}
                    setScanningStatus={setScanningStatus}
                  />
                )}

                {activeTab === 'dashboard' && selectedReport && (
                  <ReportDashboard
                    report={selectedReport}
                    onSave={handleSaveReport}
                    isSaved={history.some(h => h.id === selectedReport.id)}
                  />
                )}

                {activeTab === 'dashboard' && !selectedReport && (
                  <div className="flex flex-col items-center justify-center h-[60vh] text-center">
                    <div className="w-16 h-16 bg-slate-900 dark:bg-slate-900 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                      <LayoutDashboard className="w-8 h-8 text-slate-500 dark:text-slate-500 text-gray-400" />
                    </div>
                    <h2 className="text-2xl font-bold mb-2 text-white dark:text-white text-gray-900">No Active Report</h2>
                    <p className="text-slate-400 dark:text-slate-400 text-gray-600 max-w-md">Select an opponent to initialize the PrepSuite analysis engine.</p>
                    <button
                      onClick={() => setActiveTab('search')}
                      className="mt-6 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-medium transition-colors text-white"
                    >
                      Start New Prep
                    </button>
                  </div>
                )}

                {activeTab === 'history' && (
                  <div className="space-y-4">
                    <h2 className="text-2xl font-bold mb-6 text-white dark:text-white text-gray-900">Search History</h2>
                    {history.length === 0 ? (
                      <p className="text-slate-500 dark:text-slate-500 text-gray-600 italic">No historical searches available.</p>
                    ) : (
                      <div className="grid gap-4">
                        {history.map((h) => (
                          <div
                            key={h.id}
                            onClick={() => selectFromHistory(h)}
                            className="group bg-slate-900 dark:bg-slate-900 bg-white border border-slate-800 dark:border-slate-800 border-gray-200 p-4 rounded-xl hover:border-indigo-500/50 dark:hover:border-indigo-500/50 hover:border-indigo-600 cursor-pointer transition-all flex justify-between items-center"
                          >
                            <div>
                              <h3 className="text-lg font-semibold group-hover:text-indigo-400 dark:group-hover:text-indigo-400 group-hover:text-indigo-600 transition-colors text-white dark:text-white text-gray-900">{h.player.name}</h3>
                              <p className="text-sm text-slate-400 dark:text-slate-400 text-gray-600">{h.player.country} • Rating: {h.player.currentRating || 'Unrated'}</p>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="text-xs text-slate-500 dark:text-slate-500 text-gray-600">Report: {new Date(h.lastUpdated).toLocaleDateString()}</span>
                              <button
                                onClick={(e) => handleDeleteClick(h.id!, e)}
                                className="p-2 text-slate-500 dark:text-slate-500 text-gray-600 hover:text-red-400 dark:hover:text-red-400 hover:text-red-600 hover:bg-red-500/10 dark:hover:bg-red-500/10 hover:bg-red-50 rounded-lg transition-all"
                                title="Delete dossier"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <ChevronRight className="w-5 h-5 text-slate-600 dark:text-slate-600 text-gray-400" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </main>

        <ConfirmationModal
          isOpen={confirmModal.isOpen}
          onClose={() => setConfirmModal({ isOpen: false, reportId: null })}
          onConfirm={handleConfirmDelete}
          title="Delete Dossier"
          message="Are you sure you want to delete this player dossier? This action removes it from your history permanently and cannot be undone."
          confirmText="Delete Dossier"
          type="danger"
        />

        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </div>
    </ThemeProvider>
  );
};

export default App;
