import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** Portal keeps dialogs outside animated/hidden report panels and traps focus locally. */
export default function PracticeDialog({title,onClose,wide=false,children}:{title:string;onClose:()=>void;wide?:boolean;children:ReactNode}) {
  const ref=useRef<HTMLDivElement>(null);
  const closeRef=useRef(onClose);closeRef.current=onClose;
  useLayoutEffect(()=>{
    const root=document.getElementById('root');
    const previous=document.activeElement as HTMLElement|null;
    const wasInert=root?.inert ?? false;
    if(root)root.inert=true;
    ref.current?.focus();
    return()=>{if(root)root.inert=wasInert;if(previous?.isConnected)previous.focus();};
  },[]);
  return createPortal(<div className="prep-practice-backdrop" onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <div ref={ref} className={`prep-practice-dialog ${wide?'prep-practice-wide':''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onKeyDown={event=>{
      if(event.key==='Escape'){event.stopPropagation();closeRef.current();}
      if(event.key==='Tab'){
        const controls=Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]')||[]).filter(el=>el.getClientRects().length>0);
        const first=controls[0],last=controls[controls.length-1];
        if(!first){event.preventDefault();return;}
        if(event.shiftKey&&(document.activeElement===first||document.activeElement===ref.current)){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===ref.current)){event.preventDefault();first.focus();}
      }
    }}>
      <header><h2>{title}</h2><button type="button" className="prep-practice-close" aria-label="Close practice" onClick={onClose}><X size={20}/></button></header>
      {children}
    </div>
  </div>,document.body);
}
