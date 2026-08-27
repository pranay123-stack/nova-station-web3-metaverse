'use client';

import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/stores/useGameStore';
import { gameSocket } from '@/game/net/socket';
import { suspendInput } from '@/game/systems/input';
import { shortAddress } from '@/lib/format';

/**
 * Station chat.
 *
 * Opening the composer suspends movement input, so pressing "W" writes a W
 * rather than walking the commander into a wall mid-sentence.
 */
export function ChatDock() {
  const lines = useGameStore((state) => state.chat);
  const open = useGameStore((state) => state.chatOpen);
  const setOpen = useGameStore((state) => state.setChatOpen);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      suspendInput(true);
      inputRef.current?.focus();
    } else {
      suspendInput(false);
    }
    return () => suspendInput(false);
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [lines.length]);

  const send = () => {
    const text = draft.trim();
    if (text) gameSocket.sendChat('station', text);
    setDraft('');
    setOpen(false);
  };

  return (
    <div className="absolute bottom-24 left-3 w-80 sm:left-4">
      <div
        ref={listRef}
        className="mb-1 max-h-40 overflow-y-auto text-[11px] leading-relaxed"
        aria-live="polite"
        aria-label="Station chat"
      >
        {lines.slice(-12).map((line) => (
          <p key={line.id} className="text-slate-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            <span
              className={
                line.channel === 'direct'
                  ? 'text-violet-300'
                  : line.channel === 'area'
                    ? 'text-emerald-300'
                    : 'text-sky-300'
              }
              title={shortAddress(line.address)}
            >
              {line.name}
            </span>
            <span className="text-slate-600">: </span>
            {line.text}
          </p>
        ))}
      </div>

      {open ? (
        <form
          className="pointer-events-auto flex items-center gap-2 border border-sky-500/50 bg-slate-950/90 px-2 py-1.5 backdrop-blur-md"
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <span className="text-[10px] uppercase tracking-[0.18em] text-sky-400">Station</span>
          <input
            ref={inputRef}
            value={draft}
            maxLength={240}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setDraft('');
                setOpen(false);
              }
            }}
            onBlur={() => setOpen(false)}
            aria-label="Chat message"
            className="flex-1 bg-transparent text-xs text-slate-100 outline-none placeholder:text-slate-600"
            placeholder="Say something to the station…"
          />
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="pointer-events-auto flex items-center gap-2 border border-slate-700/50 bg-slate-950/70 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-500 backdrop-blur-md transition-colors hover:border-slate-600 hover:text-slate-300"
        >
          <kbd className="font-mono text-[10px]">Enter</kbd> Chat
        </button>
      )}
    </div>
  );
}
