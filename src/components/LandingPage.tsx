import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Shield, Mail, ChevronRight, Search, Database, Target, Cpu, Users, Globe, BarChart3, Brain, CheckCircle, ArrowRight, X, Crown, Loader2, Info } from 'lucide-react';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { useScrollAnimation } from '../hooks/useScrollAnimation';
import {
    OTB_GAMES_DISPLAY,
    FIDE_PLAYERS_DISPLAY,
    computeGamesAnalyzedCount,
    formatGamesAnalyzedShort,
} from '../services/platformStats';
import type { ToastType } from './Toast';
import verifiedProfileDashboardImg from '@/assets/landing/verified_profile_dashboard.png';
import tacticalRecommendationImg from '@/assets/landing/tactical_recommendation.png';
import repertoireChartsImg from '@/assets/landing/repertoire_charts.png';
import repertoireChatImg from '@/assets/landing/repertoire_chat.png';
import playerActivityImg from '@/assets/landing/player_activity.png';
import gameAnalysisBoardImg from '@/assets/landing/game-analysis-board.png';
import timeManagementImg from '@/assets/landing/time_management.png';

interface LandingPageProps {
    onGetStarted: () => void;
    onLogin: (provider: 'google' | { email: string; password?: string; isNewUser?: boolean }) => void;
    user?: SupabaseUser | null;
    onShowPrivacyPolicy?: () => void;
    onShowTermsOfService?: () => void;
    onShowAboutPrepSuite?: () => void;
    onViewFeaturedReport?: (slug: string) => Promise<void>;
    showToast?: (message: string, type: ToastType) => void;
    onGuestSearch?: (name: string, chessComUsername?: string, lichessUsername?: string) => void;
    isGuestAnalyzing?: boolean;
    guestAnalyzingStatus?: string;
}

const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted, onLogin, user, onShowPrivacyPolicy, onShowTermsOfService, onShowAboutPrepSuite, onViewFeaturedReport, showToast, onGuestSearch, isGuestAnalyzing, guestAnalyzingStatus }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [view, setView] = useState<'login' | 'signup' | 'success'>('login');
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    const [featuredList, setFeaturedList] = useState<{ slug: string; name: string; title?: string; federation?: string; rating?: number }[]>([]);
    const [loadingSampleSlug, setLoadingSampleSlug] = useState<string | null>(null);
    const [gamesAnalyzedDisplay, setGamesAnalyzedDisplay] = useState(() =>
        formatGamesAnalyzedShort(computeGamesAnalyzedCount()),
    );

    // Guest search form state
    const [guestName, setGuestName] = useState('');
    const [guestChessCom, setGuestChessCom] = useState('');
    const [guestLichess, setGuestLichess] = useState('');
    const [showGuestAdvanced, setShowGuestAdvanced] = useState(false);

    useEffect(() => {
        import('../services/featuredReports').then(({ getFeaturedReportList }) => {
            getFeaturedReportList().then(setFeaturedList);
        });
    }, []);

    useEffect(() => {
        const tick = () => setGamesAnalyzedDisplay(formatGamesAnalyzedShort(computeGamesAnalyzedCount()));
        const id = setInterval(tick, 60_000);
        return () => clearInterval(id);
    }, []);

    const featuredRef = useScrollAnimation();
    const featuresRef = useScrollAnimation();
    const howItWorksRef = useScrollAnimation();
    const benefitsRef = useScrollAnimation();
    const loginRef = useScrollAnimation();

    const previewImages = [
        { src: verifiedProfileDashboardImg, caption: 'Full dossier: openings, recent games, and live progress while Stockfish runs.' },
        { src: tacticalRecommendationImg, caption: 'Get a verified tournament profile with strategic insights.' },
        { src: repertoireChartsImg, caption: 'Look at every opening—win rates, draws, and losses at a glance.' },
        { src: timeManagementImg, caption: 'Analyze how they use their time and where they mess up.' },
        { src: repertoireChatImg, caption: 'Chat with AI to explore openings and player repertoires.' },
        { src: playerActivityImg, caption: 'Player Activity: Track rating history across classical, rapid, and blitz over time.' },
        { src: gameAnalysisBoardImg, caption: 'Explore every game on the board with full move notation.' },
    ] as const;

    const handleEmailPasswordSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) return;
        onLogin({ email, password, isNewUser: view === 'signup' });
        if (view === 'signup') setView('success');
    };

    const handleGuestSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!guestName.trim() || !onGuestSearch) return;
        onGuestSearch(
            guestName.trim(),
            guestChessCom.trim() || undefined,
            guestLichess.trim() || undefined,
        );
    };

    useEffect(() => {
        if (lightboxIndex !== null) {
            const prev = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            return () => { document.body.style.overflow = prev; };
        }
    }, [lightboxIndex]);

    return (
        <>
            <nav aria-label="Primary" className="fixed top-0 w-full z-50 backdrop-blur-xl bg-slate-950/50 border-b border-slate-800/50 px-6 py-4">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div className="flex items-center select-none py-1">
                        <img src="/NewLogo.jpg" alt="Prepsuite.ai" width={565} height={144} className="h-10 w-auto max-h-10 object-contain object-left flex-shrink-0 select-none" draggable={false} />
                    </div>
                    <div className="flex items-center gap-3">
                        {user ? (
                            <button
                                onClick={onGetStarted}
                                className="bg-white text-slate-950 px-5 py-2.5 rounded-full text-sm font-bold hover:bg-slate-200 transition-all shadow-xl shadow-white/10"
                            >
                                Go to Dashboard
                            </button>
                        ) : (
                            <>
                                <button
                                    onClick={() => {
                                        const el = document.getElementById('access');
                                        el?.scrollIntoView({ behavior: 'smooth' });
                                    }}
                                    className="text-slate-300 hover:text-white text-sm font-medium transition-colors hidden sm:block"
                                >
                                    Sign In
                                </button>
                                <button
                                    onClick={() => {
                                        const el = document.getElementById('hero-search');
                                        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                        setTimeout(() => document.getElementById('guest-name-input')?.focus(), 400);
                                    }}
                                    className="bg-white text-slate-950 px-5 py-2.5 rounded-full text-sm font-bold hover:bg-slate-200 transition-all shadow-xl shadow-white/10"
                                >
                                    Try Free
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </nav>

            <main id="landing-main" className="min-h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500/30 overflow-x-hidden">
            {/* Hero Section — "Intelligence Dossier" branding */}
            <section className="relative pt-32 pb-16 px-6 overflow-hidden bg-slate-950">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(99,102,241,0.08)_0%,transparent_50%)] pointer-events-none" />
                <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-indigo-600/10 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-blue-600/5 blur-[100px] rounded-full translate-y-1/2 -translate-x-1/2" />

                <div className="max-w-7xl mx-auto text-center relative z-10">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/50 border border-indigo-500/20 text-indigo-400 text-xs font-bold uppercase tracking-widest mb-8 animate-in fade-in slide-in-from-top-4 duration-1000">
                        <Target className="w-3 h-3" /> AI-Powered Chess Intelligence
                    </div>
                    <h1 className="text-5xl md:text-7xl font-sans font-bold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-slate-500 max-w-5xl mx-auto leading-[1.1] animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
                        Your Opponent&rsquo;s Secrets, Uncovered.
                    </h1>
                    <p className="text-xl text-slate-300 max-w-2xl mx-auto mb-10 leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300">
                        The only tool that links OTB tournament data with online accounts using AI. Know their openings, their weaknesses, their patterns.
                    </p>

                    {/* Hero Search Bar */}
                    <div id="hero-search" className="max-w-2xl mx-auto mb-12 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-400">
                        <form onSubmit={handleGuestSearchSubmit} className="relative">
                            <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-700/80 rounded-2xl p-2 shadow-2xl shadow-indigo-500/5 focus-within:border-indigo-500/50 transition-colors">
                                <div className="flex-1 flex items-center gap-2 pl-4">
                                    <Search className="w-5 h-5 text-slate-500 shrink-0" />
                                    <input
                                        id="guest-name-input"
                                        type="text"
                                        placeholder="Enter a player name..."
                                        value={guestName}
                                        onChange={(e) => setGuestName(e.target.value)}
                                        className="w-full bg-transparent text-white placeholder:text-slate-600 focus:outline-none text-lg font-medium py-3"
                                        disabled={isGuestAnalyzing}
                                        required
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={!guestName.trim() || isGuestAnalyzing || !onGuestSearch}
                                    className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white font-bold rounded-xl transition-all flex items-center gap-2 shrink-0"
                                >
                                    {isGuestAnalyzing ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span className="hidden sm:inline">Analyzing...</span>
                                        </>
                                    ) : (
                                        <>
                                            Scout
                                            <ArrowRight className="w-4 h-4" />
                                        </>
                                    )}
                                </button>
                            </div>

                            {/* Optional username fields */}
                            <button
                                type="button"
                                onClick={() => setShowGuestAdvanced(!showGuestAdvanced)}
                                className="mt-3 text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1 mx-auto"
                            >
                                {showGuestAdvanced ? 'Hide' : 'Have a username?'} {showGuestAdvanced ? '−' : '+'}
                            </button>

                            {showGuestAdvanced && (
                                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <input
                                        type="text"
                                        placeholder="Chess.com username (optional)"
                                        value={guestChessCom}
                                        onChange={(e) => setGuestChessCom(e.target.value)}
                                        className="bg-slate-900/60 border border-slate-700/60 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 text-sm"
                                        disabled={isGuestAnalyzing}
                                    />
                                    <input
                                        type="text"
                                        placeholder="Lichess username (optional)"
                                        value={guestLichess}
                                        onChange={(e) => setGuestLichess(e.target.value)}
                                        className="bg-slate-900/60 border border-slate-700/60 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 text-sm"
                                        disabled={isGuestAnalyzing}
                                    />
                                </div>
                            )}

                            {isGuestAnalyzing && guestAnalyzingStatus && (
                                <div className="mt-4 flex items-center gap-2 justify-center text-sm text-indigo-300">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    {guestAnalyzingStatus}
                                </div>
                            )}
                        </form>
                        {!user && (
                            <p className="mt-3 text-xs text-slate-600">
                                Free trial — up to 500 games analyzed. <button type="button" onClick={() => document.getElementById('access')?.scrollIntoView({ behavior: 'smooth' })} className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">Sign up</button> for 2,500 games, batch reports, AI chat, and more.
                            </p>
                        )}
                    </div>

                    {/* Stat cards */}
                    <div className="max-w-4xl mx-auto mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                        <div className="landing-stat-card rounded-2xl border border-slate-800/80 bg-slate-900/40 px-5 py-4 text-center shadow-lg shadow-black/10">
                            <div className="landing-stat-icon flex justify-center mb-2 text-indigo-400">
                                <BarChart3 className="w-5 h-5" aria-hidden />
                            </div>
                            <div className="landing-stat-value text-2xl md:text-3xl font-bold text-white tabular-nums">
                                {gamesAnalyzedDisplay}
                            </div>
                            <div className="landing-stat-label text-xs font-semibold uppercase tracking-wider text-slate-400 mt-1">
                                Games analyzed
                            </div>
                        </div>
                        <div className="landing-stat-card rounded-2xl border border-slate-800/80 bg-slate-900/40 px-5 py-4 text-center shadow-lg shadow-black/10">
                            <div className="landing-stat-icon flex justify-center mb-2 text-emerald-400">
                                <Database className="w-5 h-5" aria-hidden />
                            </div>
                            <div className="landing-stat-value text-2xl md:text-3xl font-bold text-white tabular-nums">
                                {OTB_GAMES_DISPLAY}
                            </div>
                            <div className="landing-stat-label text-xs font-semibold uppercase tracking-wider text-slate-400 mt-1">
                                OTB games in database
                            </div>
                        </div>
                        <div className="landing-stat-card rounded-2xl border border-slate-800/80 bg-slate-900/40 px-5 py-4 text-center shadow-lg shadow-black/10">
                            <div className="landing-stat-icon flex justify-center mb-2 text-amber-400">
                                <Users className="w-5 h-5" aria-hidden />
                            </div>
                            <div className="landing-stat-value text-2xl md:text-3xl font-bold text-white tabular-nums">
                                {FIDE_PLAYERS_DISPLAY}
                            </div>
                            <div className="landing-stat-label text-xs font-semibold uppercase tracking-wider text-slate-400 mt-1">
                                FIDE-registered players
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Featured sample reports */}
            <section
                ref={featuredRef.ref}
                className={`py-24 px-6 relative overflow-hidden ${featuredRef.isVisible ? 'animate-fade-in-up' : ''}`}
                style={featuredRef.isVisible ? {} : { opacity: 0 }}
            >
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_0%,rgba(99,102,241,0.08),transparent_50%)] pointer-events-none" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_100%,rgba(30,41,59,0.6),transparent)] pointer-events-none" />
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
                <div className="max-w-7xl mx-auto relative">
                    <div className="flex flex-col items-center mb-14">
                        <Crown className="w-8 h-8 text-amber-400 mb-4" />
                        <h2 className="text-4xl md:text-5xl font-bold tracking-wide bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400 text-center">
                            Featured Reports
                        </h2>
                        <p className="text-slate-400 text-base mt-3 text-center max-w-xl">
                            Explore sample scouting reports of top players. No sign-in required.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 lg:gap-6 max-w-6xl mx-auto">
                        {featuredList.map((item) => {
                            const handleClick = async () => {
                                if (!onViewFeaturedReport) return;
                                setLoadingSampleSlug(item.slug);
                                try {
                                    const { getFeaturedReport } = await import('../services/featuredReports');
                                    const report = await getFeaturedReport(item.slug);
                                    if (report) await onViewFeaturedReport(item.slug);
                                    else showToast?.('Sample report is not available yet for this player.', 'error');
                                } finally {
                                    setLoadingSampleSlug(null);
                                }
                            };
                            return (
                                <div
                                    key={item.slug}
                                    role="button"
                                    tabIndex={0}
                                    onClick={handleClick}
                                    onKeyDown={(e) => e.key === 'Enter' && handleClick()}
                                    className="group relative w-full bg-slate-800/80 border border-slate-700/60 rounded-2xl p-5 cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-500/10 hover:border-indigo-500/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 flex flex-col min-h-[120px]"
                                    style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.05) inset, 0 0 20px rgba(251,191,36,0.08)' }}
                                >
                                    <div className="flex flex-col gap-3 flex-1">
                                        <div className="flex-1 min-w-0">
                                            <div className="text-white font-bold text-lg leading-tight">{item.name}</div>
                                            <div className="flex flex-wrap items-center gap-2 mt-1">
                                                {item.title && (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-400/25 text-amber-300 border border-amber-400/40 shadow-[0_0_12px_rgba(251,191,36,0.2)]">
                                                        {item.title}
                                                    </span>
                                                )}
                                                {item.rating != null && (
                                                    <span className="text-slate-300 text-sm font-medium">{item.rating}</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); handleClick(); }}
                                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-sm font-semibold transition-all duration-200 hover:shadow-lg hover:shadow-indigo-500/25 disabled:opacity-50"
                                                disabled={!onViewFeaturedReport || loadingSampleSlug !== null}
                                            >
                                                {loadingSampleSlug === item.slug ? 'Loading...' : (
                                                    <>View <ArrowRight className="w-4 h-4" /></>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Bento Grid Features Section */}
            <section
                ref={featuresRef.ref}
                className={`py-16 px-6 bg-slate-950 relative ${featuresRef.isVisible ? 'animate-fade-in-up' : ''}`}
                style={featuresRef.isVisible ? {} : { opacity: 0 }}
            >
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400">
                            What Makes PrepSuite Unique
                        </h2>
                        <p className="text-slate-400 text-base max-w-2xl mx-auto">
                            Six capabilities working together to give you a complete intelligence dossier on any chess player.
                        </p>
                    </div>

                    {/* Bento Grid: 3 cols, asymmetric spans */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5 max-w-6xl mx-auto">
                        {/* Identity Resolution — tall card, spans 2 rows */}
                        <div
                            className={`lg:row-span-2 bg-gradient-to-br from-indigo-950/80 to-slate-900/60 border border-indigo-500/20 rounded-2xl p-8 hover:border-indigo-500/40 transition-all group shadow-[0_0_0_1px_rgba(255,255,255,0.04)] relative overflow-hidden ${featuresRef.isVisible ? 'animate-fade-in-up' : ''}`}
                            style={featuresRef.isVisible ? { animationDelay: '0.1s', animationFillMode: 'both' } : {}}
                        >
                            <div className="absolute top-4 right-4 opacity-[0.06] pointer-events-none">
                                <Shield className="w-32 h-32" />
                            </div>
                            <div className="w-12 h-12 bg-indigo-600/20 rounded-xl flex items-center justify-center text-indigo-400 mb-5 group-hover:scale-110 transition-transform">
                                <Users className="w-6 h-6" />
                            </div>
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold uppercase tracking-wider mb-4 border border-emerald-500/20">
                                <CheckCircle className="w-3 h-3" /> Identity Verified
                            </div>
                            <h3 className="text-2xl font-bold mb-3 text-white">AI-Powered Identity Resolution</h3>
                            <p className="text-slate-400 leading-relaxed mb-6">
                                Enter a name. Our AI finds their Chess.com, Lichess, FIDE, and USCF accounts automatically — linking OTB tournament identities with online profiles.
                            </p>
                            <div className="bg-slate-950/50 rounded-xl border border-slate-800/60 p-4 space-y-2">
                                <div className="flex items-center gap-2 text-sm">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                    <span className="text-slate-300">Chess.com:</span>
                                    <span className="text-emerald-400 font-mono text-xs">found</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                    <span className="w-2 h-2 rounded-full bg-indigo-400" />
                                    <span className="text-slate-300">Lichess:</span>
                                    <span className="text-indigo-400 font-mono text-xs">found</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                                    <span className="text-slate-300">FIDE Rating:</span>
                                    <span className="text-amber-300 font-mono text-xs">2145</span>
                                </div>
                            </div>
                        </div>

                        {/* Opening Repertoire — standard card with mini chart */}
                        <div
                            className={`bg-slate-900/50 border border-slate-700/80 rounded-2xl p-7 hover:border-indigo-500/40 transition-all group shadow-[0_0_0_1px_rgba(255,255,255,0.04)] ${featuresRef.isVisible ? 'animate-fade-in-up' : ''}`}
                            style={featuresRef.isVisible ? { animationDelay: '0.2s', animationFillMode: 'both' } : {}}
                        >
                            <div className="w-12 h-12 bg-purple-600/15 rounded-xl flex items-center justify-center text-purple-400 mb-5 group-hover:scale-110 transition-transform">
                                <BarChart3 className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold mb-2 text-white">Opening Repertoire</h3>
                            <p className="text-slate-400 text-sm leading-relaxed mb-4">
                                Visual charts: win/draw/loss rates for every opening. See where they're weakest.
                            </p>
                            {/* Mini stacked bar preview */}
                            <div className="space-y-2">
                                {[
                                    { name: 'Sicilian', w: 55, d: 20, l: 25 },
                                    { name: "King's Indian", w: 40, d: 30, l: 30 },
                                    { name: 'Caro-Kann', w: 62, d: 18, l: 20 },
                                ].map((o) => (
                                    <div key={o.name} className="flex items-center gap-2">
                                        <span className="text-[11px] text-slate-500 w-24 truncate">{o.name}</span>
                                        <div className="flex-1 h-2.5 rounded-full overflow-hidden bg-slate-800 flex">
                                            <div style={{ width: `${o.w}%` }} className="bg-emerald-500 h-full" />
                                            <div style={{ width: `${o.d}%` }} className="bg-slate-500 h-full" />
                                            <div style={{ width: `${o.l}%` }} className="bg-rose-500 h-full" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Stockfish Engine */}
                        <div
                            className={`bg-slate-900/50 border border-slate-700/80 rounded-2xl p-7 hover:border-indigo-500/40 transition-all group shadow-[0_0_0_1px_rgba(255,255,255,0.04)] ${featuresRef.isVisible ? 'animate-fade-in-up' : ''}`}
                            style={featuresRef.isVisible ? { animationDelay: '0.3s', animationFillMode: 'both' } : {}}
                        >
                            <div className="w-12 h-12 bg-blue-600/15 rounded-xl flex items-center justify-center text-blue-400 mb-5 group-hover:scale-110 transition-transform">
                                <Cpu className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold mb-2 text-white">Stockfish Engine</h3>
                            <p className="text-slate-400 text-sm leading-relaxed">
                                Every game analyzed at depth 7+. Identifies critical mistakes, endgame accuracy, and tactical patterns human analysis misses.
                            </p>
                        </div>

                        {/* Multi-Source Games — wide card spanning 2 cols */}
                        <div
                            className={`md:col-span-2 bg-gradient-to-r from-slate-900/50 to-emerald-950/30 border border-emerald-500/15 rounded-2xl p-7 hover:border-emerald-500/30 transition-all group shadow-[0_0_0_1px_rgba(255,255,255,0.04)] ${featuresRef.isVisible ? 'animate-fade-in-up' : ''}`}
                            style={featuresRef.isVisible ? { animationDelay: '0.4s', animationFillMode: 'both' } : {}}
                        >
                            <div className="flex flex-col sm:flex-row sm:items-start gap-5">
                                <div className="w-12 h-12 bg-emerald-600/15 rounded-xl flex items-center justify-center text-emerald-400 shrink-0 group-hover:scale-110 transition-transform">
                                    <Database className="w-6 h-6" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-xl font-bold mb-2 text-white">Multi-Source Game Aggregation</h3>
                                    <p className="text-slate-400 text-sm leading-relaxed mb-4">
                                        Analyzes up to 2,500 games from Chess.com, Lichess, and OTB tournament databases.
                                    </p>
                                    <div className="flex flex-wrap gap-3">
                                        {['Chess.com', 'Lichess', 'OTB / FIDE', 'USCF'].map((src) => (
                                            <span key={src} className="px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50 text-xs font-semibold text-slate-300">
                                                {src}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* AI Reports */}
                        <div
                            className={`bg-slate-900/50 border border-slate-700/80 rounded-2xl p-7 hover:border-indigo-500/40 transition-all group shadow-[0_0_0_1px_rgba(255,255,255,0.04)] ${featuresRef.isVisible ? 'animate-fade-in-up' : ''}`}
                            style={featuresRef.isVisible ? { animationDelay: '0.5s', animationFillMode: 'both' } : {}}
                        >
                            <div className="w-12 h-12 bg-amber-600/15 rounded-xl flex items-center justify-center text-amber-400 mb-5 group-hover:scale-110 transition-transform">
                                <Brain className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold mb-2 text-white">AI Strategic Reports</h3>
                            <p className="text-slate-400 text-sm leading-relaxed">
                                Google Gemini generates scouting reports with strengths, weaknesses, and preparation lines to exploit their patterns.
                            </p>
                        </div>

                        {/* Tournament Integration — wide card with mock data */}
                        <div
                            className={`md:col-span-2 bg-gradient-to-r from-slate-900/50 to-red-950/20 border border-red-500/15 rounded-2xl p-7 hover:border-red-500/30 transition-all group shadow-[0_0_0_1px_rgba(255,255,255,0.04)] ${featuresRef.isVisible ? 'animate-fade-in-up' : ''}`}
                            style={featuresRef.isVisible ? { animationDelay: '0.6s', animationFillMode: 'both' } : {}}
                        >
                            <div className="flex flex-col sm:flex-row sm:items-start gap-5">
                                <div className="w-12 h-12 bg-red-600/15 rounded-xl flex items-center justify-center text-red-400 shrink-0 group-hover:scale-110 transition-transform">
                                    <Globe className="w-6 h-6" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-xl font-bold mb-2 text-white">FIDE & USCF Tournament Integration</h3>
                                    <p className="text-slate-400 text-sm leading-relaxed mb-4">
                                        Works with both FIDE (international) and USCF (US) tournament data. Rating history, OTB game records, and verified tournament identities — all in one place.
                                    </p>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-3 text-center">
                                            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">FIDE Classical</div>
                                            <div className="text-lg font-bold text-amber-400 tabular-nums">2145</div>
                                        </div>
                                        <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-3 text-center">
                                            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">USCF Regular</div>
                                            <div className="text-lg font-bold text-emerald-400 tabular-nums">2087</div>
                                        </div>
                                        <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-3 text-center">
                                            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">OTB Games</div>
                                            <div className="text-lg font-bold text-indigo-400 tabular-nums">342</div>
                                        </div>
                                        <div className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-3 text-center">
                                            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Tournaments</div>
                                            <div className="text-lg font-bold text-red-400 tabular-nums">47</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* How It Works Section */}
            <section
                ref={howItWorksRef.ref}
                className={`py-[4.5rem] px-6 bg-slate-900/30 relative overflow-hidden ${howItWorksRef.isVisible ? 'animate-fade-in-up' : ''}`}
                style={howItWorksRef.isVisible ? {} : { opacity: 0 }}
            >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[1000px] bg-indigo-600/5 blur-[150px] rounded-full" />
                <div className="max-w-7xl mx-auto relative z-10">
                    <div className="text-center mb-[4.5rem]">
                        <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400">
                            How It Works
                        </h2>
                    </div>
                    <div className="overflow-x-auto overflow-y-hidden pb-2 -mx-6 px-6 snap-x snap-mandatory">
                        <div className="flex min-w-max" style={{ gap: '1.8rem' }}>
                            {previewImages.map((item, i) => (
                                <figure key={i} className="flex-shrink-0 w-[min(90vw,640px)] snap-center flex flex-col">
                                    <figcaption className="mb-3 text-slate-400 text-base text-center whitespace-nowrap">
                                        {item.caption}
                                    </figcaption>
                                    <button
                                        type="button"
                                        onClick={() => setLightboxIndex(i)}
                                        className="w-full aspect-[16/10] rounded-xl overflow-hidden border border-slate-700/80 shadow-xl flex items-center justify-center bg-slate-900/30 cursor-pointer hover:ring-2 hover:ring-indigo-500/50 transition-shadow focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <img src={item.src} alt={item.caption} className="w-full h-full object-contain pointer-events-none" loading="lazy" />
                                    </button>
                                </figure>
                            ))}
                        </div>
                    </div>

                    {lightboxIndex !== null && createPortal(
                        <div
                            className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm overflow-y-auto overflow-x-hidden"
                            onClick={() => setLightboxIndex(null)}
                            role="dialog"
                            aria-modal="true"
                            aria-label="View full size image"
                        >
                            <button type="button" onClick={() => setLightboxIndex(null)} className="fixed top-4 right-4 p-2 rounded-full bg-slate-800/80 text-white hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 z-[10000]" aria-label="Close">
                                <X className="w-6 h-6" />
                            </button>
                            <div className="min-h-screen flex flex-col items-center justify-center py-20 px-4" onClick={(e) => e.stopPropagation()}>
                                <img src={previewImages[lightboxIndex].src} alt={previewImages[lightboxIndex].caption} className="max-w-[95vw] w-auto max-h-none object-contain rounded-lg shadow-2xl" style={{ height: 'auto' }} />
                                <p className="mt-6 text-slate-300 text-sm text-center max-w-xl">{previewImages[lightboxIndex].caption}</p>
                            </div>
                        </div>,
                        document.body
                    )}
                </div>
            </section>

            {/* Key Benefits Section */}
            <section
                ref={benefitsRef.ref}
                className={`py-20 px-6 bg-slate-950 transition-opacity duration-1000 ease-out ${benefitsRef.isVisible ? 'opacity-100' : 'opacity-0'}`}
            >
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400">
                            Why Tournament Players Choose PrepSuite
                        </h2>
                    </div>
                    <div className="grid md:grid-cols-4 gap-8 max-w-6xl mx-auto">
                        {[
                            "Automatically links tournament identities to online accounts",
                            "Analyzes games from Chess.com, Lichess, and OTB databases",
                            "Stockfish engine analysis identifies tactical weaknesses",
                            "Visual charts show opening performance at a glance",
                            "AI generates actionable preparation recommendations",
                            "Save and manage multiple scouting reports",
                            "Works with both FIDE and USCF tournament data",
                            "Choose your mix of online and OTB games to analyze"
                        ].map((benefit, i) => {
                            const delays = ['0.05s', '0.1s', '0.15s', '0.2s', '0.25s', '0.3s', '0.35s', '0.4s'];
                            return (
                                <div
                                    key={i}
                                    className={`flex items-start gap-4 p-6 bg-slate-900/50 border border-slate-700/80 rounded-xl shadow-[0_0_0_1px_rgba(255,255,255,0.04)] ${benefitsRef.isVisible ? 'animate-fade-in-up' : ''}`}
                                    style={benefitsRef.isVisible ? { animationDelay: delays[i] || '0s', animationFillMode: 'both' } : {}}
                                >
                                    <CheckCircle className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                                    <p className="text-slate-200 text-base leading-relaxed">{benefit}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Login/Signup Section */}
            {!user && (
            <section
                id="access"
                ref={loginRef.ref}
                className={`py-16 md:py-24 px-6 bg-slate-950 ${loginRef.isVisible ? 'animate-fade-in-up' : ''}`}
                style={loginRef.isVisible ? {} : { opacity: 0 }}
            >
                <div className="max-w-7xl mx-auto">
                    <div className="grid lg:grid-cols-2 gap-12 items-start">
                        <div className="space-y-8">
                            <div>
                                <div className="w-16 h-16 bg-indigo-600/20 rounded-2xl flex items-center justify-center mb-6 text-indigo-500 shadow-inner inline-flex">
                                    <Shield className="w-8 h-8" />
                                </div>
                                <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400">
                                    {view === 'success' ? 'Verification Required' : (view === 'login' ? 'Welcome Back' : 'Join PrepSuite')}
                                </h2>
                                <p className="text-slate-300 text-lg">
                                    {view === 'success'
                                        ? 'We\'ve sent a verification link to your inbox to authorize this device.'
                                        : 'Unlock the full platform: 2,500 games, batch reports, AI chat, and saved history.'}
                                </p>
                            </div>
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 text-slate-300">
                                    <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                                    <span>Free to get started</span>
                                </div>
                                <div className="flex items-center gap-3 text-slate-300">
                                    <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                                    <span>No credit card required</span>
                                </div>
                                <div className="flex items-center gap-3 text-slate-300">
                                    <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                                    <span>Instant access to all features</span>
                                </div>
                            </div>
                        </div>

                        <div className="bg-slate-900/40 border border-white/10 rounded-[40px] p-8 md:p-12 relative overflow-hidden backdrop-blur-3xl shadow-3xl">
                            <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
                                <Shield className="w-64 h-64 text-indigo-500" />
                            </div>

                            {view === 'success' ? (
                                <div className="max-w-md mx-auto p-10 bg-indigo-600/10 border border-indigo-400/30 rounded-[32px] animate-in zoom-in-95 duration-500 text-center relative overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent pointer-events-none" />
                                    <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                                        <div className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse" />
                                    </div>
                                    <h4 className="text-2xl font-bold mb-3 text-white">Check Your Inbox</h4>
                                    <p className="text-indigo-200/80 text-sm leading-relaxed mb-8">
                                        A verification link has been sent to <span className="text-white font-bold underline decoration-indigo-500/50">{email}</span>. Click it to authorize your session.
                                    </p>
                                    <button onClick={() => setView('login')} className="text-xs uppercase tracking-widest font-bold text-indigo-400 hover:text-white transition-colors flex items-center gap-2 mx-auto group">
                                        <ChevronRight className="w-4 h-4 rotate-180 group-hover:-translate-x-1 transition-transform" />
                                        Return to Login
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-6 relative z-10">
                                    <form onSubmit={handleEmailPasswordSubmit} className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 ml-1">Email Address</label>
                                            <div className="relative group">
                                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 group-focus-within:text-indigo-400 transition-colors" />
                                                <input type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full pl-12 pr-4 py-4 bg-slate-950/50 border border-slate-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-white placeholder:text-slate-700 transition-all font-medium" required />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] uppercase tracking-widest font-bold text-slate-400 ml-1">Password</label>
                                            <div className="relative group">
                                                <Shield className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 group-focus-within:text-indigo-400 transition-colors" />
                                                <input type="password" placeholder="••••••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full pl-12 pr-4 py-4 bg-slate-950/50 border border-slate-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-white placeholder:text-slate-700 transition-all font-medium" required />
                                            </div>
                                        </div>
                                        <button type="submit" className="w-full bg-indigo-600 text-white px-10 py-4 rounded-2xl font-bold text-lg hover:bg-indigo-500 active:scale-[0.98] transition-all shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-2 group">
                                            {view === 'login' ? 'Sign In' : 'Create Account'}
                                            <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                        </button>
                                        <div className="text-center">
                                            <button type="button" onClick={() => setView(view === 'login' ? 'signup' : 'login')} className="text-sm text-slate-400 hover:text-indigo-400 transition-colors">
                                                {view === 'login' ? 'New here? Initialize account' : 'Already have an account? Log in here'}
                                            </button>
                                        </div>
                                    </form>

                                    <div className="relative py-4">
                                        <div className="absolute inset-0 flex items-center">
                                            <div className="w-full border-t border-slate-800" />
                                        </div>
                                        <div className="relative flex justify-center text-[10px] uppercase tracking-[0.2em] text-slate-400">
                                            <span className="bg-slate-900/40 px-4">Social Login</span>
                                        </div>
                                    </div>

                                    <button onClick={() => onLogin('google')} className="w-full bg-slate-950 text-white px-10 py-4 rounded-2xl font-bold text-lg hover:bg-slate-900 border border-slate-800 shadow-xl flex items-center justify-center gap-3 transition-all hover:border-indigo-500/30">
                                        <img src="https://www.google.com/favicon.ico" alt="Google" width={20} height={20} className="w-5 h-5" />
                                        Continue with Google
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </section>
            )}

            {/* AI Disclaimer — collapsible, hidden but findable */}
            <section className="px-6 py-6 bg-slate-950">
                <div className="max-w-7xl mx-auto">
                    <details className="group">
                        <summary className="flex items-center gap-2 cursor-pointer text-slate-600 hover:text-slate-400 transition-colors text-sm select-none list-none [&::-webkit-details-marker]:hidden">
                            <Info className="w-4 h-4 shrink-0" />
                            <span>About AI Analysis</span>
                            <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
                        </summary>
                        <div className="mt-3 pl-6 text-xs text-slate-600 leading-relaxed max-w-3xl border-l border-slate-800 ml-2">
                            <p>
                                PrepSuite uses AI (Google Gemini) to generate scouting reports and resolve player identities across platforms.
                                AI analysis is limited and can make mistakes, including occasionally failing to find players or generating inaccurate assessments.
                                Results should be used as a preparation aid, not as definitive analysis. Always verify critical information independently.
                            </p>
                        </div>
                    </details>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-slate-950 border-t border-slate-800 py-8 px-6">
                <div className="max-w-7xl mx-auto">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="text-slate-300 text-sm">
                            &copy; {new Date().getFullYear()} SoundSideDesign. All rights reserved.
                        </div>
                        <div className="flex items-center gap-6">
                            <a href="/about" className="text-slate-200 hover:text-white text-sm font-medium transition-colors underline-offset-4 hover:underline" onClick={(e) => { e.preventDefault(); onShowAboutPrepSuite?.(); }}>
                                Why PrepSuite
                            </a>
                            <a href="/privacy-policy" className="text-slate-200 hover:text-white text-sm font-medium transition-colors underline-offset-4 hover:underline" onClick={(e) => { e.preventDefault(); onShowPrivacyPolicy?.(); }}>
                                Privacy Policy
                            </a>
                            <a href="/terms-of-service" className="text-slate-200 hover:text-white text-sm font-medium transition-colors underline-offset-4 hover:underline" onClick={(e) => { e.preventDefault(); onShowTermsOfService?.(); }}>
                                Terms of Service
                            </a>
                        </div>
                    </div>
                </div>
            </footer>
            </main>
        </>
    );
};

export default LandingPage;
