import { useEffect, useRef, useState } from 'react';

export const useScrollAnimation = (options?: IntersectionObserverInit) => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkInView = () => {
      const el = ref.current;
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      return rect.top < windowHeight && rect.bottom > 0;
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      {
        threshold: 0.05,
        rootMargin: '0px 0px -50px 0px',
        ...options,
      }
    );

    const currentRef = ref.current;
    if (currentRef) {
      observer.observe(currentRef);
      // Fallback 1: if element is in view on load, show it (handles browsers where
      // IntersectionObserver fires late or not at all)
      const fallbackId = window.setTimeout(() => {
        if (checkInView()) setIsVisible(true);
      }, 150);
      // Fallback 2: always show after 800ms to prevent permanent whiteout if
      // IntersectionObserver never fires (e.g. some Safari/embed scenarios)
      const forceShowId = window.setTimeout(() => setIsVisible(true), 800);
      return () => {
        window.clearTimeout(fallbackId);
        window.clearTimeout(forceShowId);
        observer.unobserve(currentRef);
      };
    }
  }, []);

  return { ref, isVisible };
};
