import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Shield, Mail, ChevronRight, Search, Database, Target, Zap, TrendingUp, Cpu, Users, Globe, BarChart3, Brain, CheckCircle, ArrowRight, X, Crown } from 'lucide-react';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { useScrollAnimation } from '../hooks/useScrollAnimation';
import generationImg from '@/assets/landing/generation.png';
import tacticalRecommendationImg from '@/assets/landing/tactical_recommendation.png';
import repertoireChartsImg from '@/assets/landing/repertoire_charts.png';
import repertoireChatImg from '@/assets/landing/repertoire_chat.png';
import gameAnalysisBoardImg from '@/assets/landing/game-analysis-board.png';

interface LandingPageProps {
    onGetStarted: () => void;
    onLogin: (provider: 'google' | { email: string; password?: string; isNewUser?: boolean }) => void;
    user?: SupabaseUser | null;
    onShowPrivacyPolicy?: () => void;
    onShowTermsOfService?: () => void;
    onViewFeaturedReport?: (slug: string) => Promise<void>;
}

const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted, onLogin, user, onShowPrivacyPolicy, onShowTermsOfService, onViewFeaturedReport }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [view, setView] = useState<'login' | 'signup' | 'success'>('login');
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    const [featuredList, setFeaturedList] = useState<{ slug: string; name: string; title?: string; federation?: string; rating?: number }[]>([]);
    const [loadingFeatured, setLoadingFeatured] = useState<string | null>(null);

    useEffect(() => {
        import('../services/featuredReports').then(({ getFeaturedReportList }) => {
            getFeaturedReportList().then(setFeaturedList);
        });
    }, []);

    const featuredRef = useScrollAnimation();
    const featuresRef = useScrollAnimation();
    const howItWorksRef = useScrollAnimation();
    const benefitsRef = useScrollAnimation();
    const loginRef = useScrollAnimation();

    const previewImages = [
        { src: generationImg, caption: 'Search any opponent and watch the analysis run.' },
        { src: tacticalRecommendationImg, caption: 'Get a verified tournament profile with strategic insights.' },
        { src: repertoireChartsImg, caption: 'Look at every opening—win rates, draws, and losses at a glance.' },
        { src: repertoireChatImg, caption: 'Chat with AI to explore openings and player repertoires.' },
        { src: gameAnalysisBoardImg, caption: 'Explore every game on the board with full move notation.' },
    ] as const;

    const handleEmailPasswordSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) return;

        onLogin({
            email,
            password,
            isNewUser: view === 'signup'
        });

        if (view === 'signup') {
            setView('success');
        }
    };

    useEffect(() => {
        if (lightboxIndex !== null) {
            const prev = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            return () => { document.body.style.overflow = prev; };
        }
    }, [lightboxIndex]);

    return (
        <div className="min-h-screen bg-slate-950 dark:bg-slate-950 bg-white text-slate-100 dark:text-slate-100 text-slate-900 selection:bg-indigo-500/30 overflow-x-hidden">
            {/* Navigation */}
            <nav className="fixed top-0 w-full z-50 backdrop-blur-xl bg-slate-950/50 dark:bg-slate-950/50 bg-white/90 border-b border-slate-800/50 dark:border-slate-800/50 border-gray-200 px-6 py-4">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <div className="bg-indigo-600 p-1.5 rounded-lg shadow-lg shadow-indigo-900/40">
                            <Shield className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 dark:from-white dark:to-slate-400 from-gray-900 to-gray-600">
                            PrepSuite
                        </span>
                    </div>
                    <div className="flex items-center gap-4">
                        {user ? (
                            <button
                                onClick={onGetStarted}
                                className="bg-white dark:bg-white bg-indigo-600 text-slate-950 dark:text-slate-950 text-white px-5 py-2.5 rounded-full text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-200 hover:bg-indigo-700 transition-all shadow-xl shadow-white/10 dark:shadow-white/10 shadow-indigo-500/20"
                            >
                                Go to Dashboard
                            </button>
                        ) : (
                            <button
                                onClick={onGetStarted}
                                className="bg-white dark:bg-white bg-indigo-600 text-slate-950 dark:text-slate-950 text-white px-5 py-2.5 rounded-full text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-200 hover:bg-indigo-700 transition-all shadow-xl shadow-white/10 dark:shadow-white/10 shadow-indigo-500/20"
                            >
                                Get Started
                            </button>
                        )}
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative pt-32 pb-12 px-6 overflow-hidden bg-slate-950 dark:bg-slate-950 bg-white">
                <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-indigo-600/10 dark:bg-indigo-600/10 bg-indigo-100/50 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-blue-600/5 dark:bg-blue-600/5 bg-blue-100/30 blur-[100px] rounded-full translate-y-1/2 -translate-x-1/2" />
                {/* Faded report screenshot for depth */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <img
                        src={repertoireChartsImg}
                        alt=""
                        className="w-full max-w-4xl h-auto opacity-[0.06] object-contain scale-90"
                        aria-hidden
                    />
                </div>

                <div className="max-w-7xl mx-auto text-center relative z-10">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/50 dark:bg-slate-900/50 bg-indigo-50 border border-indigo-500/20 dark:border-indigo-500/20 border-indigo-200 text-indigo-400 dark:text-indigo-400 text-indigo-600 text-xs font-bold uppercase tracking-widest mb-8 animate-in fade-in slide-in-from-top-4 duration-1000">
                        <Target className="w-3 h-3" /> Advanced Chess Preparation
                    </div>
                    <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-slate-500 dark:from-white dark:via-white dark:to-slate-500 from-gray-900 via-gray-900 to-gray-700 max-w-4xl mx-auto leading-[1.1] animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
                        Master Your Opponent Analysis
                    </h1>
                    <p className="text-xl text-slate-400 dark:text-slate-400 text-gray-600 max-w-2xl mx-auto mb-12 leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300">
                        Bridge the gap between tournament and online play. Get comprehensive scouting reports from Chess.com, Lichess, and OTB tournament databases.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-400">
                        <button
                            onClick={onGetStarted}
                            className="w-full sm:w-auto px-10 py-5 bg-white text-slate-950 hover:bg-slate-100 rounded-2xl font-bold text-lg transition-all shadow-2xl shadow-white/10 flex items-center justify-center gap-2 group"
                        >
                            {user ? 'Go to Dashboard' : 'Start Analyzing'} <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>
                </div>
            </section>

            {/* Featured Reports - "The Hook" - moved up for conversion */}
            <section
                ref={featuredRef.ref}
                className={`py-24 px-6 relative overflow-hidden ${
                    featuredRef.isVisible ? 'animate-fade-in-up' : ''
                }`}
                style={featuredRef.isVisible ? {} : { opacity: 0 }}
            >
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_0%,rgba(99,102,241,0.08),transparent_50%)] pointer-events-none" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_100%,rgba(30,41,59,0.6),transparent)] pointer-events-none" />
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
                <div className="max-w-5xl mx-auto relative">
                    <div className="flex flex-col items-center mb-14">
                        <Crown className="w-8 h-8 text-amber-400 mb-4" />
                        <h2 className="text-4xl md:text-5xl font-bold tracking-wide bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400 dark:from-white dark:to-slate-400 from-gray-900 to-gray-600 text-center">
                            Featured Reports
                        </h2>
                        <p className="text-slate-500 dark:text-slate-500 text-gray-500 text-base mt-3 text-center max-w-xl">
                            Explore sample scouting reports of top players. No sign-in required.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
                        {featuredList.map((item) => {
                            const handleClick = async () => {
                                if (!onViewFeaturedReport) return;
                                setLoadingFeatured(item.slug);
                                try {
                                    const { getFeaturedReport } = await import('../services/featuredReports');
                                    const report = await getFeaturedReport(item.slug);
                                    if (report) await onViewFeaturedReport(item.slug);
                                } finally {
                                    setLoadingFeatured(null);
                                }
                            };
                            return (
                                <div
                                    key={item.slug}
                                    role="button"
                                    tabIndex={0}
                                    onClick={handleClick}
                                    onKeyDown={(e) => e.key === 'Enter' && handleClick()}
                                    className="group relative w-full bg-slate-800/80 dark:bg-slate-800/80 border border-slate-700/60 dark:border-slate-700/60 rounded-2xl p-6 cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-500/10 hover:border-indigo-500/40 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 flex flex-col min-h-[120px]"
                                    style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.05) inset, 0 0 20px rgba(251,191,36,0.08)' }}
                                >
                                    <div className="flex items-stretch gap-4 flex-1">
                                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                                            <div className="text-white dark:text-white font-bold text-lg">{item.name}</div>
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
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); handleClick(); }}
                                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white text-sm font-semibold transition-all duration-200 hover:scale-105 hover:shadow-lg hover:shadow-indigo-500/25 disabled:opacity-50 shrink-0"
                                            disabled={!onViewFeaturedReport || loadingFeatured !== null}
                                        >
                                            {loadingFeatured === item.slug ? 'Loading...' : (
                                                <>
                                                    View
                                                    <ArrowRight className="w-4 h-4" />
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Unique Features Section */}
            <section 
                ref={featuresRef.ref}
                className={`py-12 px-6 bg-slate-950 dark:bg-slate-950 bg-white relative ${
                    featuresRef.isVisible ? 'animate-fade-in-up' : ''
                }`}
                style={featuresRef.isVisible ? {} : { opacity: 0 }}
            >
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400 dark:from-white dark:to-slate-400 from-gray-900 to-gray-600">
                            What Makes PrepSuite Unique
                        </h2>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {/* Feature 1: Identity Resolution */}
                        <div className={`bg-slate-900/50 dark:bg-slate-900/50 bg-gray-50 border border-slate-700/80 dark:border-slate-700/80 border-gray-200 rounded-2xl p-8 hover:border-indigo-500/40 dark:hover:border-indigo-500/40 hover:border-indigo-600 transition-all group shadow-[0_0_0_1px_rgba(255,255,255,0.04)] ${
                            featuresRef.isVisible ? 'animate-fade-in-up' : ''
                        }`}
                        style={featuresRef.isVisible ? { animationDelay: '0.1s', animationFillMode: 'both' } : {}}
                        >
                            <div className="w-14 h-14 bg-indigo-600/10 dark:bg-indigo-600/10 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-500 dark:text-indigo-500 text-indigo-600 mb-6 group-hover:scale-110 transition-transform">
                                <Users className="w-8 h-8" />
                            </div>
                            <h3 className="text-2xl font-bold mb-3 text-white dark:text-white text-gray-900">AI-Powered Identity Resolution</h3>
                            <p className="text-slate-400 dark:text-slate-400 text-gray-600 leading-relaxed">
                                Discovers Chess.com and Lichess usernames from FIDE and USCF IDs using AI search. Works with online platforms and OTB tournament data for complete coverage.
                            </p>
                        </div>

                        {/* Feature 2: Cross-Platform Aggregation */}
                        <div className={`bg-slate-900/50 dark:bg-slate-900/50 bg-gray-50 border border-slate-700/80 dark:border-slate-700/80 border-gray-200 rounded-2xl p-8 hover:border-indigo-500/40 dark:hover:border-indigo-500/40 hover:border-indigo-600 transition-all group shadow-[0_0_0_1px_rgba(255,255,255,0.04)] ${
                            featuresRef.isVisible ? 'animate-fade-in-up' : ''
                        }`}
                        style={featuresRef.isVisible ? { animationDelay: '0.2s', animationFillMode: 'both' } : {}}
                        >
                            <div className="w-14 h-14 bg-emerald-600/10 dark:bg-emerald-600/10 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-500 dark:text-emerald-500 text-emerald-600 mb-6 group-hover:scale-110 transition-transform">
                                <Database className="w-8 h-8" />
                            </div>
                            <h3 className="text-2xl font-bold mb-3 text-white dark:text-white text-gray-900">Multi-Source Game Aggregation</h3>
                            <p className="text-slate-400 dark:text-slate-400 text-gray-600 leading-relaxed">
                                Analyzes up to 5,000 games from Chess.com, Lichess, and OTB tournament databases. Get a complete picture of your opponent's playing style across online and over-the-board play.
                            </p>
                        </div>

                        {/* Feature 3: Stockfish Engine Analysis */}
                        <div className={`bg-slate-900/50 dark:bg-slate-900/50 bg-gray-50 border border-slate-700/80 dark:border-slate-700/80 border-gray-200 rounded-2xl p-8 hover:border-indigo-500/40 dark:hover:border-indigo-500/40 hover:border-indigo-600 transition-all group shadow-[0_0_0_1px_rgba(255,255,255,0.04)] ${
                            featuresRef.isVisible ? 'animate-fade-in-up' : ''
                        }`}
                        style={featuresRef.isVisible ? { animationDelay: '0.3s', animationFillMode: 'both' } : {}}
                        >
                            <div className="w-14 h-14 bg-blue-600/10 dark:bg-blue-600/10 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-500 dark:text-blue-500 text-blue-600 mb-6 group-hover:scale-110 transition-transform">
                                <Cpu className="w-8 h-8" />
                            </div>
                            <h3 className="text-2xl font-bold mb-3 text-white dark:text-white text-gray-900">Stockfish Engine Analysis</h3>
                            <p className="text-slate-400 dark:text-slate-400 text-gray-600 leading-relaxed">
                                Every game analyzed with Stockfish depth 10-12. Identify critical mistakes, endgame accuracy, and tactical patterns that human analysis might miss.
                            </p>
                        </div>

                        {/* Feature 4: Opening Repertoire Analysis */}
                        <div className={`bg-slate-900/50 dark:bg-slate-900/50 bg-gray-50 border border-slate-700/80 dark:border-slate-700/80 border-gray-200 rounded-2xl p-8 hover:border-indigo-500/40 dark:hover:border-indigo-500/40 hover:border-indigo-600 transition-all group shadow-[0_0_0_1px_rgba(255,255,255,0.04)] ${
                            featuresRef.isVisible ? 'animate-fade-in-up' : ''
                        }`}
                        style={featuresRef.isVisible ? { animationDelay: '0.4s', animationFillMode: 'both' } : {}}
                        >
                            <div className="w-14 h-14 bg-purple-600/10 dark:bg-purple-600/10 bg-purple-100 rounded-2xl flex items-center justify-center text-purple-500 dark:text-purple-500 text-purple-600 mb-6 group-hover:scale-110 transition-transform">
                                <BarChart3 className="w-8 h-8" />
                            </div>
                            <h3 className="text-2xl font-bold mb-3 text-white dark:text-white text-gray-900">Opening Repertoire Breakdown</h3>
                            <p className="text-slate-400 dark:text-slate-400 text-gray-600 leading-relaxed">
                                Visual charts showing win/draw/loss rates for each opening. Identify which systems your opponent plays most frequently and where they're weakest.
                            </p>
                        </div>

                        {/* Feature 5: AI Strategic Insights */}
                        <div className={`bg-slate-900/50 dark:bg-slate-900/50 bg-gray-50 border border-slate-700/80 dark:border-slate-700/80 border-gray-200 rounded-2xl p-8 hover:border-indigo-500/40 dark:hover:border-indigo-500/40 hover:border-indigo-600 transition-all group shadow-[0_0_0_1px_rgba(255,255,255,0.04)] ${
                            featuresRef.isVisible ? 'animate-fade-in-up' : ''
                        }`}
                        style={featuresRef.isVisible ? { animationDelay: '0.5s', animationFillMode: 'both' } : {}}
                        >
                            <div className="w-14 h-14 bg-amber-600/10 dark:bg-amber-600/10 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-500 dark:text-amber-500 text-amber-600 mb-6 group-hover:scale-110 transition-transform">
                                <Brain className="w-8 h-8" />
                            </div>
                            <h3 className="text-2xl font-bold mb-3 text-white dark:text-white text-gray-900">AI-Powered Strategic Reports</h3>
                            <p className="text-slate-400 dark:text-slate-400 text-gray-600 leading-relaxed">
                                Google Gemini AI generates comprehensive scouting reports with strengths, weaknesses, tactical recommendations, and specific preparation lines tailored to exploit patterns.
                            </p>
                        </div>

                        {/* Feature 6: FIDE & USCF Integration */}
                        <div className={`bg-slate-900/50 dark:bg-slate-900/50 bg-gray-50 border border-slate-700/80 dark:border-slate-700/80 border-gray-200 rounded-2xl p-8 hover:border-indigo-500/40 dark:hover:border-indigo-500/40 hover:border-indigo-600 transition-all group shadow-[0_0_0_1px_rgba(255,255,255,0.04)] ${
                            featuresRef.isVisible ? 'animate-fade-in-up' : ''
                        }`}
                        style={featuresRef.isVisible ? { animationDelay: '0.6s', animationFillMode: 'both' } : {}}
                        >
                            <div className="w-14 h-14 bg-red-600/10 dark:bg-red-600/10 bg-red-100 rounded-2xl flex items-center justify-center text-red-500 dark:text-red-500 text-red-600 mb-6 group-hover:scale-110 transition-transform">
                                <Globe className="w-8 h-8" />
                            </div>
                            <h3 className="text-2xl font-bold mb-3 text-white dark:text-white text-gray-900">Tournament Data Integration</h3>
                            <p className="text-slate-400 dark:text-slate-400 text-gray-600 leading-relaxed">
                                Seamlessly works with both FIDE (international) and USCF (US) tournament data. Supports players from any federation with verified tournament identities.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* How It Works Section */}
            <section 
                ref={howItWorksRef.ref}
                className={`py-[4.5rem] px-6 bg-slate-900/30 dark:bg-slate-900/30 bg-slate-50 relative overflow-hidden ${
                    howItWorksRef.isVisible ? 'animate-fade-in-up' : ''
                }`}
                style={howItWorksRef.isVisible ? {} : { opacity: 0 }}
            >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[1000px] bg-indigo-600/5 blur-[150px] rounded-full" />
                
                <div className="max-w-7xl mx-auto relative z-10">
                    <div className="text-center mb-[4.5rem]">
                        <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400 dark:from-white dark:to-slate-400 from-gray-900 to-gray-600">
                            How It Works
                        </h2>
                    </div>

                    <div className="overflow-x-auto overflow-y-hidden pb-2 -mx-6 px-6 snap-x snap-mandatory">
                        <div className="flex min-w-max" style={{ gap: '1.8rem' }}>
                            {previewImages.map((item, i) => (
                                <figure key={i} className="flex-shrink-0 w-[min(90vw,640px)] snap-center flex flex-col">
                                    <figcaption className="mb-3 text-slate-400 dark:text-slate-400 text-gray-600 text-base text-center whitespace-nowrap">
                                        {item.caption}
                                    </figcaption>
                                    <button
                                        type="button"
                                        onClick={() => setLightboxIndex(i)}
                                        className="w-full aspect-[16/10] rounded-xl overflow-hidden border border-slate-700/80 dark:border-slate-700/80 border-gray-200 shadow-xl flex items-center justify-center bg-slate-900/30 dark:bg-slate-900/30 bg-slate-100 cursor-pointer hover:ring-2 hover:ring-indigo-500/50 transition-shadow focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <img
                                            src={item.src}
                                            alt={item.caption}
                                            className="w-full h-full object-contain pointer-events-none"
                                            loading="lazy"
                                        />
                                    </button>
                                </figure>
                            ))}
                        </div>
                    </div>

                    {/* Lightbox modal - rendered via portal to avoid ancestor overflow clipping */}
                    {lightboxIndex !== null && createPortal(
                        <div
                            className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm overflow-y-auto overflow-x-hidden"
                            onClick={() => setLightboxIndex(null)}
                            role="dialog"
                            aria-modal="true"
                            aria-label="View full size image"
                        >
                            <button
                                type="button"
                                onClick={() => setLightboxIndex(null)}
                                className="fixed top-4 right-4 p-2 rounded-full bg-slate-800/80 text-white hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 z-[10000]"
                                aria-label="Close"
                            >
                                <X className="w-6 h-6" />
                            </button>
                            <div
                                className="min-h-screen flex flex-col items-center justify-center py-20 px-4"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <img
                                    src={previewImages[lightboxIndex].src}
                                    alt={previewImages[lightboxIndex].caption}
                                    className="max-w-[95vw] w-auto max-h-none object-contain rounded-lg shadow-2xl"
                                    style={{ height: 'auto' }}
                                />
                                <p className="mt-6 text-slate-300 text-sm text-center max-w-xl">
                                    {previewImages[lightboxIndex].caption}
                                </p>
                            </div>
                        </div>,
                        document.body
                    )}
                </div>
            </section>

            {/* Key Benefits Section */}
            <section 
                ref={benefitsRef.ref}
                className={`py-20 px-6 bg-slate-950 dark:bg-slate-950 bg-white transition-opacity duration-1000 ease-out ${
                    benefitsRef.isVisible ? 'opacity-100' : 'opacity-0'
                }`}
            >
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400 dark:from-white dark:to-slate-400 from-gray-900 to-gray-600">
                            Why Tournament Players Choose PrepSuite
                        </h2>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
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
                                    className={`flex items-start gap-4 p-6 bg-slate-900/50 dark:bg-slate-900/50 bg-gray-50 border border-slate-700/80 dark:border-slate-700/80 border-gray-200 rounded-xl shadow-[0_0_0_1px_rgba(255,255,255,0.04)] ${
                                        benefitsRef.isVisible ? 'animate-fade-in-up' : ''
                                    }`}
                                    style={benefitsRef.isVisible ? { animationDelay: delays[i] || '0s', animationFillMode: 'both' } : {}}
                                >
                                    <CheckCircle className="w-6 h-6 text-emerald-400 dark:text-emerald-400 text-emerald-600 shrink-0 mt-0.5" />
                                    <p className="text-slate-200 dark:text-slate-200 text-gray-700 text-base leading-relaxed">{benefit}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Login/Signup Section - Full Width (hidden when user is authenticated) */}
            {!user && (
            <section 
                id="access" 
                ref={loginRef.ref}
                className={`min-h-screen py-12 px-6 bg-slate-950 dark:bg-slate-950 bg-white ${
                    loginRef.isVisible ? 'animate-fade-in-up' : ''
                }`}
                style={loginRef.isVisible ? {} : { opacity: 0 }}
            >
                <div className="max-w-7xl mx-auto">
                    <div className="grid lg:grid-cols-2 gap-12 items-center">
                        {/* Left side - Content */}
                        <div className="space-y-8">
                            <div>
                                <div className="w-16 h-16 bg-indigo-600/20 rounded-2xl flex items-center justify-center mb-6 text-indigo-500 shadow-inner inline-flex">
                                    <Shield className="w-8 h-8" />
                                </div>
                                <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400 dark:from-white dark:to-slate-400 from-gray-900 to-gray-600">
                                    {view === 'success' ? 'Verification Required' : (view === 'login' ? 'Welcome Back' : 'Join PrepSuite')}
                                </h2>
                                <p className="text-slate-400 dark:text-slate-400 text-gray-600 text-lg">
                                    {view === 'success'
                                        ? 'We\'ve sent a verification link to your inbox to authorize this device.'
                                        : 'Access the PrepSuite platform with your credentials to start analyzing opponents.'}
                                </p>
                            </div>
                            
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 text-slate-300 dark:text-slate-300 text-gray-700">
                                    <CheckCircle className="w-5 h-5 text-emerald-400 dark:text-emerald-400 text-emerald-600 shrink-0" />
                                    <span>Free to get started</span>
                                </div>
                                <div className="flex items-center gap-3 text-slate-300 dark:text-slate-300 text-gray-700">
                                    <CheckCircle className="w-5 h-5 text-emerald-400 dark:text-emerald-400 text-emerald-600 shrink-0" />
                                    <span>No credit card required</span>
                                </div>
                                <div className="flex items-center gap-3 text-slate-300 dark:text-slate-300 text-gray-700">
                                    <CheckCircle className="w-5 h-5 text-emerald-400 dark:text-emerald-400 text-emerald-600 shrink-0" />
                                    <span>Instant access to all features</span>
                                </div>
                            </div>
                        </div>

                        {/* Right side - Form */}
                        <div className="bg-slate-900/40 dark:bg-slate-900/40 bg-gray-50 border border-white/10 dark:border-white/10 border-gray-200 rounded-[40px] p-8 md:p-12 relative overflow-hidden backdrop-blur-3xl shadow-3xl">
                            <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
                                <Shield className="w-64 h-64 text-indigo-500" />
                            </div>

                            {view === 'success' ? (
                                <div className="max-w-md mx-auto p-10 bg-indigo-600/10 dark:bg-indigo-600/10 bg-indigo-50 border border-indigo-400/30 dark:border-indigo-400/30 border-indigo-200 rounded-[32px] animate-in zoom-in-95 duration-500 text-center relative overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 dark:from-indigo-500/5 from-indigo-100/50 to-transparent pointer-events-none" />
                                    <div className="w-16 h-16 bg-emerald-500/20 dark:bg-emerald-500/20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                        <div className="w-3 h-3 bg-emerald-400 dark:bg-emerald-400 bg-emerald-600 rounded-full animate-pulse" />
                                    </div>
                                    <h4 className="text-2xl font-bold mb-3 text-white dark:text-white text-gray-900">Check Your Inbox</h4>
                                    <p className="text-indigo-200/80 dark:text-indigo-200/80 text-indigo-700 text-sm leading-relaxed mb-8">
                                        A verification link has been sent to <span className="text-white dark:text-white text-gray-900 font-bold underline decoration-indigo-500/50 dark:decoration-indigo-500/50 decoration-indigo-600">{email}</span>. Click it to authorize your session.
                                    </p>
                                    <button
                                        onClick={() => setView('login')}
                                        className="text-xs uppercase tracking-widest font-bold text-indigo-400 dark:text-indigo-400 text-indigo-600 hover:text-white dark:hover:text-white hover:text-gray-900 transition-colors flex items-center gap-2 mx-auto group"
                                    >
                                        <ChevronRight className="w-4 h-4 rotate-180 group-hover:-translate-x-1 transition-transform" />
                                        Return to Login
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-6 relative z-10">
                                    <form onSubmit={handleEmailPasswordSubmit} className="space-y-4">
                                    <div className="space-y-2">
                                    <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 dark:text-slate-500 text-gray-600 ml-1">Email Address</label>
                                    <div className="relative group">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 dark:text-slate-600 text-gray-400 group-focus-within:text-indigo-400 dark:group-focus-within:text-indigo-400 group-focus-within:text-indigo-600 transition-colors" />
                                        <input
                                            type="email"
                                            placeholder="your@email.com"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="w-full pl-12 pr-4 py-4 bg-slate-950/50 dark:bg-slate-950/50 bg-gray-50 border border-slate-800 dark:border-slate-800 border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 dark:focus:ring-indigo-500/50 focus:ring-indigo-600 text-white dark:text-white text-gray-900 placeholder:text-slate-700 dark:placeholder:text-slate-700 placeholder:text-gray-400 transition-all font-medium"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 dark:text-slate-500 text-gray-600 ml-1">Password</label>
                                    <div className="relative group">
                                        <Shield className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 dark:text-slate-600 text-gray-400 group-focus-within:text-indigo-400 dark:group-focus-within:text-indigo-400 group-focus-within:text-indigo-600 transition-colors" />
                                        <input
                                            type="password"
                                            placeholder="••••••••••••"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full pl-12 pr-4 py-4 bg-slate-950/50 dark:bg-slate-950/50 bg-gray-50 border border-slate-800 dark:border-slate-800 border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 dark:focus:ring-indigo-500/50 focus:ring-indigo-600 text-white dark:text-white text-gray-900 placeholder:text-slate-700 dark:placeholder:text-slate-700 placeholder:text-gray-400 transition-all font-medium"
                                            required
                                        />
                                            </div>
                                        </div>

                                        <button
                                            type="submit"
                                            className="w-full bg-indigo-600 text-white px-10 py-4 rounded-2xl font-bold text-lg hover:bg-indigo-500 active:scale-[0.98] transition-all shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-2 group"
                                        >
                                            {view === 'login' ? 'Sign In' : 'Create Account'}
                                            <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                        </button>

                                <div className="text-center">
                                    <button
                                        type="button"
                                        onClick={() => setView(view === 'login' ? 'signup' : 'login')}
                                        className="text-sm text-slate-500 dark:text-slate-500 text-gray-600 hover:text-indigo-400 dark:hover:text-indigo-400 hover:text-indigo-600 transition-colors"
                                    >
                                        {view === 'login' ? 'New here? Initialize account' : 'Already have an account? Log in here'}
                                    </button>
                                </div>
                            </form>

                            <div className="relative py-4">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-slate-800 dark:border-slate-800 border-gray-200"></div>
                                </div>
                                <div className="relative flex justify-center text-[10px] uppercase tracking-[0.2em] text-slate-600 dark:text-slate-600 text-gray-500">
                                    <span className="bg-slate-900/40 dark:bg-slate-900/40 bg-gray-50 px-4">Social Login</span>
                                </div>
                            </div>

                            <button
                                onClick={() => onLogin('google')}
                                className="w-full bg-slate-950 dark:bg-slate-950 bg-white text-white dark:text-white text-gray-900 px-10 py-4 rounded-2xl font-bold text-lg hover:bg-slate-900 dark:hover:bg-slate-900 hover:bg-gray-50 border border-slate-800 dark:border-slate-800 border-gray-200 shadow-xl flex items-center justify-center gap-3 transition-all hover:border-indigo-500/30 dark:hover:border-indigo-500/30 hover:border-indigo-600"
                            >
                                        <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
                                        Continue with Google
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </section>
            )}

            {/* Footer */}
            <footer className="bg-slate-950 dark:bg-slate-950 bg-white border-t border-slate-800 dark:border-slate-800 border-gray-200 py-8 px-6">
                <div className="max-w-7xl mx-auto">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="text-slate-400 dark:text-slate-400 text-gray-600 text-sm">
                            © {new Date().getFullYear()} SoundSideDesign. All rights reserved.
                        </div>
                        <div className="flex items-center gap-6">
                            <a
                                href="#"
                                className="text-slate-400 dark:text-slate-400 text-gray-600 hover:text-indigo-400 dark:hover:text-indigo-400 hover:text-indigo-600 text-sm transition-colors"
                                onClick={(e) => {
                                    e.preventDefault();
                                    if (onShowPrivacyPolicy) {
                                        onShowPrivacyPolicy();
                                    }
                                }}
                            >
                                Privacy Policy
                            </a>
                            <a
                                href="#"
                                className="text-slate-400 dark:text-slate-400 text-gray-600 hover:text-indigo-400 dark:hover:text-indigo-400 hover:text-indigo-600 text-sm transition-colors"
                                onClick={(e) => {
                                    e.preventDefault();
                                    if (onShowTermsOfService) {
                                        onShowTermsOfService();
                                    }
                                }}
                            >
                                Terms of Service
                            </a>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
