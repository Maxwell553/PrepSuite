import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface AboutPrepSuiteProps {
  onBack: () => void;
}

const AboutPrepSuite: React.FC<AboutPrepSuiteProps> = ({ onBack }) => {
  return (
    <div className="min-h-screen bg-slate-950 dark:bg-slate-950 bg-white text-slate-100 dark:text-slate-100 text-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md bg-slate-950/80 dark:bg-slate-950/80 bg-white/80 border-b border-slate-800 dark:border-slate-800 border-gray-200 p-4">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-400 dark:text-slate-400 text-gray-600 hover:text-white dark:hover:text-white hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Back</span>
          </button>
          <h1 className="text-xl font-semibold text-white dark:text-white text-gray-900">Why PrepSuite</h1>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-4xl mx-auto py-8 px-6">
        <div className="prose prose-invert dark:prose-invert max-w-none">
          {/* Logo */}
          <div className="flex justify-center mb-12 select-none">
            <img src="/NewLogo.jpg" alt="PrepSuite.ai" className="h-10 w-auto select-none" draggable={false} />
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold mb-8 text-white dark:text-white text-gray-900">Why I Made PrepSuite</h1>

          {/* Main Content */}
          <div className="space-y-6 text-slate-300 dark:text-slate-300 text-gray-700 leading-relaxed">
            <p>
              Hi! My name's Max Ingargiola, and I'm the creator of PrepSuite.ai. I'm 17 and I live in the United States.
            </p>

            <p>
              I've been a serious chess player for many years. I'm currently around 1950 FIDE and 2150 USCF, and I regularly compete in tournaments. Because I take the game seriously, preparation against my opponents has always been a part of the way I approach competition. Before events and during tournaments, upon receiving a pairing I would spend time trying to research my opponents so I could understand their openings and playing styles.
            </p>

            <p>
              The problem was that this process was often very inefficient and very inaccurate. If you've done this, you'll know what I mean; searching through databases and online sites all over to try to find your opponent's games and history, or even trying to find if they are an active tournament player! Most times, I couldn't find useful information at all, which meant I had to walk into games with no preparation done at all.
            </p>

            <p>
              I created PrepSuite to solve that problem. The goal was to give serious, competitive chess players a faster and more effective way to prepare for their opponents. Now, instead of digging through all those websites and databases, you can simply enter a player's name and get usable, actionable information quickly. What used to be a tedious process is now something that you can do in mere seconds.
            </p>

            <p>
              Though this wasn't the original intent, you can even use PrepSuite to analyze your own games and tendencies. It's a great way to see what openings give you particular trouble and where your weaknesses lie.
            </p>

            <p>
              Good luck with your upcoming games, and I hope that PrepSuite helps you prepare better.
            </p>

            {/* Signature — handwritten style, white text */}
            <div className="mt-16 pt-8 border-t border-slate-700/50 dark:border-slate-700/50 border-gray-200/50 flex flex-col items-end">
              <p
                className="text-3xl md:text-4xl font-medium text-white dark:text-white"
                style={{ fontFamily: "'Dancing Script', cursive" }}
              >
                Max Ingargiola
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-500 text-gray-500 mt-1">Creator, PrepSuite.ai</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutPrepSuite;
