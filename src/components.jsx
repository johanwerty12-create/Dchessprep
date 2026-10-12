import { Component, useEffect, useRef } from 'react';
import { useModalFocus } from './useModalFocus.js';

export class WorkspaceBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <section className="panel empty-state" role="alert"><h2>This workspace couldn’t open.</h2><p>Return to Today or open your library to export a backup. Reload if the problem continues.</p><div className="review-title-actions"><Button onClick={() => this.props.onNavigate('home')}>Return to Today</Button><Button onClick={() => this.props.onNavigate('library')}>Open library</Button><Button onClick={() => window.location.reload()}>Reload</Button></div></section>;
  }
}

const paths = {
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  board: 'M4 4h16v16H4zM4 9h16M4 14h16M9 4v16M14 4v16',
  review: 'M4 19V5m0 14h17M7 15l4-5 3 2 5-7',
  book: 'M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 1 4 17.5zM4 17.5A2.5 2.5 0 0 1 6.5 15H20M8 6h8M8 9h6',
  clash: 'M12 3v18M5 7c0 2.2 3.1 4 7 4s7-1.8 7-4-3.1-4-7-4-7 1.8-7 4Zm0 0v5c0 2.2 3.1 4 7 4s7-1.8 7-4V7M7 20h10',
  training: 'M12 3v4m0 10v4m9-9h-4M7 12H3m15.4-6.4-2.8 2.8m-7.2 7.2-2.8 2.8m12.8 0-2.8-2.8m-7.2-7.2-2.8-2.8M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  trophy: 'M8 21h8m-4-4v4M7 4h10v4a5 5 0 0 1-10 0V4Zm0 2H4v2a4 4 0 0 0 4 4m9-6h3v2a4 4 0 0 1-4 4',
  library: 'M5 3h14a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2zm0 14H3v2a2 2 0 0 0 2 2m4-14h7m-7 4h7',
  search: 'm20 20-4.3-4.3M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z',
  plus: 'M12 5v14m-7-7h14',
  upload: 'M12 16V4m0 0L7 9m5-5 5 5M4 20h16',
  download: 'M12 4v12m0 0 5-5m-5 5-5-5M4 20h16',
  chevron: 'm9 18 6-6-6-6',
  down: 'm6 9 6 6 6-6',
  back: 'M19 12H5m7 7-7-7 7-7',
  forward: 'M5 12h14m-7-7 7 7-7 7',
  play: 'm8 5 11 7-11 7z',
  stop: 'M6 6h12v12H6z',
  save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2ZM17 21v-8H7v8M7 3v5h8',
  close: 'm18 6-12 12M6 6l12 12',
  check: 'm5 12 4 4L19 6',
  sun: 'M12 3v2m0 14v2m9-9h-2M5 12H3m15.4-6.4-1.4 1.4M7 17l-1.4 1.4m12.8 0L17 17M7 7 5.6 5.6M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  moon: 'M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z',
  more: 'M12 5h.01M12 12h.01M12 19h.01',
  trash: 'M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z',
  external: 'M14 3h7v7m0-7L10 14m-4-8H4a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-2',
  rotate: 'M3 12a9 9 0 1 0 2.6-6.4L3 8m0-5v5h5',
  clock: 'M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  shield: 'M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Zm-4-11 3 3 5-5',
  menu: 'M4 6h16M4 12h16M4 18h16',
  spark: 'm12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Zm7 12 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z',
};

export function Icon({ name, size = 18, strokeWidth = 1.7, className = '' }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.spark} /></svg>;
}

export function Button({ children, variant = 'secondary', className = '', icon, ...props }) {
  return <button className={`button button-${variant} ${className}`.trim()} {...props}>{icon && <Icon name={icon} size={16} />}{children}</button>;
}

export function IconButton({ label, icon, ...props }) {
  return <button className="icon-button" type="button" aria-label={label} title={label} {...props}><Icon name={icon} /></button>;
}

export function Pill({ children, tone = 'neutral' }) { return <span className={`pill pill-${tone}`}>{children}</span>; }

export function SectionTitle({ eyebrow, title, description, action }) {
  return <div className="section-title-row"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="section-description">{description}</p>}</div>{action && <div className="section-title-action">{action}</div>}</div>;
}

export function EmptyState({ icon = 'spark', title, description, action }) {
  return <div className="empty-state"><div className="empty-icon"><Icon name={icon} size={21} /></div><h3>{title}</h3><p>{description}</p>{action}</div>;
}

export function Dialog({ open, onClose, title, eyebrow, children, width = 'medium' }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    document.body.classList.add('dialog-open');
    return () => { document.body.classList.remove('dialog-open'); };
  }, [open]);
  // Unhide the mobile navigation before restoring focus to its opener.
  useModalFocus(open, dialogRef, onClose);
  if (!open) return null;
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} className={`dialog dialog-${width}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div className="dialog-header"><div><p className="eyebrow">{eyebrow}</p><h2 id="dialog-title">{title}</h2></div><IconButton label="Close dialog" icon="close" onClick={onClose} /></div>{children}</section></div>;
}
