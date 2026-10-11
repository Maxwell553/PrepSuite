import type { InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { min: number; max: number; value: number };

/** A native, keyboard-accessible range with a solid progress track. */
export default function PremiumRange({ min, max, value, ...props }: Props) {
  const progress = max > min ? Math.max(0, Math.min(100, (value - min) / (max - min) * 100)) : 0;
  return <div className="prep-range" data-disabled={props.disabled || undefined}>
    <div className="prep-range-track" aria-hidden="true"><span style={{ width: `${progress}%` }}/></div>
    <input {...props} type="range" min={min} max={max} value={value}/>
  </div>;
}
