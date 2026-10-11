/** Solid vector pieces: identical silhouettes on every platform, without font glyphs. */
export default function ChessPiece({ type, color = 'w' }: { type: string; color?: 'w' | 'b' }) {
  const fill = color === 'w' ? '#fffdf8' : '#252238';
  const stroke = color === 'w' ? '#35294f' : '#f0e8ff';
  const paths: Record<string, string> = {
    p: 'M19 25 C19 21 29 21 29 25 L27 29 L31 38 H17 L21 29 Z',
    r: 'M14 10 H20 V16 H22 V10 H26 V16 H28 V10 H34 V22 L30 26 V36 H18 V26 L14 22 Z',
    n: 'M16 37 L18 29 L12 28 L10 23 L18 13 L21 8 L26 12 C36 14 36 28 33 37 Z',
    b: 'M24 8 C19 13 14 17 17 23 Q19 27 22 28 L18 37 H30 L26 28 Q31 25 32 21 C33 17 28 12 24 8 Z',
    q: 'M14 17 L20 23 L24 13 L28 23 L34 17 L30 36 H18 Z',
    k: 'M18 17 Q12 16 14 24 L20 30 L18 37 H30 L28 30 L34 24 Q36 16 30 17 Q27 17 24 22 Q21 17 18 17 Z',
  };
  return <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" fill={fill} stroke={stroke} strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round">
    <path d={paths[type] || paths.p}/>
    {type === 'p' && <circle cx="24" cy="15.5" r="6.5"/>}
    {type === 'n' && <><path d="M21 18 L24 18 M19 25 Q25 23 28 19" fill="none"/><circle cx="22" cy="17" r="1" fill={stroke} stroke="none"/></>}
    {type === 'b' && <path d="M25 14 L21 20" fill="none"/>}
    {type === 'q' && <>{[[13,14],[24,10],[35,14]].map(([cx,cy])=><circle key={cx} cx={cx} cy={cy} r="3"/>)}</>}
    {type === 'k' && <path d="M22 7 H26 V10 H30 V14 H26 V19 H22 V14 H18 V10 H22 Z"/>}
    <path d="M17 36 H31 L34 41 H14 Z"/>
    <path d="M14 41 H34 V44 H14 Z"/>
  </svg>;
}
