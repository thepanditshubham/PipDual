'use client';

import { useEffect, useState } from 'react';
import { Check, MessageSquare, Send, X } from 'lucide-react';
import { PROFILE_LIMITS } from '@/lib/profile/config';

export function MessageModal({
  open,
  targetName,
  onClose,
  onSend,
}: {
  open: boolean;
  targetName: string;
  onClose: () => void;
  onSend: (body: string) => Promise<void>;
}) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = async () => {
    const text = body.trim();
    if (!text) {
      setError('Write a message first.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await onSend(text);
      setSent(true);
      setBody('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not deliver the message.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-message-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--accent-hi)]">
              <MessageSquare size={15} />
            </span>
            <div>
              <h2 id="profile-message-title" className="text-xs font-bold text-[var(--text)]">
                Message {targetName}
              </h2>
              <p className="text-[9px] text-[var(--text-muted)]">Delivered to their arena inbox.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close message"
            className="rounded-md border border-[var(--border)] p-1.5 text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <X size={13} />
          </button>
        </div>

        <div className="space-y-2 p-4">
          {sent ? (
            <div className="flex items-center gap-2 rounded-lg border border-[var(--up)]/30 bg-[var(--up)]/10 px-3 py-3 text-[10px] text-[var(--up)]">
              <Check size={14} /> Message delivered to {targetName}&apos;s inbox.
            </div>
          ) : (
            <>
              <label htmlFor="profile-message-body" className="block text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                Message
              </label>
              <textarea
                id="profile-message-body"
                value={body}
                onChange={(event) => setBody(event.target.value.slice(0, PROFILE_LIMITS.message))}
                rows={5}
                placeholder="Keep it relevant and respectful."
                className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-[11px] leading-relaxed text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)]/60"
              />
              <div className="flex items-center justify-between text-[9px] text-[var(--text-muted)]">
                <span>One-way message. Replies arrive through their profile.</span>
                <span className="font-mono">{body.length}/{PROFILE_LIMITS.message}</span>
              </div>
              {error && <p className="text-[9px] text-[var(--down)]">{error}</p>}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text)]"
          >
            {sent ? 'Close' : 'Cancel'}
          </button>
          {!sent && (
            <button
              type="button"
              onClick={submit}
              disabled={sending || body.trim().length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-[#241c10] hover:bg-[var(--accent-hi)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Send size={11} /> {sending ? 'Sending' : 'Send message'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
