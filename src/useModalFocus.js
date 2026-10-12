import { useEffect, useRef } from 'react';

export function useModalFocus(open, ref, onClose) {
  const closeRef = useRef(onClose);
  const priorRef = useRef(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current) priorRef.current = document.activeElement;
  wasOpen.current = open;
  closeRef.current = onClose;
  useEffect(() => {
    if (!open || !ref.current) return undefined;
    const prior = priorRef.current;
    const modal = ref.current;
    const focusable = () => [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')];
    focusable()[0]?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current?.(); }
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); if (prior?.isConnected) prior.focus(); };
  }, [open, ref]);
}
