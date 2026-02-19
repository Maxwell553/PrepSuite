import React, { useState } from 'react';
import { Shield, Mail, ChevronRight, Search, Database, Target, Zap, TrendingUp, Cpu, Users, Globe, BarChart3, Brain, CheckCircle, ArrowRight } from 'lucide-react';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { useScrollAnimation } from '../hooks/useScrollAnimation';

interface LandingPageProps {
    onGetStarted: () => void;
    onLogin: (provider: 'google' | { email: string; password?: string; isNewUser?: boolean }) => void;
    user?: SupabaseUser | null;
    onShowPrivacyPolicy?: () => void;
    onShowTermsOfService?: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted, onLogin, user, onShowPrivacyPolicy, onShowTermsOfService }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [view, setView] = useState<'login' | 'signup' | 'success'>('login');

    const featuresRef = useScrollAnimation();
    const howItWorksRef = useScrollAnimation();
    const benefitsRef = useScrollAnimation();
    const loginRef = useScrollAnimation();

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

                <div className="max-w-7xl mx-auto text-center relative z-10">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/50 dark:bg-slate-900/50 bg-indigo-50 border border-indigo-500/20 dark:border-indigo-500/20 border-indigo-200 text-indigo-400 dark:text-indigo-400 text-indigo-600 text-xs font-bold uppercase tracking-widest mb-8 animate-in fade-in slide-in-from-top-4 duration-1000">
                        <Target className="w-3 h-3" /> Advanced Chess Preparation
                    </div>
                    <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-slate-500 dark:from-white dark:via-white dark:to-slate-500 from-gray-900 via-gray-900 to-gray-700 max-w-4xl mx-auto leading-[1.1] animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
                        Master Your Opponent Analysis
                    </h1>
                    <p className="text-xl text-slate-400 dark:text-slate-400 text-gray-600 max-w-2xl mx-auto mb-12 leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300">
                        Bridge the gap between tournament data and online play. Get comprehensive scouting reports that combine FIDE/USCF ratings with Chess.com and Lichess game analysis.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-400">
                        <button
                            onClick={onGetStarted}
                            className="w-full sm:w-auto px-10 py-5 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-bold text-lg transition-all shadow-2xl shadow-indigo-900/40 flex items-center justify-center gap-2 group"
                        >
                            {user ? 'Go to Dashboard' : 'Start Analyzing'} <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </button>
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
                        <p className="text-xl text-slate-400 dark:text-slate-400 text-gray-600 max-w-2xl mx-auto">
                            The only platform that seamlessly connects tournament identities with online game data
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {/* Feature 1: Identity Resolution */}
                        <div className={`bg-slate-900/50 dark:bg-slate-900/50 bg-gray-50 border border-slate-800 dark:border-slate-800 border-gray-200 rounded-2xl p-8 hover:border-indigo-500/30 dark:hover:border-indigo-500/30 hover:border-indigo-600 transition-all group ${
                            featuresRef.isVisible ? 'animate-fade-in-up' : ''
                        }`}
                        style={featuresRef.isVisible ? { animationDelay: '0.1s', animationFillMode: 'both' } : {}}
                        >
                            <div className="w-14 h-14 bg-indigo-600/10 dark:bg-indigo-600/10 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-500 dark:text-indigo-500 text-indigo-600 mb-6 group-hover:scale-110 transition-transform">
                                <Users className="w-8 h-8" />
                            </div>
                            <h3 className="text-2xl font-bold mb-3 text-white dark:text-white text-gray-900">AI-Powered Identity Resolution</h3>
                            <p className="text-slate-400 dark:text-slate-400 text-gray-600 leading-relaxed">
                                Automatically discovers Chess.com and Lichess usernames from FIDE or USCF IDs using advanced AI search and biometric matching. No manual username hunting required.
                            </p>
                        </div>

                        {/* Feature 2: Cross-Platform Aggregation */}
                        <div className={`bg-slate-900/50 dark:bg-slate-900/50 bg-gray-50 border border-slate-800 dark:border-slate-800 border-gray-200 rounded-2xl p-8 hover:border-indigo-500/30 dark:hover:border-indigo-500/30 hover:border-indigo-600 transition-all group ${
                            featuresRef.isVisible ? 'animate-fade-in-up' : ''
                        }`}
                        style={featuresRef.isVisible ? { animationDelay: '0.2s', animationFillMode: 'both' } : {}}
                        >
                            <div className="w-14 h-14 bg-emerald-600/10 dark:bg-emerald-600/10 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-500 dark:text-emerald-500 text-emerald-600 mb-6 group-hover:scale-110 transition-transform">
                                <Database className="w-8 h-8" />
                            </div>
                            <h3 className="text-2xl font-bold mb-3 text-white dark:text-white text-gray-900">Multi-Platform Game Aggregation</h3>
                            <p className="text-slate-400 dark:text-slate-400 text-gray-600 leading-relaxed">
                                Analyzes up to 10,000 games from both Chess.com and Lichess simultaneously. Get a complete picture of your opponent's playing style across all platforms.
                            </p>
                        </div>

                        {/* Feature 3: Stockfish Engine Analysis */}
                        <div className={`bg-slate-900/50 dark:bg-slate-900/50 bg-gray-50 border border-slate-800 dark:border-slate-800 border-gray-200 rounded-2xl p-8 hover:border-indigo-500/30 dark:hover:border-indigo-500/30 hover:border-indigo-600 transition-all group ${
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
                        <div className={`bg-slate-900/50 dark:bg-slate-900/50 bg-gray-50 border border-slate-800 dark:border-slate-800 border-gray-200 rounded-2xl p-8 hover:border-indigo-500/30 dark:hover:border-indigo-500/30 hover:border-indigo-600 transition-all group ${
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
                        <div className={`bg-slate-900/50 dark:bg-slate-900/50 bg-gray-50 border border-slate-800 dark:border-slate-800 border-gray-200 rounded-2xl p-8 hover:border-indigo-500/30 dark:hover:border-indigo-500/30 hover:border-indigo-600 transition-all group ${
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
                        <div className={`bg-slate-900/50 dark:bg-slate-900/50 bg-gray-50 border border-slate-800 dark:border-slate-800 border-gray-200 rounded-2xl p-8 hover:border-indigo-500/30 dark:hover:border-indigo-500/30 hover:border-indigo-600 transition-all group ${
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
                className={`py-12 px-6 bg-slate-900/30 dark:bg-slate-900/30 bg-slate-50 relative overflow-hidden ${
                    howItWorksRef.isVisible ? 'animate-fade-in-up' : ''
                }`}
                style={howItWorksRef.isVisible ? {} : { opacity: 0 }}
            >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[1000px] bg-indigo-600/5 blur-[150px] rounded-full" />
                
                <div className="max-w-7xl mx-auto relative z-10">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400 dark:from-white dark:to-slate-400 from-gray-900 to-gray-600">
                            How It Works
                        </h2>
                        <p className="text-xl text-slate-400 dark:text-slate-400 text-gray-600 max-w-2xl mx-auto">
                            Three simple steps to comprehensive opponent analysis
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        <div className={`text-center ${
                            howItWorksRef.isVisible ? 'animate-fade-in-left' : ''
                        }`}
                        style={howItWorksRef.isVisible ? { animationDelay: '0.2s', animationFillMode: 'both' } : {}}
                        >
                            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-900/40">
                                <span className="text-2xl font-bold text-white">1</span>
                            </div>
                            <h3 className="text-xl font-bold mb-3 text-white dark:text-white text-gray-900">Enter Tournament ID</h3>
                            <p className="text-slate-400 dark:text-slate-400 text-gray-600">
                                Provide your opponent's FIDE ID or USCF ID along with their name. Our AI automatically finds their Chess.com and Lichess accounts.
                            </p>
                        </div>

                        <div className={`text-center ${
                            howItWorksRef.isVisible ? 'animate-fade-in-up' : ''
                        }`}
                        style={howItWorksRef.isVisible ? { animationDelay: '0.3s', animationFillMode: 'both' } : {}}
                        >
                            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-900/40">
                                <span className="text-2xl font-bold text-white">2</span>
                            </div>
                            <h3 className="text-xl font-bold mb-3 text-white dark:text-white text-gray-900">Deep Analysis</h3>
                            <p className="text-slate-400 dark:text-slate-400 text-gray-600">
                                We fetch up to 10,000 games, analyze them with Stockfish depth 10, and process opening statistics. This happens automatically in the background.
                            </p>
                        </div>

                        <div className={`text-center ${
                            howItWorksRef.isVisible ? 'animate-fade-in-right' : ''
                        }`}
                        style={howItWorksRef.isVisible ? { animationDelay: '0.4s', animationFillMode: 'both' } : {}}
                        >
                            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-900/40">
                                <span className="text-2xl font-bold text-white">3</span>
                            </div>
                            <h3 className="text-xl font-bold mb-3 text-white dark:text-white text-gray-900">Get Your Report</h3>
                            <p className="text-slate-400 dark:text-slate-400 text-gray-600">
                                Receive a comprehensive scouting report with opening preferences, strengths, weaknesses, tactical recommendations, and specific preparation lines.
                            </p>
                        </div>
                    </div>
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

                    <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
                        {[
                            "Automatically links tournament identities to online accounts",
                            "Analyzes games from both Chess.com and Lichess simultaneously",
                            "Stockfish engine analysis identifies tactical weaknesses",
                            "Visual charts show opening performance at a glance",
                            "AI generates actionable preparation recommendations",
                            "Save and manage multiple scouting reports",
                            "Works with both FIDE and USCF tournament data",
                            "No manual username searching required"
                        ].map((benefit, i) => {
                            const delays = ['0.05s', '0.1s', '0.15s', '0.2s', '0.25s', '0.3s', '0.35s', '0.4s'];
                            return (
                                <div 
                                    key={i} 
                                    className={`flex items-start gap-3 p-4 bg-slate-900/50 dark:bg-slate-900/50 bg-gray-50 border border-slate-800 dark:border-slate-800 border-gray-200 rounded-xl ${
                                        benefitsRef.isVisible ? 'animate-fade-in-up' : ''
                                    }`}
                                    style={benefitsRef.isVisible ? { animationDelay: delays[i] || '0s', animationFillMode: 'both' } : {}}
                                >
                                    <CheckCircle className="w-5 h-5 text-emerald-400 dark:text-emerald-400 text-emerald-600 shrink-0 mt-0.5" />
                                    <p className="text-slate-300 dark:text-slate-300 text-gray-700">{benefit}</p>
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
