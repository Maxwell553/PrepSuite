import { useEffect, useMemo, useRef, useState } from 'react';
import { m, useInView, useReducedMotion, useSpring } from 'motion/react';
import ChessPiece from './ChessPiece';
import { Chess } from 'chess.js';
import { ArrowRight, Pause, Play, RotateCcw, SkipForward } from 'lucide-react';

const lines = [
  { name: 'Italian Game', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'], note: 'Develop with purpose. Put the center in your sights.' },
  { name: 'Queen’s Gambit', moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6'], note: 'Challenge the center. Know the structure before move one.' },
];


/** An illustrative, legal opening sequence. No player statistics are invented. */
export default function ChessScene({ onOpen, pending }: { onOpen: () => void; pending: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.25 });
  const reduced = useReducedMotion();
  const [playing, setPlaying] = useState(true);
  const [line, setLine] = useState(0);
  const [ply, setPly] = useState(0);
  const rx = useSpring(0, { stiffness: 120, damping: 25 });
  const ry = useSpring(0, { stiffness: 120, damping: 25 });
  const current = lines[line];
  const position = useMemo(() => {
    const chess = new Chess();
    const pieces = chess.board().flat().filter(Boolean).map(p => ({...p!, id:p!.square}));
    let last: ReturnType<Chess['move']> | undefined;
    for (const san of current.moves.slice(0, ply)) {
      last = chess.move(san);
      const piece = pieces.find(p => p.square === last!.from);
      if (piece) piece.square = last.to;
    }
    return { pieces, last };
  }, [current, ply]);
  useEffect(() => {
    if (!playing || reduced || !inView) return;
    const timer = window.setInterval(() => setPly(p => (p + 1) % (current.moves.length + 1)), 2200);
    return () => window.clearInterval(timer);
  }, [playing, reduced, inView, current]);
  return <div className="ps-scene" ref={ref}>
    <m.div className="ps-chess-console" style={{rotateX:rx, rotateY:ry}} onPointerMove={e => {
      if (reduced || e.pointerType !== 'mouse') return;
      const rect = e.currentTarget.getBoundingClientRect();
      rx.set(((e.clientY-rect.top)/rect.height-.5)*-7);
      ry.set(((e.clientX-rect.left)/rect.width-.5)*7);
    }} onPointerLeave={() => {rx.set(0);ry.set(0);}}>
      <div className="ps-console-header"><span><i /> THE PREPARATION LAB</span><span>01 / OPENINGS</span></div>
      <div className="ps-line-tabs" role="group" aria-label="Illustrative opening">
        {lines.map((l,i) => <button key={l.name} aria-pressed={line===i} onClick={() => {setLine(i);setPly(0);}}>{l.name}</button>)}
      </div>
      <div className="ps-stage" role="img" aria-label={`${current.name}, ${ply ? `after ${current.moves.slice(0,ply).join(', ')}` : 'starting position'}`}>
        <div className="ps-stage-grid">{Array.from({length:64},(_,i)=><span key={i} className={(Math.floor(i/8)+i%8)%2?'dark':'light'} />)}</div>
        {position.last && <m.div className="ps-last-square" initial={false} animate={{left:`${(position.last.to.charCodeAt(0)-97)*12.5}%`,top:`${(8-Number(position.last.to[1]))*12.5}%`}} transition={{duration:reduced?0:.35}} />}
        {position.pieces.map(p => <m.span key={p.id} className={`ps-chess-piece ${p.color==='w'?'is-white':'is-black'}`} initial={false} animate={{x:(p.square.charCodeAt(0)-97)*100+'%',y:(8-Number(p.square[1]))*100+'%'}} transition={reduced?{duration:0}:{type:'spring',stiffness:170,damping:24}}><ChessPiece type={p.type} color={p.color}/></m.span>)}
        <div className="ps-board-files" aria-hidden="true">{'abcdefgh'.split('').map(f=><span key={f}>{f}</span>)}</div>
      </div>
      <div className="ps-sequence" aria-label="Opening moves">{current.moves.map((move,i)=><button key={i} aria-label={`Show position after ${i+1} half-moves: ${move}`} aria-pressed={ply===i+1} onClick={() => {setPly(i+1);setPlaying(false);}}><small>{i%2===0?`${i/2+1}.`:''}</small>{move}</button>)}</div>
      <div className="ps-playback"><span>ILLUSTRATIVE LINE</span><div>
        <button aria-label="Restart opening animation" onClick={()=>setPly(0)}><RotateCcw size={15}/></button>
        <button aria-label={playing&&!reduced?'Pause opening animation':'Play opening animation'} disabled={!!reduced} onClick={()=>setPlaying(!playing)}>{playing&&!reduced?<Pause size={15}/>:<Play size={15}/>}</button>
        <button aria-label="Next opening move" onClick={()=>{setPlaying(false);setPly(p=>(p+1)%(current.moves.length+1));}}><SkipForward size={15}/></button>
      </div></div>
      <div className="ps-console-footer"><p>{current.note}</p><button className="ps-scene-cta" onClick={onOpen} disabled={pending}>{pending?'Opening report…':'Open the full sample report'}<ArrowRight size={18}/></button></div>
    </m.div>
  </div>;
}
