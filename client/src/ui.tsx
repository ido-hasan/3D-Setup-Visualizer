import { X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { partPins, type Part } from '@viz/shared';
import { fileUrl } from './api';
import { boardThumbnail } from './lib/thumbnail';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  headExtra?: ReactNode;
}

export function Modal({ title, onClose, children, footer, wide, headExtra }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head no-print">
          <h2>{title}</h2>
          <div className="spacer" />
          {headExtra}
          <button className="btn ghost icon" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot no-print">{footer}</div>}
      </div>
    </div>
  );
}

interface ConfirmProps {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function Confirm({ title, message, confirmLabel, danger, onConfirm, onClose }: ConfirmProps) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className={`btn ${danger ? 'danger' : 'primary'}`}
            autoFocus
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p>{message}</p>
    </Modal>
  );
}

/** A button that opens a small menu below it. */
export function Menu({ label, children, className = 'btn' }: { label: ReactNode; children: (close: () => void) => ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);
  return (
    <div className="menu-wrap" ref={ref}>
      <button className={`${className}${open ? ' active' : ''}`} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        {label}
      </button>
      {open && (
        <div className="menu" role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

interface NumberInputProps {
  value: number;
  onCommit: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  digits?: number;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
  id?: string;
}

/** A number box that applies its value on Enter, on blur, and on the arrow keys. */
export function NumberInput({ value, onCommit, step = 1, min, max, digits = 2, className = 'input', ...rest }: NumberInputProps) {
  const show = (n: number): string => String(Math.round(n * 10 ** digits) / 10 ** digits);
  const [text, setText] = useState(show(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const commit = (raw: string): void => {
    let n = Number(raw.replace(',', '.'));
    if (!Number.isFinite(n) || raw.trim() === '') {
      setText(show(value));
      return;
    }
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    setText(show(n));
    if (n !== value) onCommit(n);
  };
  return (
    <input
      {...rest}
      className={className}
      inputMode="decimal"
      value={text}
      onFocus={(e) => {
        focused.current = true;
        e.target.select();
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={(e) => {
        focused.current = false;
        commit(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
        else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const cur = Number((e.target as HTMLInputElement).value.replace(',', '.'));
          const next = (Number.isFinite(cur) ? cur : value) + (e.key === 'ArrowUp' ? step : -step);
          commit(String(next));
        }
        e.stopPropagation();
      }}
    />
  );
}

/** A text box that applies its value on Enter and on blur. */
export function TextInput({
  value,
  onCommit,
  className = 'input',
  ...rest
}: { value: string; onCommit: (v: string) => void; className?: string; placeholder?: string; 'aria-label'?: string; id?: string; disabled?: boolean }) {
  const [text, setText] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);
  return (
    <input
      {...rest}
      className={className}
      value={text}
      onFocus={() => (focused.current = true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        focused.current = false;
        if (text !== value) onCommit(text);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        e.stopPropagation();
      }}
    />
  );
}

export function PartThumb({ part, className }: { part: Part; className?: string }) {
  const [url, setUrl] = useState<string | undefined>(part.thumb ? fileUrl(part.thumb) : undefined);
  useEffect(() => {
    if (part.thumb) {
      setUrl(fileUrl(part.thumb));
      return;
    }
    // Drawn parts are rendered here, a moment later, so the page shows first.
    const t = setTimeout(() => setUrl(boardThumbnail(part)), 0);
    return () => clearTimeout(t);
  }, [part]);
  return url ? <img className={className} src={url} alt="" draggable={false} /> : <div className={`ph ${className ?? ''}`} />;
}

export const pinCount = (part: Part): number => partPins(part).length;

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="center-msg solid">
      <div className="spinner" />
      <p>{label}</p>
    </div>
  );
}
