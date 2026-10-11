import GenerationOverlay from './GenerationOverlay';
import ChessParticles from './ChessParticles';
import MotionDisclosure from './MotionDisclosure';
import Brand from './Brand';
import React, { useEffect, useState } from "react";
import { LazyMotion, domAnimation, m, MotionConfig, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  ArrowUpRight,
  Search,
  Layers3,
  Target,
  Loader2,
  Check,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import type { ToastType } from "./Toast";
import type { FeaturedReportMeta } from "../services/featuredReports";
import "./landing.css";
import ChessScene from "./ChessScene";

interface Props {
  onGetStarted: () => void;
  onLogin: (
    value: "google" | { email: string; password?: string; isNewUser?: boolean },
  ) => void | Promise<void>;
  user?: User | null;
  onShowPrivacyPolicy?: () => void;
  onShowTermsOfService?: () => void;
  onShowAboutPrepSuite?: () => void;
  onViewFeaturedReport?: (slug: string) => Promise<void>;
  showToast?: (message: string, type: ToastType) => void;
  onGuestSearch?: (name: string, chessCom?: string, lichess?: string) => void;
  isGuestAnalyzing?: boolean;
  guestAnalyzingStatus?: string;
}
const reveal = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.1 },
  transition: { duration: 0.55 },
};
export default function LandingPage(p: Props) {
  const reduced = useReducedMotion();
  const entrance = (delay: number) => ({
    initial: reduced ? false as const : { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduced ? 0 : .7, delay: reduced ? 0 : delay, ease: [.22, 1, .36, 1] as const },
  });
  const [mode, setMode] = useState<"name" | "chess.com" | "lichess">("name");
  const [query, setQuery] = useState("");
  const [samples, setSamples] = useState<FeaturedReportMeta[]>([]);
  const [openingSample, setOpeningSample] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  useEffect(() => {
    import("../services/featuredReports")
      .then((x) => x.getFeaturedReportList())
      .then(setSamples)
      .catch(() => {});
  }, []);
  async function sample(slug: string) {
    setOpeningSample(slug);
    try {
      await p.onViewFeaturedReport?.(slug);
    } catch {
      p.showToast?.("Could not load this report. Please try again.", "error");
    } finally {
      setOpeningSample(null);
    }
  }
  async function login(value: Parameters<Props["onLogin"]>[0]) {
    setPending(true);
    setError("");
    try {
      await p.onLogin(value);
      if (typeof value !== "string" && value.isNewUser) setSuccess(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to sign in. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }
  const navigatePublic = (event: React.MouseEvent<HTMLAnchorElement>, action?: () => void) => {
    if (!action || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault(); action();
  };
  const scrollSearch = () => {
    document.getElementById("scout-query")?.focus();
    document
      .getElementById("hero-search")
      ?.scrollIntoView({
        block: "center",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
  };
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation}>
        <div className="ps-landing">
          {openingSample && <GenerationOverlay status="Opening the sample report…"/>}
          <ChessParticles/>

          <a className="ps-skip" href="#landing-main">
            Skip to content
          </a>
          <header className="ps-nav">
            <a href="/" className="ps-brand" aria-label="PrepSuite home">
              <Brand/>
            </a>
            <nav aria-label="Primary">
              <a href="#how-it-works">How it works</a>
              <a href="#samples">Sample reports</a>
              <a href="#questions">FAQ</a>
            </nav>
            {p.user ? (
              <button className="ps-btn ps-small" onClick={p.onGetStarted}>
                Dashboard <ArrowUpRight size={16} />
              </button>
            ) : (
              <a
                className="ps-btn ps-small"
                href="#access"
                onClick={() => setAuthMode("login")}
              >
                Sign in <ArrowUpRight size={16} />
              </a>
            )}
          </header>
          <main id="landing-main">
            <section className="ps-hero">
              <div className="ps-hero-copy">
                <m.div {...entrance(0)} className="ps-eyebrow">
                  <span />
                  CHESS INTELLIGENCE. HUMAN AMBITION.
                </m.div>
                <h1 aria-label="One move ahead. Before move one.">
                  <span className="ps-headline-line"><m.span {...entrance(.08)}>One move</m.span></span>
                  <span className="ps-headline-line ps-headline-accent"><m.span {...entrance(.18)}>ahead.</m.span></span>
                  <m.em {...entrance(.28)}>Before move one.</m.em>
                </h1>
                <m.p {...entrance(.36)} className="ps-lead">
                  Connect tournament players with their Chess.com and Lichess accounts. Combine their online and over-the-board games, discover their patterns, and arrive with a plan.
                </m.p>
                <m.form
                  {...entrance(.44)}
                  id="hero-search"
                  className="ps-search"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (query.trim())
                      p.onGuestSearch?.(
                        query.trim(),
                        mode === "chess.com" ? query.trim() : undefined,
                        mode === "lichess" ? query.trim() : undefined,
                      );
                  }}
                >
                  <div
                    className="ps-search-modes"
                    role="group"
                    aria-label="Search by"
                  >
                    {(["name", "chess.com", "lichess"] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={mode === v}
                        onClick={() => setMode(v)}
                      >
                        {v === "name"
                          ? "Player name"
                          : v === "chess.com"
                            ? "Chess.com"
                            : "Lichess"}
                      </button>
                    ))}
                  </div>
                  <label className="sr-only" htmlFor="scout-query">
                    {mode === "name" ? "Player name" : "Username"}
                  </label>
                  <div className="ps-search-field">
                    <Search size={20} />
                    <input
                      id="scout-query"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={
                        mode === "name"
                          ? "Player name"
                          : "Enter their username"
                      }
                      required
                      maxLength={200}
                      autoComplete="off"
                    />
                    <button
                      className="ps-btn"
                      disabled={!query.trim() || p.isGuestAnalyzing}
                      aria-label="Scout opponent"
                    >
                      {p.isGuestAnalyzing ? (
                        <Loader2 className="animate-spin" size={18} />
                      ) : (
                        <>
                          <span>Scout</span>
                          <ArrowRight size={18} />
                        </>
                      )}
                    </button>
                  </div>
                  <p className="ps-search-note" role="status">
                    {p.isGuestAnalyzing
                      ? p.guestAnalyzingStatus
                      : "Free preview · Up to 500 games · No card required"}
                  </p>
                </m.form>
                <button
                  className="ps-text-link"
                  onClick={() => sample("magnus-carlsen")}
                  disabled={!!openingSample}
                >
                  Or explore a sample report <ArrowUpRight size={16} />
                </button>
              </div>
              <ChessScene onOpen={() => void sample("magnus-carlsen")} pending={!!openingSample} />
            </section>
            <div className="ps-sources">
              <span>ONE WORKSPACE. A WIDER VIEW.</span>
              <div>
                Chess.com <i /> Lichess <i /> FIDE <i /> OTB games
              </div>
              <span>Availability varies by player</span>
            </div>
            <section className="ps-section" id="how-it-works">
              <m.div {...reveal} className="ps-section-heading">
                <span className="ps-eyebrow">
                  LESS SEARCHING. MORE PREPARING.
                </span>
                <h2>From a name to a game plan.</h2>
                <p>
                  A clear view of your opponent, without twenty browser tabs.
                </p>
              </m.div>
              <div className="ps-steps">
                {[
                  {
                    n: "01",
                    icon: Search,
                    title: "Find your opponent",
                    text: "Search by name or go straight to a Chess.com or Lichess username. Review linked accounts and available sources.",
                  },
                  {
                    n: "02",
                    icon: Layers3,
                    title: "Read the patterns",
                    text: "Explore opening frequency, wins, draws, and losses. Filter the games to match the chess you’re preparing to play.",
                  },
                  {
                    n: "03",
                    icon: Target,
                    title: "Make your next move",
                    text: "Follow the evidence into real games, practice the opening lines, and keep the report ready for your next round.",
                  },
                ].map((x, i) => (
                  <m.article {...reveal} transition={{duration:reduced?0:.6,delay:reduced?0:i*.1}} whileHover={reduced?undefined:{y:-8,scale:1.015,transition:{type:'spring',stiffness:280,damping:22}}} key={x.n}>
                    <div className="ps-step-top">
                      <x.icon size={24} />
                      <span>{x.n}</span>
                    </div>
                    <h3>{x.title}</h3>
                    <p>{x.text}</p>
                  </m.article>
                ))}
              </div>
            </section>
            <section className="ps-section ps-sample-section" id="samples">
              <div className="ps-section-heading">
                <span className="ps-eyebrow">SEE IT FOR YOURSELF</span>
                <h2>A report is worth a thousand claims.</h2>
                <p>
                  Explore real sample reports. No account needed. Ratings and
                  games reflect each report’s snapshot.
                </p>
              </div>
              <div className="ps-samples">
                {samples.map((x, i) => (
                  <m.a
                    {...reveal}
                    transition={{duration:reduced?0:.5,delay:reduced?0:(i%4)*.06}}
                    whileHover={reduced?undefined:{y:-5,transition:{type:'spring',stiffness:320,damping:24}}}
                    whileTap={reduced?undefined:{scale:.98}}
                    key={x.slug}
                    href={`/featured/${x.slug}`}
                    aria-disabled={!!openingSample}
                    onClick={event => {
                      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                      event.preventDefault();
                      if (!openingSample) void sample(x.slug);
                    }}
                  >
                    <span className="ps-sample-initial">
                      {x.name
                        .split(" ")
                        .map((w) => w[0])
                        .slice(0, 2)
                        .join("")}
                    </span>
                    <span>
                      <small>{x.title || "CHESS PLAYER"}</small>
                      <strong>{x.name}</strong>
                      <span>Explore scouting report</span>
                    </span>
                    {openingSample === x.slug ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <ArrowUpRight />
                    )}
                  </m.a>
                ))}
              </div>
            </section>
            <section className="ps-section ps-principles">
              <div>
                <span className="ps-eyebrow">PREPARATION YOU CAN INSPECT</span>
                <h2>
                  Trust the evidence.
                  <br />
                  <span>Then trust your game.</span>
                </h2>
              </div>
              <div>
                {[
                  "See the games behind each opening statistic.",
                  "Keep online and over-the-board results in context.",
                  "Treat small samples as clues—not conclusions.",
                  "Practice before the round. Play independently at the board.",
                ].map((t, i) => (
                  <m.p {...reveal} transition={{duration:reduced?0:.5,delay:reduced?0:i*.1}} key={t}>
                    <Check size={18} />
                    {t}
                  </m.p>
                ))}
              </div>
            </section>
            <section className="ps-section ps-faq" id="questions">
              <div className="ps-section-heading">
                <span className="ps-eyebrow">A FEW THINGS TO KNOW</span>
                <h2>Before your first search.</h2>
              </div>
              {[
                {
                  q: "What can I try for free?",
                  a: "The guest preview includes up to 500 games. Create a free account for saved reports, repertoire exploration, and the full workspace. Availability depends on the player’s public game history.",
                },
                {
                  q: "Will it find every player’s online accounts?",
                  a: "No. Account discovery depends on public evidence. Always review linked accounts, and use a known username when possible. A player’s identity and a suggested online account are different things.",
                },
                {
                  q: "Does a low win rate mean a weak opening?",
                  a: "Not necessarily. Draws, opponent strength, color, time control, and sample size all matter. PrepSuite presents historical results as preparation clues, not proof that an opening is bad.",
                },
                {
                  q: "Can I use it during a tournament game?",
                  a: "Use PrepSuite before your game. Follow your tournament’s rules and do not consult outside assistance during play.",
                },
              ].map((x) => (
                <MotionDisclosure key={x.q} question={x.q} answer={x.a}/>
              ))}
            </section>
            {!p.user && (
              <section className="ps-section ps-access" id="access">
                <div>
                  <span className="ps-eyebrow">
                    YOUR PREPARATION, IN ONE PLACE
                  </span>
                  <h2>
                    Come to the board
                    <br />
                    with a plan.
                  </h2>
                  <p>
                    Save opponents, explore their repertoire, and build a
                    preparation routine that stays with you.
                  </p>
                </div>
                <div className="ps-auth">
                  <h3>
                    {success
                      ? "Check your inbox"
                      : authMode === "signup"
                        ? "Create your free account"
                        : "Welcome back"}
                  </h3>
                  {success ? (
                    <p>
                      A verification email has been requested. Follow the link
                      to finish signing up.
                    </p>
                  ) : (
                    <>
                      <button
                        className="ps-btn ps-google"
                        disabled={pending}
                        onClick={() => login("google")}
                      >
                        Continue with Google <ArrowUpRight size={17} />
                      </button>
                      <div className="ps-divider">or continue with email</div>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const data = new FormData(e.currentTarget);
                          void login({
                            email: String(data.get("email")),
                            password: String(data.get("password")),
                            isNewUser: authMode === "signup",
                          });
                        }}
                      >
                        <label htmlFor="auth-email">Email</label>
                        <input
                          id="auth-email"
                          name="email"
                          type="email"
                          autoComplete="email"
                          required
                          placeholder="you@example.com"
                        />
                        <label htmlFor="auth-password">Password</label>
                        <input
                          id="auth-password"
                          name="password"
                          type="password"
                          autoComplete={
                            authMode === "signup"
                              ? "new-password"
                              : "current-password"
                          }
                          minLength={authMode === "signup" ? 6 : undefined}
                          required
                        />
                        <button className="ps-btn" disabled={pending}>
                          {pending
                            ? "Please wait…"
                            : authMode === "signup"
                              ? "Create account"
                              : "Sign in"}
                          <ArrowRight size={17} />
                        </button>
                      </form>
                      <button
                        className="ps-text-link"
                        onClick={() => {
                          setAuthMode(
                            authMode === "signup" ? "login" : "signup",
                          );
                          setError("");
                        }}
                      >
                        {authMode === "signup"
                          ? "Already have an account? Sign in"
                          : "New here? Create an account"}
                      </button>
                    </>
                  )}
                  {error && (
                    <p role="alert" className="ps-error">
                      {error}
                    </p>
                  )}
                  <p className="ps-auth-note">
                    By continuing, you agree to our{" "}
                    <a href="/terms-of-service" onClick={event => navigatePublic(event,p.onShowTermsOfService)}>Terms</a> and
                    acknowledge our{" "}
                    <a href="/privacy-policy" onClick={event => navigatePublic(event,p.onShowPrivacyPolicy)}>
                      Privacy Policy
                    </a>
                    .
                  </p>
                </div>
              </section>
            )}
            {p.user && (
              <section className="ps-bottom-cta">
                <h2>Your next opponent is waiting.</h2>
                <button className="ps-btn" onClick={scrollSearch}>
                  Start preparing <ArrowRight size={18} />
                </button>
              </section>
            )}
          </main>
          <footer className="ps-footer">
            <a href="/" className="ps-brand" aria-label="PrepSuite.ai">
              <Brand/>
            </a>
            <p>Make preparation part of your game.</p>
            <div>
              <a href="/about" onClick={event => navigatePublic(event,p.onShowAboutPrepSuite)}>About</a>
              <a href="/privacy-policy" onClick={event => navigatePublic(event,p.onShowPrivacyPolicy)}>Privacy</a>
              <a href="/terms-of-service" onClick={event => navigatePublic(event,p.onShowTermsOfService)}>Terms</a>
              <span>© {new Date().getFullYear()} PrepSuite</span>
            </div>
          </footer>
        </div>
      </LazyMotion>
    </MotionConfig>
  );
}
