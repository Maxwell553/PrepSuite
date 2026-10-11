import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import ChessParticles from './ChessParticles';

/** Keep the workspace visible, but lock pointer, keyboard and route navigation during work. */
export default function GenerationOverlay({status}: {status: string}) {
  const ref=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    const root=document.getElementById('root');
    const wasInert=root?.inert ?? false;
    const previous=document.activeElement as HTMLElement | null;
    if(root)root.inert=true;
    ref.current?.focus();
    const location=window.location.pathname+window.location.search+window.location.hash;
    if(root)root.dataset.lockedRoute=location;
    const unload=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',unload);
    return()=>{
      if(root){root.inert=wasInert;delete root.dataset.lockedRoute;}
      window.removeEventListener('beforeunload',unload);
      if(previous?.isConnected)previous.focus();
    };
  },[]);
  return createPortal(<div className="prep-generation-overlay" ref={ref} role="dialog" aria-modal="true" aria-label="Report in progress" tabIndex={-1} onKeyDown={event=>{if(event.key==='Tab'||event.key==='Escape'){event.preventDefault();ref.current?.focus();}}}>
    <div className="prep-generation-dialog">
      <div className="prep-generation-piece"><ChessParticles mode="generation"/></div>
      <div><span className="prep-progress-label">PREPARING YOUR REPORT</span><h2>Finding your next advantage.</h2><p role="status" aria-live="polite">{status || 'Finding player information…'}</p><small>You can explore the report as soon as it’s ready.</small></div>
    </div>
  </div>,document.body);
}
