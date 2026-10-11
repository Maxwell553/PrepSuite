import { useEffect, useRef } from 'react';
import { useAnimationFrame, useInView, useReducedMotion } from 'motion/react';

type Point = { x: number; y: number; z: number; normal?: { x: number; y: number; z: number } };
type PieceKind = 'bishop' | 'queen' | 'king' | 'rook';
// Lathed surfaces plus distinct crowns, a bishop's slit and a king's cross.
function pieceCloud(kind: PieceKind): Point[] {
  const points: Point[] = [];
  const base = [[0,.29],[.055,.32],[.12,.29],[.18,.23],[.24,.21],[.40,.15],[.62,.10],[.77,.09],[.83,.15],[.88,.18],[.93,.13]];
  const tops: Record<PieceKind,number[][]> = {
    bishop:[[.99,.12],[1.10,.19],[1.24,.14],[1.40,0]],
    queen:[[1.00,.15],[1.08,.20],[1.25,.25],[1.32,.26]],
    king:[[1.01,.18],[1.09,.16],[1.17,.08]],
    rook:[[.99,.24],[1.05,.27],[1.24,.27]],
  };
  const profile=[...base,...tops[kind]];
  const height=profile[profile.length-1][0];
  for(let ring=0;ring<80;ring++) {
    const y=ring/79*height;
    let edge=profile.findIndex(v=>v[0]>=y);if(edge<1)edge=1;
    const a=profile[edge-1],b=profile[edge];
    const r=a[1]+(b[1]-a[1])*(y-a[0])/(b[0]-a[0]);
    for(let j=0;j<36;j++) {
      const theta=j/36*Math.PI*2;
      if(kind==='rook'&&y>1.11&&j%9>5)continue;
      if(kind==='queen'&&y>1.17&&y>1.23+.09*Math.cos(theta*6))continue;
      const x=Math.cos(theta)*r,z=Math.sin(theta)*r;
      if(kind==='bishop'&&y>1.1&&Math.abs(x-(y-1.2)*.8)<.025)continue;
      points.push({x,y:.73-y,z});
    }
  }
  if(kind==='king') {
    // A closed extrusion, not two transparent cross-shaped sheets. Cull the
    // rear-facing surfaces below so rotation never reveals a second cross.
    const halfDepth = .025;
    const outline = [
      [-.04,1.16],[.04,1.16],[.04,1.32],[.13,1.32],
      [.13,1.40],[.04,1.40],[.04,1.50],[-.04,1.50],
      [-.04,1.40],[-.13,1.40],[-.13,1.32],[-.04,1.32],
    ];
    for (let row=0;row<=34;row++) for (let col=-13;col<=13;col++) {
      const y=1.16+row*.01,x=col*.01;
      if (Math.abs(x)>.04 && (row<16 || row>24)) continue;
      for (const sign of [-1,1]) points.push({x,y:.73-y,z:sign*halfDepth,normal:{x:0,y:0,z:sign}});
    }
    for (let edge=0;edge<outline.length;edge++) {
      const a=outline[edge],b=outline[(edge+1)%outline.length];
      const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
      const steps=Math.ceil(length/.01);
      for (let along=0;along<=steps;along++) for (let layer=0;layer<=5;layer++) {
        points.push({
          x:a[0]+dx*along/steps,y:.73-(a[1]+dy*along/steps),z:-halfDepth+layer*.01,
          normal:{x:dy/length,y:dx/length,z:0},
        });
      }
    }
  }
  return points;
}
const clouds=[pieceCloud('bishop'),pieceCloud('queen'),pieceCloud('king'),pieceCloud('rook')];

export default function ChessParticles({mode='landing'}: {mode?: 'landing' | 'generation' | 'workspace'}) {
  const ref=useRef<HTMLCanvasElement>(null);
  const inView=useInView(ref);
  const reduced=useReducedMotion();
  const state=useRef({width:0,height:0,last:0,drawn:false,visible:true});
  useEffect(()=>{
    const canvas=ref.current;if(!canvas)return;
    const resize=new ResizeObserver(()=>{
      const {width,height}=canvas.getBoundingClientRect();const dpr=Math.min(window.devicePixelRatio||1,1.5);
      canvas.width=width*dpr;canvas.height=height*dpr;
      canvas.getContext('2d')?.setTransform(dpr,0,0,dpr,0,0);
      Object.assign(state.current,{width,height,drawn:false});
    });
    const visibility=()=>{state.current.visible=!document.hidden;};
    visibility();resize.observe(canvas);document.addEventListener('visibilitychange',visibility);
    return()=>{resize.disconnect();document.removeEventListener('visibilitychange',visibility);};
  },[]);
  useEffect(()=>{state.current.drawn=false;},[reduced]);
  useAnimationFrame(time=>{
    const s=state.current;
    if(!inView||!s.visible||!s.width||(reduced&&s.drawn)||time-s.last<40)return;
    const ctx=ref.current?.getContext('2d');if(!ctx)return;
    s.last=time;s.drawn=true;ctx.clearRect(0,0,s.width,s.height);
    const mobile=s.width<760;
    const compact = mode !== 'landing';
    const fitScale = Math.min(s.width / 1.25, s.height / 1.85);
    const placements = compact ? [[.5,s.height*.52,fitScale,mode==='workspace'?2:1]] : mobile ? [[.80,200,110,2],[.20,1800,125,0]] : [[.51,690,170,0],[.51,290,165,2],[.14,1750,195,1],[.84,2600,195,3]];
    placements.forEach(([horizontal,cy,scale,kind],index)=>{
      const cloud=clouds[kind];
      const cx=s.width*horizontal;
      const angle=(reduced?0:time*.00006)+(index===0?.4:-.3);
      const tilt=index===0?-.22:.22;
      const projected=cloud.flatMap(p=>{
        const x=p.x*Math.cos(angle)+p.z*Math.sin(angle);
        const yawZ=-p.x*Math.sin(angle)+p.z*Math.cos(angle);
        const y=p.y*Math.cos(.18)-yawZ*Math.sin(.18);
        const z=p.y*Math.sin(.18)+yawZ*Math.cos(.18);
        if (p.normal) {
          const nx=p.normal.x*Math.cos(angle)+p.normal.z*Math.sin(angle);
          const nzYaw=-p.normal.x*Math.sin(angle)+p.normal.z*Math.cos(angle);
          const ny=p.normal.y*Math.cos(.18)-nzYaw*Math.sin(.18);
          const nz=p.normal.y*Math.sin(.18)+nzYaw*Math.cos(.18);
          if (nx*-x+ny*-y+nz*(2.8-z)<=0) return [];
        }
        const depth=2.8/(2.8-z);
        return [{x:cx+(x*Math.cos(tilt)-y*Math.sin(tilt))*scale*depth,y:cy+(x*Math.sin(tilt)+y*Math.cos(tilt))*scale*depth,z}];
      }).sort((a,b)=>a.z-b.z);
      for(const p of projected){
        ctx.fillStyle=`rgba(${index%2 ? '133,184,237' : '181,154,238'},${compact ? .40+(p.z+.45)*.4 : .14+(p.z+.45)*.3})`;
        ctx.beginPath();ctx.arc(p.x,p.y,mobile?.85:1.05+Math.max(0,p.z)*.8,0,Math.PI*2);ctx.fill();
      }
    });
  });
  return <canvas ref={ref} className={`ps-chess-particles ${mode!=='landing' ? 'ps-chess-particles-loading' : ''}`} aria-hidden="true"/>;
}
