import Brand from './Brand';
import React from 'react';
import { Search, LayoutDashboard, History, ExternalLink, ArrowUpRight } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

interface SidebarProps {
  activeTab: 'search' | 'dashboard' | 'history';
  setActiveTab: (tab: 'search' | 'dashboard' | 'history') => void;
  onLogoClick?: () => void;
  isAnalyzing?: boolean;
}
export default function Sidebar({activeTab,setActiveTab,onLogoClick,isAnalyzing}:SidebarProps) {
  const reduced = useReducedMotion();
  const items = [
    {id:'search',icon:Search,label:'Search Opponent',number:'01'},
    {id:'dashboard',icon:LayoutDashboard,label:'Active Report',number:'02'},
    {id:'history',icon:History,label:'History',number:'03'},
  ] as const;
  return <aside className="prep-sidebar hidden md:flex">
    <button disabled={isAnalyzing} onClick={onLogoClick} className="prep-wordmark" aria-label="PrepSuite home"><Brand/><span className="prep-home-hint" aria-hidden="true"><ArrowUpRight size={16}/></span></button>
    <div className="prep-sidebar-caption">YOUR PREPARATION ROOM</div>
    <nav aria-label="Workspace">{items.map(item => {
      const selected=activeTab===item.id;
      const disabled=!!isAnalyzing&&(item.id==='search'||item.id==='history');
      return <button key={item.id} aria-current={selected?'page':undefined} disabled={disabled} onClick={()=>setActiveTab(item.id)} className="prep-nav-item">
        {selected && <motion.span className="prep-nav-active" layoutId="workspace-selection" transition={reduced?{duration:0}:{type:'spring',stiffness:380,damping:34}}/>}
        <item.icon size={18}/><span>{item.label}</span><small>{item.number}</small>
      </button>;
    })}</nav>

    <div className="prep-sidebar-links"><a href="https://www.uschess.org" target="_blank" rel="noopener noreferrer">USCF Portal<ExternalLink size={13}/></a><a href="https://fide.com" target="_blank" rel="noopener noreferrer">FIDE Portal<ExternalLink size={13}/></a></div>
  </aside>;
}
