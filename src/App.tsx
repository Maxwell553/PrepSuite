import React, { useState, useEffect, useRef } from 'react';
import { Search, History, Shield, Database, LayoutDashboard, ChevronRight, ChevronLeft, User, Loader2, Trash2, Square, CheckSquare } from 'lucide-react';
import SearchScreen from './components/SearchScreen';
import ReportDashboard from './components/ReportDashboard';
import Sidebar from './components/Sidebar';
import OfflineBanner from './components/OfflineBanner';
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
import AboutPrepSuite from './components/AboutPrepSuite';
import { ThemeProvider } from './lib/themeContext';
import { setSentryUser, clearSentryUser } from './lib/sentry';
import { mergeReport } from './lib/reportUtils';

function FeaturedReportLayout({
  report,
  user,
  onBack,
}: {
  report: ScoutingReport;
  user: SupabaseUser | null;
  onBack: () => void;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [report]);
  return (
    <div ref={scrollRef} className="h-screen overflow-y-auto bg-slate-950 dark:bg-slate-950 bg-gray-50">
      <header className="sticky top-0 z-10 backdrop-blur-md bg-slate-950/80 border-b border-slate-800 p-4 flex justify-between items-center">
        <button type="button" onClick={onBack} className="text-slate-400 hover:text-white flex items-center gap-2">
          <ChevronLeft className="w-4 h-4" /> Back to home
        </button>
        <span className="text-slate-400 text-sm">Featured Report — No sign-in required</span>
      </header>
      <main className="max-w-6xl mx-auto p-6">
        <ReportDashboard report={report} requiresSignInForChat={!user} />
      </main>
    </div>
  );
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'search' | 'dashboard' | 'history'>('search');
  const [selectedReport, setSelectedReport] = useState<ScoutingReport | null>(null);
  const [history, setHistory] = useState<ScoutingReport[]>([]);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; reportIds: string[] }>({ isOpen: false, reportIds: [] });
  const [selectedReportIds, setSelectedReportIds] = useState<Set<string>>(new Set());
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [showLandingPage, setShowLandingPage] = useState(false);
  const [viewingFeaturedReport, setViewingFeaturedReport] = useState<ScoutingReport | null>(null);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [showTermsOfService, setShowTermsOfService] = useState(false);
  const [showAboutPrepSuite, setShowAboutPrepSuite] = useState(false);
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);
  // Persist loading state across tab switches
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const isGeneratingRef = useRef(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  useEffect(() => {
    isGeneratingRef.current = isAnalyzing;
  }, [isAnalyzing]);
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

  useEffect(() => {
    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => setIsOffline(false);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
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

  const handleReportGenerated = (report: ScoutingReport, options?: { fromCache?: boolean; isInitial?: boolean }) => {
    setSelectedReport(report);
    setActiveTab('dashboard');
    if (options?.isInitial) {
      setIsAnalyzing(true);
      isGeneratingRef.current = true;
    } else {
      setIsAnalyzing(false);
      isGeneratingRef.current = false;
      // Auto-save report to user's profile (skip when loading from cache - already saved)
      if (!options?.fromCache) {
        handleSaveReport(report);
      }
    }
  };

  const handleReportPartialUpdate = (partial: Partial<ScoutingReport>) => {
    if (isGeneratingRef.current) {
      setSelectedReport((prev) => (prev ? mergeReport(prev, partial) : prev));
    }
  };

  const handleSaveReport = async (reportToSave?: ScoutingReport) => {
    const report = reportToSave ?? selectedReport;
    if (!report || !user) return;

    try {
      console.log('[Save] Starting save process for report:', report.id);
      
      // Validate report has required fields
      if (!report.player.name) {
        throw new Error('Report is missing player name');
      }
      if (!report.id) {
        throw new Error('Report is missing ID');
      }

      // 1. Create or update player record
      console.log('[Save] Creating/updating player record with data:', {
        full_name: report.player.name,
        fide_id: report.player.fideId || '',
        uscf_id: report.player.uscfId || '',
        chess_com_username: report.player.platforms?.chessCom || '',
        lichess_username: report.player.platforms?.lichess || ''
      });
      
      const player = await playerRepository.createVerifiedPlayer({
        full_name: report.player.name,
        fide_id: report.player.fideId || '',
        uscf_id: report.player.uscfId || '',
        chess_com_username: report.player.platforms?.chessCom || '',
        lichess_username: report.player.platforms?.lichess || '',
        metadata: {}
      });

      if (!player || !player.id) {
        throw new Error('Failed to create/update player record: No player ID returned');
      }

      console.log('[Save] Player record created/updated:', player.id);

      // 2. Save the report
      await playerRepository.saveReport(player.id, report, user.id);

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
    setConfirmModal({ isOpen: true, reportIds: [reportId] });
  };

  const handleBulkDeleteClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (selectedReportIds.size === 0) return;
    setConfirmModal({ isOpen: true, reportIds: Array.from(selectedReportIds) });
  };

  const toggleReportSelection = (reportId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setSelectedReportIds((prev) => {
      const next = new Set(prev);
      if (next.has(reportId)) next.delete(reportId);
      else next.add(reportId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedReportIds.size === history.length) {
      setSelectedReportIds(new Set());
    } else {
      setSelectedReportIds(new Set(history.map((h) => h.id!).filter(Boolean)));
    }
  };

  const handleConfirmDelete = async () => {
    if (!user || confirmModal.reportIds.length === 0) return;

    try {
      await playerRepository.deleteReports(confirmModal.reportIds);

      // Update local history
      const updatedHistory = await playerRepository.getUserHistory(user.id);
      setHistory(updatedHistory);

      // Clear selection and deselect if deleted
      setSelectedReportIds(new Set());
      if (selectedReport && confirmModal.reportIds.includes(selectedReport.id!)) {
        setSelectedReport(null);
        setActiveTab('search');
      }

      showToast(
        confirmModal.reportIds.length === 1
          ? 'Dossier deleted successfully!'
          : `${confirmModal.reportIds.length} dossiers deleted successfully!`,
        'success'
      );
    } catch (error) {
      logError(error, { operation: 'delete report', source: 'App' });
      const errorMessage = getUserFriendlyError(error, { operation: 'delete dossier' });
      showToast(errorMessage, 'error');
    } finally {
      setConfirmModal({ isOpen: false, reportIds: [] });
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

  if (loadingAuth) {
    return (
      <ThemeProvider>
        {isOffline && <OfflineBanner />}
        <div className="h-screen bg-slate-950 dark:bg-slate-950 bg-gray-50 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-indigo-500 dark:text-indigo-500 text-indigo-600 animate-spin" />
        </div>
      </ThemeProvider>
    );
  }

  if (showPrivacyPolicy) {
    return (
      <ThemeProvider>
        {isOffline && <OfflineBanner />}
        <PrivacyPolicy onBack={() => setShowPrivacyPolicy(false)} />
      </ThemeProvider>
    );
  }

  if (showTermsOfService) {
    return (
      <ThemeProvider>
        {isOffline && <OfflineBanner />}
        <TermsOfService onBack={() => setShowTermsOfService(false)} />
      </ThemeProvider>
    );
  }

  if (showAboutPrepSuite) {
    return (
      <ThemeProvider>
        {isOffline && <OfflineBanner />}
        <AboutPrepSuite onBack={() => setShowAboutPrepSuite(false)} />
      </ThemeProvider>
    );
  }

  const handleViewFeaturedReport = async (slug: string) => {
    const { getFeaturedReport } = await import('./services/featuredReports');
    const report = await getFeaturedReport(slug);
    if (report) {
      setViewingFeaturedReport(report);
      setShowLandingPage(false);
    }
  };

  if (viewingFeaturedReport) {
    return (
      <ThemeProvider>
        {isOffline && <OfflineBanner />}
        <FeaturedReportLayout
          report={viewingFeaturedReport}
          user={user}
          onBack={() => {
            setViewingFeaturedReport(null);
            setShowLandingPage(true);
          }}
        />
      </ThemeProvider>
    );
  }

  if (!user || showLandingPage) {
    return (
      <ThemeProvider>
        {isOffline && <OfflineBanner />}
        <div className="h-screen overflow-y-auto overflow-x-hidden">
        <LandingPage 
          onGetStarted={() => {
            if (user) {
              setShowLandingPage(false);
            } else {
              const el = document.getElementById('access');
              el?.scrollIntoView({ behavior: 'smooth' });
            }
          }} 
          onLogin={handleLogin}
          user={user}
          onShowPrivacyPolicy={() => setShowPrivacyPolicy(true)}
          onShowTermsOfService={() => setShowTermsOfService(true)}
          onShowAboutPrepSuite={() => setShowAboutPrepSuite(true)}
          onViewFeaturedReport={handleViewFeaturedReport}
        />
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      {isOffline && <OfflineBanner />}
      <div className="flex h-screen bg-slate-950 dark:bg-slate-950 bg-gray-50 text-slate-100 dark:text-slate-100 text-gray-900 overflow-hidden">
        {!showUserSettings && (
          <Sidebar 
            activeTab={activeTab} 
            setActiveTab={setActiveTab}
            onLogoClick={() => setShowLandingPage(true)}
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
                <span className="text-[0.9rem] font-normal text-slate-500 dark:text-slate-500 text-gray-600 uppercase tracking-widest">V1.1 Stable</span>
                <div className="flex items-center gap-4">
                  <div className="hidden sm:block bg-slate-900 dark:bg-slate-900 bg-gray-100 border border-emerald-500/50 dark:border-emerald-500/50 border-emerald-400 px-3 py-1 rounded-full text-xs font-medium text-emerald-400 dark:text-emerald-400 text-emerald-600">
                    Live Database Sync
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 dark:text-slate-500 text-gray-600 hidden md:block">{user.email}</span>
                    <div
                      onClick={() => setShowUserSettings(true)}
                      className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white cursor-pointer hover:bg-indigo-500 transition-colors ml-[12px]"
                    >
                      <User className="w-5 h-5" />
                    </div>
                  </div>
                </div>
              </header>

              <div className={`p-6 mx-auto ${activeTab === 'dashboard' && selectedReport ? 'max-w-[90rem]' : 'max-w-7xl'}`}>
                {activeTab === 'search' && (
                  <SearchScreen 
                    onReportGenerated={handleReportGenerated} 
                    onReportPartialUpdate={handleReportPartialUpdate}
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
                    isGenerating={isAnalyzing}
                    generatingStatus={scanningStatus}
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
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                      <h2 className="text-2xl font-bold text-white dark:text-white text-gray-900">Search History</h2>
                      {history.length > 0 && (
                        <div className="flex items-center gap-3">
                          <button onClick={toggleSelectAll} className="text-sm text-slate-400 hover:text-indigo-400 transition-colors">
                            {selectedReportIds.size === history.length ? 'Clear selection' : 'Select all'}
                          </button>
                          {selectedReportIds.size > 0 && (
                            <button onClick={handleBulkDeleteClick} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-all">
                              <Trash2 className="w-4 h-4" />
                              Delete selected ({selectedReportIds.size})
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    {history.length === 0 ? (
                      <p className="text-slate-500 dark:text-slate-500 text-gray-600 italic">No historical searches available.</p>
                    ) : (
                      <div className="grid gap-4">
                        {history.map((h) => (
                          <div
                            key={h.id}
                            onClick={() => selectFromHistory(h)}
                            className={`group bg-slate-900 dark:bg-slate-900 bg-white border p-4 rounded-xl cursor-pointer transition-all flex justify-between items-center gap-4 ${
                              selectedReportIds.has(h.id!) ? 'border-indigo-500/70 ring-1 ring-indigo-500/30' : 'border-slate-800 dark:border-slate-800 border-gray-200 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 hover:border-indigo-600'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <button onClick={(e) => toggleReportSelection(h.id!, e)} className="flex-shrink-0 p-1 text-slate-500 hover:text-indigo-400 transition-colors" title={selectedReportIds.has(h.id!) ? 'Deselect' : 'Select'}>
                                {selectedReportIds.has(h.id!) ? <CheckSquare className="w-5 h-5 text-indigo-400" /> : <Square className="w-5 h-5" />}
                              </button>
                              <div className="min-w-0">
                                <h3 className="text-lg font-semibold group-hover:text-indigo-400 dark:group-hover:text-indigo-400 group-hover:text-indigo-600 transition-colors text-white dark:text-white text-gray-900 truncate">{h.player.name}</h3>
                                <p className="text-sm text-slate-400 dark:text-slate-400 text-gray-600">{h.player.country} • Rating: {h.player.currentRating || 'Unrated'}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 flex-shrink-0">
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
          onClose={() => setConfirmModal({ isOpen: false, reportIds: [] })}
          onConfirm={handleConfirmDelete}
          title="Delete Dossier"
          message={confirmModal.reportIds.length === 1
            ? 'Are you sure you want to delete this player dossier? This action removes it from your history permanently and cannot be undone.'
            : `Are you sure you want to delete ${confirmModal.reportIds.length} dossiers? This action removes them from your history permanently and cannot be undone.`}
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
