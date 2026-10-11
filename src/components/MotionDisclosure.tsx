import { useId, useState } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
export default function MotionDisclosure({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const reduced = useReducedMotion();
  return <div className="ps-disclosure">
    <button aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      {question}<m.span animate={{rotate:open?180:0}} transition={{duration:reduced?0:.2}}><ChevronDown size={18}/></m.span>
    </button>
    <AnimatePresence initial={false}>
      {open && <m.div id={id} initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} transition={{duration:reduced?0:.24,ease:[.22,1,.36,1]}} style={{overflow:'hidden'}}><p>{answer}</p></m.div>}
    </AnimatePresence>
  </div>;
}
