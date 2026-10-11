import { forwardRef } from 'react';
import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react';

type Props = HTMLMotionProps<'div'> & { delay?: number; hoverLift?: boolean; reveal?: boolean };
/** Shared visual rhythm for cards, pages and dialogs; leaves semantic content intact. */
const MotionSurface = forwardRef<HTMLDivElement, Props>(function MotionSurface(
  { children, delay = 0, hoverLift = false, reveal = true, className = '', ...props }, ref,
) {
  const reduced = useReducedMotion();
  return <motion.div ref={ref}
    className={`prep-motion-surface ${className}`}
    initial={reveal && !reduced ? { opacity: .65, y: 14 } : false}
    whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .05 }}
    transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 220, damping: 27, delay }}
    whileHover={hoverLift && !reduced ? { y: -3, transition: { type: 'spring', stiffness: 360, damping: 26 } } : undefined}
    {...props}>{children}</motion.div>;
});
export default MotionSurface;
