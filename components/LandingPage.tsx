import React, { useState } from 'react';
import { Shield, Zap, Target, Search, Database, LayoutDashboard, ChevronRight, Globe, Mail, CheckCircle, Trophy, Users, BookOpen } from 'lucide-react';

interface LandingPageProps {
    onGetStarted: () => void;
    onLogin: (provider: 'google' | { email: string; password?: string; isNewUser?: boolean }) => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted, onLogin }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [view, setView] = useState<'login' | 'signup' | 'success'>('login');

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
        <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500/30">
            {/* Navigation */}
            <nav className="fixed top-0 w-full z-50 backdrop-blur-xl bg-slate-950/50 border-b border-slate-800/50 px-6 py-4">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <div className="bg-indigo-600 p-1.5 rounded-lg shadow-lg shadow-indigo-900/40">
                            <Shield className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                            PrepSuite
                        </span>
                    </div>
                    <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
                        <a href="#features" className="hover:text-white transition-colors">Features</a>
                        <a href="#analysis" className="hover:text-white transition-colors">Analysis</a>
                        <a href="#security" className="hover:text-white transition-colors">Access</a>
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={onGetStarted}
                            className="bg-white text-slate-950 px-5 py-2.5 rounded-full text-sm font-bold hover:bg-slate-200 transition-all shadow-xl shadow-white/10"
                        >
                            Get Started
                        </button>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative pt-40 pb-20 px-6 overflow-hidden">
                <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-indigo-600/10 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-blue-600/5 blur-[100px] rounded-full translate-y-1/2 -translate-x-1/2" />

                <div className="max-w-7xl mx-auto text-center relative z-10">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/50 border border-indigo-500/20 text-indigo-400 text-xs font-bold uppercase tracking-widest mb-8 animate-in fade-in slide-in-from-top-4 duration-1000">
                        <Trophy className="w-3 h-3" /> Master Your Preparation
                    </div>
                    <h1 className="text-6xl md:text-8xl font-bold tracking-tight mb-8 bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-slate-500 max-w-4xl mx-auto leading-[1.1]">
                        Advanced Chess Strategy Assistant
                    </h1>
                    <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-12 leading-relaxed">
                        Eliminate opening surprises. Analyze opponents with deep repertoire analysis that bridges the gap between tournament data and online handles.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300">
                        <button
                            onClick={onGetStarted}
                            className="w-full sm:w-auto px-10 py-5 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-bold text-lg transition-all shadow-2xl shadow-indigo-900/40 flex items-center justify-center gap-2 group"
                        >
                            Analyze Your Opponent <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>

                    {/* Fixed Rendering for Identity Discovery Section */}
                    <div className="mt-24 relative p-8 bg-slate-900/50 border border-slate-800 rounded-3xl shadow-3xl animate-in zoom-in-95 duration-1000 delay-500 overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-50" />

                        <div className="grid md:grid-cols-2 gap-12 items-center">
                            <div className="text-left space-y-6">
                                <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
                                    <Users className="w-8 h-8 text-white" />
                                </div>
                                <h3 className="text-3xl font-bold">Comprehensive Cross-Platform Discovery</h3>
                                <p className="text-slate-400 text-lg leading-relaxed">
                                    Our engine automatically maps official FIDE and USCF tournament identities to their corresponding handles on Chess.com and Lichess.
                                </p>
                                <ul className="space-y-4">
                                    {[
                                        { icon: Shield, text: "Verified Identity Matching" },
                                        { icon: Database, text: "Aggregated Game Repositories" },
                                        { icon: Globe, text: "Global Tournament Insights" }
                                    ].map((item, i) => (
                                        <li key={i} className="flex items-center gap-3 text-sm text-slate-300">
                                            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
                                                <item.icon className="w-4 h-4 text-indigo-400" />
                                            </div>
                                            {item.text}
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="relative aspect-video rounded-2xl bg-slate-950 border border-slate-800 p-6 flex flex-col gap-4 shadow-2xl overflow-hidden group">
                                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
                                        <div className="w-3 h-3 rounded-full bg-amber-500/20 border border-amber-500/50" />
                                        <div className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500/50" />
                                    </div>
                                    <div className="text-[10px] text-slate-500 font-mono">prep-suite-v1.2.0</div>
                                </div>
                                <div className="space-y-3">
                                    <div className="h-4 w-3/4 bg-slate-900 rounded-full animate-pulse" />
                                    <div className="h-4 w-1/2 bg-slate-900 rounded-full animate-pulse delay-75" />
                                    <div className="h-32 w-full bg-indigo-500/5 rounded-xl border border-indigo-500/20 flex items-center justify-center group-hover:bg-indigo-500/10 transition-colors">
                                        <Search className="w-8 h-8 text-indigo-500/50" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="h-12 bg-slate-900 rounded-xl" />
                                        <div className="h-12 bg-slate-900 rounded-xl" />
                                    </div>
                                </div>
                                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-60" />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Feature Grid */}
            <section id="features" className="py-32 px-6 bg-slate-950 relative">
                <div className="max-w-7xl mx-auto">
                    <div className="grid md:grid-cols-3 gap-12">
                        <div className="space-y-6 p-8 bg-slate-900/30 border border-slate-800 rounded-3xl transition-all hover:bg-slate-900/50 hover:border-indigo-500/30 group">
                            <div className="w-14 h-14 bg-indigo-600/10 rounded-2xl flex items-center justify-center text-indigo-500 group-hover:scale-110 transition-transform">
                                <Users className="w-8 h-8" />
                            </div>
                            <h3 className="text-2xl font-bold">Identity Resolution</h3>
                            <p className="text-slate-400 leading-relaxed">
                                Our search algorithm resolves online handles from official tournament data, ensuring your preparation is based on the right games.
                            </p>
                        </div>

                        <div className="space-y-6 p-8 bg-slate-900/30 border border-slate-800 rounded-3xl transition-all hover:bg-slate-900/50 hover:border-indigo-500/30 group">
                            <div className="w-14 h-14 bg-emerald-600/10 rounded-2xl flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
                                <Database className="w-8 h-8" />
                            </div>
                            <h3 className="text-2xl font-bold">Aggregated Analysis</h3>
                            <p className="text-slate-400 leading-relaxed">
                                Processes thousands of games across platforms to extract opening win rates, thematic trends, and stylistic patterns.
                            </p>
                        </div>

                        <div className="space-y-6 p-8 bg-slate-900/30 border border-slate-800 rounded-3xl transition-all hover:bg-slate-900/50 hover:border-indigo-500/30 group">
                            <div className="w-14 h-14 bg-blue-600/10 rounded-2xl flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
                                <BookOpen className="w-8 h-8" />
                            </div>
                            <h3 className="text-2xl font-bold">Opening Repertoire</h3>
                            <p className="text-slate-400 leading-relaxed">
                                Integrated FIDE and USCF data provides the necessary context to ensure your tournament preparation is comprehensive.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Access Section */}
            <section id="security" className="py-32 px-6">
                <div className="max-w-4xl mx-auto bg-slate-900/40 border border-white/10 rounded-[40px] p-8 md:p-16 relative overflow-hidden backdrop-blur-3xl shadow-3xl">
                    <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
                        <Trophy className="w-64 h-64 text-indigo-500" />
                    </div>

                    <div className="flex flex-col items-center text-center mb-12">
                        <div className="w-16 h-16 bg-indigo-600/20 rounded-2xl flex items-center justify-center mb-6 text-indigo-500 shadow-inner">
                            <Shield className="w-8 h-8" />
                        </div>
                        <h2 className="text-4xl md:text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-400">
                            {view === 'success' ? 'Verification Required' : (view === 'login' ? 'Welcome Back' : 'Join PrepSuite')}
                        </h2>
                        <p className="text-slate-400 text-lg max-w-xl">
                            {view === 'success'
                                ? 'We\'ve sent a verification link to your inbox to authorize this device.'
                                : 'Access the PrepSuite platform with your credentials.'}
                        </p>
                    </div>

                    {view === 'success' ? (
                        <div className="max-w-md mx-auto p-10 bg-indigo-600/10 border border-indigo-400/30 rounded-[32px] animate-in zoom-in-95 duration-500 text-center relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent pointer-events-none" />
                            <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto mb-6 drop-shadow-lg" />
                            <h4 className="text-2xl font-bold mb-3 text-white">Check Your Inbox</h4>
                            <p className="text-indigo-200/80 text-sm leading-relaxed mb-8">
                                A verification link has been sent to <span className="text-white font-bold underline decoration-indigo-500/50">{email}</span>. Click it to authorize your session.
                            </p>
                            <button
                                onClick={() => setView('login')}
                                className="text-xs uppercase tracking-widest font-bold text-indigo-400 hover:text-white transition-colors flex items-center gap-2 mx-auto group"
                            >
                                <ChevronRight className="w-4 h-4 rotate-180 group-hover:-translate-x-1 transition-transform" />
                                Return to Login
                            </button>
                        </div>
                    ) : (
                        <div className="max-w-md mx-auto space-y-8">
                            <form onSubmit={handleEmailPasswordSubmit} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 ml-1">Email Address</label>
                                    <div className="relative group">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 group-focus-within:text-indigo-400 transition-colors" />
                                        <input
                                            type="email"
                                            placeholder="your@email.com"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="w-full pl-12 pr-4 py-4 bg-slate-950/50 border border-slate-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-white placeholder:text-slate-700 transition-all font-medium"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] uppercase tracking-widest font-bold text-slate-500 ml-1">Password</label>
                                    <div className="relative group">
                                        <Shield className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 group-focus-within:text-indigo-400 transition-colors" />
                                        <input
                                            type="password"
                                            placeholder="••••••••••••"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full pl-12 pr-4 py-4 bg-slate-950/50 border border-slate-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-white placeholder:text-slate-700 transition-all font-medium"
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
                                        className="text-sm text-slate-500 hover:text-indigo-400 transition-colors"
                                    >
                                        {view === 'login' ? 'New here? Initialize account' : 'Already have an account? Log in here'}
                                    </button>
                                </div>
                            </form>

                            <div className="relative py-4">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-slate-800"></div>
                                </div>
                                <div className="relative flex justify-center text-[10px] uppercase tracking-[0.2em] text-slate-600">
                                    <span className="bg-[#0f172a] px-4">Social Login</span>
                                </div>
                            </div>

                            <button
                                onClick={() => onLogin('google')}
                                className="w-full bg-slate-950 text-white px-10 py-4 rounded-2xl font-bold text-lg hover:bg-slate-900 border border-slate-800 shadow-xl flex items-center justify-center gap-3 transition-all hover:border-indigo-500/30"
                            >
                                <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5 grayscale group-hover:grayscale-0 transition-all" />
                                Continue with Google
                            </button>
                        </div>
                    )}
                </div>
            </section>

            {/* Footer */}
            <footer className="py-20 px-6 border-t border-slate-800/50 bg-slate-950/50">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
                    <div className="flex items-center gap-2 opacity-50">
                        <Shield className="w-6 h-6" />
                        <span className="text-sm font-bold tracking-tight">PrepSuite</span>
                    </div>
                    <div className="text-slate-500 text-sm font-medium">
                        © 2026 PrepSuite. All Rights Reserved.
                    </div>
                    <div className="flex gap-8 text-xs font-bold uppercase tracking-widest text-slate-500">
                        <a href="#" className="hover:text-indigo-400 transition-colors">Privacy</a>
                        <a href="#" className="hover:text-indigo-400 transition-colors">Terms</a>
                        <a href="#" className="hover:text-indigo-400 transition-colors">Contact</a>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
