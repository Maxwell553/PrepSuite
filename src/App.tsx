import React, { useState, useEffect, useRef, lazy, Suspense, useMemo } from 'react';
import { Search, History, Shield, Database, LayoutDashboard, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, User, Loader2, Trash2, Square, CheckSquare, FolderOpen } from 'lucide-react';
const SearchScreen = lazy(() => import('./components/SearchScreen'));
const ReportDashboard = lazy(() => import('./components/ReportDashboard'));
const Sidebar = lazy(() => import('./components/Sidebar'));
import OfflineBanner from './components/OfflineBanner';
import { ScoutingReport } from './types';
import LandingPage from './components/LandingPage';
import { supabase, authActions } from './lib/supabase';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { playerRepository } from './services/playerRepository';
import Toast, { ToastType } from './components/Toast';
import ConfirmationModal from './components/ConfirmationModal';
import { getUserFriendlyError, logError } from './lib/errorUtils';
const UserSettings = lazy(() => import('./components/UserSettings'));
const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./components/TermsOfService'));
const AboutPrepSuite = lazy(() => import('./components/AboutPrepSuite'));
const SupportChat = lazy(() => import('./components/SupportChat'));
import { ThemeProvider } from './lib/themeContext';
import { setSentryUser, clearSentryUser } from './lib/sentry';
import { trackSignUpConversion, trackSignUpConversionIfNewUser } from './lib/googleAds';
import { mergeReport } from './lib/reportUtils';
import { useCredits } from './hooks/useCredits';
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
      <header className="sticky top-0 z-10 backdrop-blur-md bg-slate-950/80 border-b border-slate-800 p-4 flex flex-wrap gap-3 justify-between items-center">
        <button type="button" onClick={onBack} className="text-slate-400 hover:text-white flex items-center gap-2">
          <ChevronLeft className="w-4 h-4" /> Back to home
        </button>
        <span className="text-slate-400 text-sm hidden sm:inline">Featured Report — No sign-in required</span>
      </header>
      <main className="max-w-6xl mx-auto p-6">
        <Suspense fallback={<div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-10 h-10 animate-spin text-indigo-400" /></div>}>
          <ReportDashboard report={report} requiresSignInForChat={!user} hideCreditsBadge />
        </Suspense>
      </main>
    </div>
  );
}

const pathByTab = { search: '/analysis', dashboard: '/dashboard', history: '/history' } as const;

const App: React.FC = () => {
  const [activeTabState, setActiveTabState] = useState<'search' | 'dashboard' | 'history'>('search');
  const setActiveTab = React.useCallback((tab: 'search' | 'dashboard' | 'history') => {
    setActiveTabState(tab);
    const path = pathByTab[tab];
    if (path && window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
  }, []);
  const activeTab = activeTabState;
  const [selectedReport, setSelectedReport] = useState<ScoutingReport | null>(null);
  const [history, setHistory] = useState<ScoutingReport[]>([]);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; reportIds: string[] }>({ isOpen: false, reportIds: [] });
  const [selectedReportIds, setSelectedReportIds] = useState<Set<string>>(new Set());
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [historyView, setHistoryView] = useState<'folders' | 'individual'>('individual');
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [showLandingPage, setShowLandingPage] = useState(true);
  const [viewingFeaturedReport, setViewingFeaturedReport] = useState<ScoutingReport | null>(null);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(() => window.location.pathname === '/privacy-policy');
  const [showTermsOfService, setShowTermsOfService] = useState(() => window.location.pathname === '/terms-of-service');
  const [showAboutPrepSuite, setShowAboutPrepSuite] = useState(() => window.location.pathname === '/about');
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
  const [creditsDeductedForReport, setCreditsDeductedForReport] = useState<number | null>(null);

  // MONETIZATION_DISABLED: useCredits commented out for deployment
  const { credits, hasEnoughCredits, refetch: refetchCredits } = useCredits(user?.id);

  const showToast = (message: string, type: ToastType) => {
    setToast({ message, type });
  };

  useEffect(() => {
    const hasAuthParamsInUrl = () => {
      const s = (window.location.hash || '') + (window.location.search || '');
      return /(access_token|refresh_token|code)=/.test(s);
    };

    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      // If URL has auth params (OAuth redirect) but no session yet, PKCE exchange may still be in progress.
      // Don't finish loading until onAuthStateChange fires—otherwise we'd show "Get Started" briefly.
      if (!hasAuthParamsInUrl() || currentUser) {
        setLoadingAuth(false);
      }
      if (currentUser) {
        setSentryUser({ id: currentUser.id, email: currentUser.email });
      } else {
        clearSentryUser();
      }
    });

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      setLoadingAuth(false); // Always allow render once we get an auth event

      // Do not redirect on every SIGNED_IN — Safari / Supabase can emit it again when the tab regains focus,
      // which was kicking users off the marketing page. OAuth lands on `/analysis`; email sign-in navigates in handleLogin.
      if (event === 'SIGNED_IN' && currentUser) {
        trackSignUpConversionIfNewUser(currentUser.id, currentUser.created_at);
      }
      if (currentUser) {
        setSentryUser({ id: currentUser.id, email: currentUser.email });
      } else {
        clearSentryUser();
      }
    });

    // Fallback: if we stayed loading due to auth params but never got a session (e.g. user cancelled), unblock after 5s
    const timeout = setTimeout(() => setLoadingAuth(false), 5000);
    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
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

  // Sync app state with URL pathname (supports /privacy-policy, /terms-of-service, /about, /analysis, /history, /dashboard, /settings, /featured/:slug)
  const isInLandingFlow = !user || showLandingPage || showPrivacyPolicy || showTermsOfService || showAboutPrepSuite || !!viewingFeaturedReport;
  const appRoutes = ['/analysis', '/history', '/dashboard', '/settings'] as const;
  const tabByPath: Record<string, 'search' | 'dashboard' | 'history'> = {
    '/analysis': 'search',
    '/history': 'history',
    '/dashboard': 'dashboard',
  };

  const syncStateFromPath = React.useCallback(() => {
    const path = window.location.pathname;
    // Landing/legal pages
    setShowPrivacyPolicy(path === '/privacy-policy');
    setShowTermsOfService(path === '/terms-of-service');
    setShowAboutPrepSuite(path === '/about');
    // Featured reports
    if (path.startsWith('/featured/')) {
      const slug = path.replace(/^\/featured\/?/, '').replace(/\/$/, '') || undefined;
      if (slug) {
        import('./services/featuredReports').then(({ getFeaturedReport }) => {
          getFeaturedReport(slug).then((report) => {
            if (report) setViewingFeaturedReport(report);
            else setViewingFeaturedReport(null);
          });
        });
      } else {
        setViewingFeaturedReport(null);
      }
      setShowLandingPage(false);
    } else {
      setViewingFeaturedReport(null);
      // App routes: only apply when user is logged in (checked by caller)
      if (appRoutes.includes(path)) {
        setShowLandingPage(false);
        if (path === '/settings') {
          setShowUserSettings(true);
        } else {
          setShowUserSettings(false);
          const tab = tabByPath[path];
          if (tab) setActiveTabState(tab);
        }
      } else if (path === '/' || path === '') {
        setShowLandingPage(true);
        setShowUserSettings(false);
      }
    }
  }, []);

  // On initial load and popstate, sync state from URL
  useEffect(() => {
    const path = window.location.pathname;
    const hasAuthParams = /(access_token|refresh_token|code)=/.test(
      (window.location.hash || '') + (window.location.search || '')
    );
    // Don't sync when OAuth callback may be in progress (auth params in URL, session not yet established)
    if (hasAuthParams && !user) return;
    // Redirect unauthenticated users from app routes to landing
    if (!loadingAuth && !user && appRoutes.includes(path)) {
      window.history.replaceState({}, '', '/');
      setShowLandingPage(true);
      return;
    }
    // OAuth / magic-link return: session in URL on home path — go to analysis once (not on every visit to `/` while logged in).
    if (user && (path === '/' || path === '') && hasAuthParams) {
      setShowLandingPage(false);
      window.history.replaceState({}, '', '/analysis');
      return;
    }
    // Only apply app route logic when user is logged in
    if (user && appRoutes.includes(path)) {
      syncStateFromPath();
    } else if (!appRoutes.includes(path)) {
      syncStateFromPath();
    }
  }, [syncStateFromPath, loadingAuth, user]);

  // Listen for back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (!user && appRoutes.includes(path)) {
        window.history.replaceState({}, '', '/');
        setShowLandingPage(true);
      } else {
        syncStateFromPath();
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [syncStateFromPath, user]);

  // Establish landing state on first load when on home
  useEffect(() => {
    if (!isInLandingFlow || showPrivacyPolicy || showTermsOfService || showAboutPrepSuite || viewingFeaturedReport) return;
    const path = window.location.pathname;
    if (path !== '/' && path !== '') return;
    const state = window.history.state as { landingView?: string } | null;
    if (!state?.landingView) {
      window.history.replaceState({ landingView: 'main' }, '', '/');
    }
  }, [isInLandingFlow, showPrivacyPolicy, showTermsOfService, showAboutPrepSuite, viewingFeaturedReport]);

  // Refetch credits when returning from successful credit purchase
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('credits') === 'success') {
      refetchCredits();
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [refetchCredits]);

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

  const handleReportGenerated = (report: ScoutingReport, options?: { fromCache?: boolean; isInitial?: boolean; fromBatch?: boolean; batchItemStart?: boolean; folderId?: string }) => {
    setSelectedReport(report);
    setActiveTab('dashboard');
    if (options?.isInitial) {
      setCreditsDeductedForReport(null); // Clear until new report completes
      setIsAnalyzing(true);
      isGeneratingRef.current = true;
    } else if (options?.batchItemStart) {
      // Starting next batch item: keep loading overlay, show empty report for this player
      setIsAnalyzing(true);
      isGeneratingRef.current = true;
    } else if (!options?.fromBatch) {
      setIsAnalyzing(false);
      isGeneratingRef.current = false;
      if (!options?.fromCache) {
        handleSaveReport(report);
      }
    } else {
      // fromBatch: completed one report; keep isAnalyzing (batch still running); save
      if (!options?.fromCache) {
        handleSaveReport(report, options?.folderId);
      }
    }
  };

  const handleReportPartialUpdate = (partial: Partial<ScoutingReport>) => {
    if (isGeneratingRef.current) {
      setSelectedReport((prev) => (prev ? mergeReport(prev, partial) : prev));
    }
  };

  const handleSaveReport = async (reportToSave?: ScoutingReport, folderId?: string) => {
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

      // 2. Save the report (optionally to folder)
      await playerRepository.saveReport(player.id, report, user.id, folderId);

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

  const { standaloneReports, folderGroups, allReportsFlat } = useMemo(() => {
    const standalone: ScoutingReport[] = [];
    const folderMap = new Map<string, { folderName: string; reports: ScoutingReport[] }>();
    for (const h of history) {
      if (!h.folderId) {
        standalone.push(h);
      } else {
        const existing = folderMap.get(h.folderId);
        const name = h.folderName ?? 'Untitled Folder';
        if (existing) {
          existing.reports.push(h);
        } else {
          folderMap.set(h.folderId, { folderName: name, reports: [h] });
        }
      }
    }
    const folders = Array.from(folderMap.entries()).map(([folderId, { folderName, reports }]) => ({
      folderId,
      folderName,
      reports,
    }));
    const allFlat = [...standalone, ...folders.flatMap((f) => f.reports)];
    return { standaloneReports: standalone, folderGroups: folders, allReportsFlat: allFlat };
  }, [history]);

  const folderIdsKey = useMemo(() => folderGroups.map((f) => f.folderId).sort().join(','), [folderGroups]);
  useEffect(() => {
    if (folderIdsKey) {
      const ids = folderIdsKey.split(',').filter(Boolean);
      setExpandedFolderIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.add(id);
        return next;
      });
    }
  }, [folderIdsKey]);

  const toggleFolderExpanded = (folderId: string) => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const selectFromHistory = (report: ScoutingReport) => {
    setSelectedReport(report);
    setCreditsDeductedForReport(null); // Cached reports don't show credits used
    setActiveTab('dashboard');
  };

  const handleLogin = async (loginData: 'google' | { email: string; password?: string; isNewUser?: boolean }) => {
    try {
      if (typeof loginData === 'string') {
        if (loginData === 'google') await authActions.signInWithGoogle();
      } else {
        if (loginData.password) {
          if (loginData.isNewUser) {
            const res = await authActions.signUp(loginData.email, loginData.password);
            if (res?.data?.user?.id) trackSignUpConversion(res.data.user.id);
            if (res?.data?.session) {
              setShowLandingPage(false);
              window.history.replaceState({}, '', '/analysis');
            }
          } else {
            await authActions.signInWithPassword(loginData.email, loginData.password);
            setShowLandingPage(false);
            window.history.replaceState({}, '', '/analysis');
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
    setShowUserSettings(false);
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

  const openPrivacyPolicy = () => {
    window.history.pushState({}, '', '/privacy-policy');
    setShowPrivacyPolicy(true);
    setShowTermsOfService(false);
    setShowAboutPrepSuite(false);
    setViewingFeaturedReport(null);
  };

  const openTermsOfService = () => {
    window.history.pushState({}, '', '/terms-of-service');
    setShowTermsOfService(true);
    setShowPrivacyPolicy(false);
    setShowAboutPrepSuite(false);
    setViewingFeaturedReport(null);
  };

  const openAboutPrepSuite = () => {
    window.history.pushState({}, '', '/about');
    setShowAboutPrepSuite(true);
    setShowPrivacyPolicy(false);
    setShowTermsOfService(false);
    setViewingFeaturedReport(null);
  };

  /** Always return to marketing home — do not use history.back() (prior entry may be /analysis). */
  const closeLandingSubpage = () => {
    window.history.replaceState({}, '', '/');
    setShowPrivacyPolicy(false);
    setShowTermsOfService(false);
    setShowAboutPrepSuite(false);
    setViewingFeaturedReport(null);
    setShowLandingPage(true);
  };

  const legalFallback = (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center" aria-busy="true" aria-label="Loading">
      <Loader2 className="w-10 h-10 animate-spin text-indigo-400" />
    </div>
  );

  if (showPrivacyPolicy) {
    return (
      <ThemeProvider>
        {isOffline && <OfflineBanner />}
        <Suspense fallback={legalFallback}>
          <PrivacyPolicy onBack={closeLandingSubpage} />
        </Suspense>
        {user ? (
          <Suspense fallback={null}>
            <SupportChat isLoggedIn />
          </Suspense>
        ) : null}
      </ThemeProvider>
    );
  }

  if (showTermsOfService) {
    return (
      <ThemeProvider>
        {isOffline && <OfflineBanner />}
        <Suspense fallback={legalFallback}>
          <TermsOfService onBack={closeLandingSubpage} />
        </Suspense>
        {user ? (
          <Suspense fallback={null}>
            <SupportChat isLoggedIn />
          </Suspense>
        ) : null}
      </ThemeProvider>
    );
  }

  if (showAboutPrepSuite) {
    return (
      <ThemeProvider>
        {isOffline && <OfflineBanner />}
        <Suspense fallback={legalFallback}>
          <AboutPrepSuite onBack={closeLandingSubpage} />
        </Suspense>
        {user ? (
          <Suspense fallback={null}>
            <SupportChat isLoggedIn />
          </Suspense>
        ) : null}
      </ThemeProvider>
    );
  }

  const handleViewFeaturedReport = async (slug: string) => {
    const { getFeaturedReport } = await import('./services/featuredReports');
    const report = await getFeaturedReport(slug);
    if (report) {
      window.history.pushState({}, '', `/featured/${slug}`);
      setViewingFeaturedReport(report);
      setShowLandingPage(false);
      setShowPrivacyPolicy(false);
      setShowTermsOfService(false);
      setShowAboutPrepSuite(false);
    }
  };

  const handleFeaturedReportBack = () => {
    setViewingFeaturedReport(null);
    setShowLandingPage(true);
    setShowPrivacyPolicy(false);
    setShowTermsOfService(false);
    setShowAboutPrepSuite(false);
    window.history.replaceState({}, '', '/');
  };

  if (viewingFeaturedReport) {
    return (
      <ThemeProvider>
        {isOffline && <OfflineBanner />}
        <FeaturedReportLayout
          report={viewingFeaturedReport}
          user={user}
          onBack={handleFeaturedReportBack}
        />
        {user ? (
          <Suspense fallback={null}>
            <SupportChat isLoggedIn />
          </Suspense>
        ) : null}
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
              window.history.pushState({}, '', '/analysis');
            } else {
              const el = document.getElementById('access');
              el?.scrollIntoView({ behavior: 'smooth' });
            }
          }} 
          onLogin={handleLogin}
          user={user}
          onShowPrivacyPolicy={openPrivacyPolicy}
          onShowTermsOfService={openTermsOfService}
          onShowAboutPrepSuite={openAboutPrepSuite}
          onViewFeaturedReport={handleViewFeaturedReport}
          showToast={showToast}
        />
        </div>
        {user ? (
          <Suspense fallback={null}>
            <SupportChat isLoggedIn />
          </Suspense>
        ) : null}
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      {isOffline && <OfflineBanner />}
      <div className="flex h-screen bg-slate-950 dark:bg-slate-950 bg-gray-50 text-slate-100 dark:text-slate-100 text-gray-900 overflow-hidden">
        {!showUserSettings && (
          <Suspense
            fallback={
              <aside
                className="w-64 flex flex-col hidden md:flex shrink-0 border-r border-slate-800/80 border-gray-200 animate-pulse"
                style={{ backgroundColor: '#0f0f1a' }}
                aria-hidden
              />
            }
          >
            <Sidebar
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              onLogoClick={() => {
                setShowLandingPage(true);
                window.history.pushState({}, '', '/');
              }}
              isAnalyzing={isAnalyzing}
            />
          </Suspense>
        )}

        <main className="flex-1 min-w-0 overflow-y-auto relative bg-slate-950 dark:bg-slate-950 bg-gray-50 overscroll-none before:absolute before:inset-0 before:pointer-events-none before:bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(99,102,241,0.08)_0%,transparent_50%)]" style={{ overscrollBehavior: 'none' }}>
          {showUserSettings ? (
            <div className="h-full overflow-y-auto">
              <Suspense
                fallback={
                  <div className="flex items-center justify-center min-h-[50vh]">
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-400" />
                  </div>
                }
              >
                <UserSettings
                  user={user}
                  onBack={() => {
                    setShowUserSettings(false);
                    window.history.pushState({}, '', pathByTab[activeTab]);
                  }}
                  onLogout={handleLogout}
                  onAccountDeleted={() => {
                    setShowUserSettings(false);
                    setShowLandingPage(true);
                  }}
                  credits={credits}
                  onCreditsPurchased={refetchCredits}
                />
              </Suspense>
            </div>
          ) : (
            <>
              <header className="sticky top-0 z-10 backdrop-blur-md bg-slate-950/80 dark:bg-slate-950/80 bg-gray-50/80 border-b border-slate-800 dark:border-slate-800 border-gray-200 p-4 flex justify-between items-center">
                <span className="text-[0.9rem] font-normal text-slate-400 dark:text-slate-400 text-gray-600 uppercase tracking-widest">V1.1 Stable</span>
                <div className="flex items-center gap-4">
                  <div className="hidden sm:block bg-slate-900 dark:bg-slate-900 bg-gray-100 border border-emerald-500/50 dark:border-emerald-500/50 border-emerald-400 px-3 py-1 rounded-full text-xs font-medium text-emerald-400 dark:text-emerald-400 text-emerald-600">
                    Live Database Sync
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 dark:text-slate-400 text-gray-600 hidden md:block">{user.email}</span>
                    <div
                      onClick={() => {
                        setShowUserSettings(true);
                        window.history.pushState({}, '', '/settings');
                      }}
                      className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white cursor-pointer hover:bg-indigo-500 transition-colors ml-[12px]"
                    >
                      <User className="w-5 h-5" />
                    </div>
                  </div>
                </div>
              </header>

              <div className={`p-6 mx-auto min-w-0 ${activeTab === 'dashboard' && selectedReport ? 'max-w-[90rem]' : 'max-w-7xl'}`}>
                {activeTab === 'search' && (
                  <Suspense
                    fallback={
                      <div className="flex items-center justify-center min-h-[320px]">
                        <Loader2 className="w-10 h-10 animate-spin text-indigo-400" />
                      </div>
                    }
                  >
                    <SearchScreen
                      onReportGenerated={handleReportGenerated}
                      onReportPartialUpdate={handleReportPartialUpdate}
                      user={user}
                      credits={credits}
                      hasEnoughCredits={() => true}
                      isAnalyzing={isAnalyzing}
                      setIsAnalyzing={setIsAnalyzing}
                      loadingProgress={loadingProgress}
                      setLoadingProgress={setLoadingProgress}
                      loadingStage={loadingStage}
                      setLoadingStage={setLoadingStage}
                      scanningStatus={scanningStatus}
                      setScanningStatus={setScanningStatus}
                    />
                  </Suspense>
                )}

                {selectedReport && (
                  <div
                    className={activeTab === 'dashboard' ? 'block' : 'hidden'}
                    aria-hidden={activeTab !== 'dashboard'}
                  >
                    <Suspense fallback={
                      <div className="flex items-center justify-center min-h-[400px]">
                        <Loader2 className="w-10 h-10 animate-spin text-indigo-400" />
                      </div>
                    }>
                      <ReportDashboard
                        report={selectedReport}
                        isGenerating={isAnalyzing}
                        generatingStatus={scanningStatus}
                        creditsDeducted={undefined}
                        onGoToSearch={() => setActiveTab('search')}
                      />
                    </Suspense>
                  </div>
                )}

                {activeTab === 'dashboard' && !selectedReport && (
                  <div className="flex flex-col items-center justify-center h-[60vh] text-center">
                    <div className="w-16 h-16 bg-slate-900 dark:bg-slate-900 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                      <LayoutDashboard className="w-8 h-8 text-slate-400 dark:text-slate-400 text-gray-400" />
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
                        <div className="flex items-center gap-4">
                        <div className="flex rounded-lg border border-slate-700 dark:border-slate-700 bg-slate-900/50 p-0.5">
                          <button
                            type="button"
                            onClick={() => setHistoryView('individual')}
                            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                              historyView === 'individual'
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            Individual
                          </button>
                          <button
                            type="button"
                            onClick={() => setHistoryView('folders')}
                            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                              historyView === 'folders'
                                ? 'bg-amber-500/20 text-amber-400'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            Folders
                          </button>
                        </div>
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
                        </div>
                      )}
                    </div>
                    {history.length === 0 ? (
                      <p className="text-slate-400 dark:text-slate-400 text-gray-600 italic">No historical searches available.</p>
                    ) : historyView === 'individual' ? (
                      <div className="space-y-4">
                        {allReportsFlat.map((h) => (
                          <div
                            key={h.id}
                            onClick={() => selectFromHistory(h)}
                            className={`group bg-slate-900 dark:bg-slate-900 bg-white border p-4 rounded-xl cursor-pointer transition-all flex justify-between items-center gap-4 ${
                              selectedReportIds.has(h.id!) ? 'border-indigo-500/70 ring-1 ring-indigo-500/30' : 'border-slate-800 dark:border-slate-800 border-gray-200 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 hover:border-indigo-600'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <button onClick={(e) => toggleReportSelection(h.id!, e)} className="flex-shrink-0 p-1 text-slate-400 hover:text-indigo-400 transition-colors" title={selectedReportIds.has(h.id!) ? 'Deselect' : 'Select'}>
                                {selectedReportIds.has(h.id!) ? <CheckSquare className="w-5 h-5 text-indigo-400" /> : <Square className="w-5 h-5" />}
                              </button>
                              <div className="min-w-0">
                                <h3 className="text-lg font-semibold group-hover:text-indigo-400 dark:group-hover:text-indigo-400 group-hover:text-indigo-600 transition-colors text-white dark:text-white text-gray-900 truncate">{h.player.name}</h3>
                                <p className="text-sm text-slate-400 dark:text-slate-400 text-gray-600">
                                  {h.folderName ? `${h.folderName} • ` : ''}{h.player.country} • Rating: {h.player.currentRating || 'Unrated'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 flex-shrink-0">
                              <span className="text-xs text-slate-400 dark:text-slate-400 text-gray-600">Report: {new Date(h.lastUpdated).toLocaleDateString()}</span>
                              <button
                                onClick={(e) => handleDeleteClick(h.id!, e)}
                                className="p-2 text-slate-400 dark:text-slate-400 text-gray-600 hover:text-red-400 dark:hover:text-red-400 hover:text-red-600 hover:bg-red-500/10 dark:hover:bg-red-500/10 hover:bg-red-50 rounded-lg transition-all"
                                title="Delete dossier"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <ChevronRight className="w-5 h-5 text-slate-600 dark:text-slate-600 text-gray-400" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : folderGroups.length === 0 ? (
                      <p className="text-slate-400 dark:text-slate-400 text-gray-600 italic">No folders yet. Save a batch report to a folder to see them here.</p>
                    ) : (
                      <div className="space-y-4">
                        {folderGroups.map(({ folderId, folderName, reports }) => (
                          <div key={folderId} className="border border-slate-800 dark:border-slate-800 rounded-xl overflow-hidden">
                            <button
                              type="button"
                              onClick={() => toggleFolderExpanded(folderId)}
                              className="w-full flex items-center gap-3 p-4 bg-slate-900/60 dark:bg-slate-900/60 hover:bg-slate-800/60 text-left"
                            >
                              {expandedFolderIds.has(folderId) ? (
                                <ChevronDown className="w-5 h-5 text-amber-400 flex-shrink-0" />
                              ) : (
                                <ChevronRight className="w-5 h-5 text-amber-400 flex-shrink-0" />
                              )}
                              <FolderOpen className="w-5 h-5 text-amber-400 flex-shrink-0" />
                              <span className="font-semibold text-white dark:text-white text-gray-900">{folderName}</span>
                              <span className="text-sm text-slate-400 dark:text-slate-400 text-gray-600">({reports.length} reports)</span>
                            </button>
                            {expandedFolderIds.has(folderId) && (
                              <div className="divide-y divide-slate-800 dark:divide-slate-800">
                                {reports.map((h) => (
                                  <div
                                    key={h.id}
                                    onClick={() => selectFromHistory(h)}
                                    className={`group flex justify-between items-center gap-4 p-4 pl-12 cursor-pointer transition-all hover:bg-slate-800/40 dark:hover:bg-slate-800/40 ${
                                      selectedReportIds.has(h.id!) ? 'bg-indigo-500/10 border-l-4 border-l-indigo-500' : ''
                                    }`}
                                  >
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                      <button onClick={(e) => toggleReportSelection(h.id!, e)} className="flex-shrink-0 p-1 text-slate-400 hover:text-indigo-400 transition-colors" title={selectedReportIds.has(h.id!) ? 'Deselect' : 'Select'}>
                                        {selectedReportIds.has(h.id!) ? <CheckSquare className="w-5 h-5 text-indigo-400" /> : <Square className="w-5 h-5" />}
                                      </button>
                                      <div className="min-w-0">
                                        <h3 className="text-lg font-semibold group-hover:text-indigo-400 dark:group-hover:text-indigo-400 group-hover:text-indigo-600 transition-colors text-white dark:text-white text-gray-900 truncate">{h.player.name}</h3>
                                        <p className="text-sm text-slate-400 dark:text-slate-400 text-gray-600">{h.player.country} • Rating: {h.player.currentRating || 'Unrated'}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-4 flex-shrink-0">
                                      <span className="text-xs text-slate-400 dark:text-slate-400 text-gray-600">Report: {new Date(h.lastUpdated).toLocaleDateString()}</span>
                                      <button
                                        onClick={(e) => handleDeleteClick(h.id!, e)}
                                        className="p-2 text-slate-400 dark:text-slate-400 text-gray-600 hover:text-red-400 dark:hover:text-red-400 hover:text-red-600 hover:bg-red-500/10 dark:hover:bg-red-500/10 hover:bg-red-50 rounded-lg transition-all"
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

        {user ? (
          <Suspense fallback={null}>
            <SupportChat isLoggedIn />
          </Suspense>
        ) : null}
      </div>
    </ThemeProvider>
  );
};

export default App;
