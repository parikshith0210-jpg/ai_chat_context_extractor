import React, { CSSProperties } from 'react';

export const LogoIcon: React.FC<{ className?: string; style?: CSSProperties }> = ({ className, style }) => (
  <svg className={className} style={style} width="26" height="26" viewBox="0 0 26 26" fill="none" aria-label="Chat Context Extractor logo">
    <rect x="1" y="1" width="24" height="18" rx="4" stroke="currentColor" strokeWidth="1.8" />
    <path d="M8 7h10M8 11h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M8 22l2-3h8a4 4 0 0 0 4-4V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="20" cy="20" r="4.5" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5" />
    <path d="M18.5 20h3M20 18.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const SunIcon: React.FC<{ className?: string; style?: CSSProperties }> = ({ className, style }) => (
  <svg className={className} style={style} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="5" />
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
);

export const MoonIcon: React.FC<{ className?: string; style?: CSSProperties }> = ({ className, style }) => (
  <svg className={className} style={style} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

export const CheckIcon: React.FC<{ className?: string; style?: CSSProperties }> = ({ className, style }) => (
  <svg className={className} style={style} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const CopyIcon: React.FC<{ className?: string; style?: CSSProperties }> = ({ className, style }) => (
  <svg className={className} style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

export const DownloadIcon: React.FC<{ className?: string; style?: CSSProperties }> = ({ className, style }) => (
  <svg className={className} style={style} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

export const PlayIcon: React.FC<{ className?: string; style?: CSSProperties }> = ({ className, style }) => (
  <svg className={className} style={style} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

export const UploadIcon: React.FC<{ className?: string; style?: CSSProperties }> = ({ className, style }) => (
  <svg className={className} style={style} width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);
