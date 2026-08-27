'use client';

import { useState } from 'react';
import { Badge, Button, Tabs } from '@nova/ui';
import { api } from '@/lib/api';
import { useGameStore } from '@/stores/useGameStore';
import { relativeTime, shortAddress } from '@/lib/format';
import { useAction, usePanelData } from './usePanelData';

interface Friend {
  readonly address: string;
  readonly displayName: string;
  readonly level: number;
  readonly lastSeenAt: string;
  readonly online: boolean;
}

interface FriendRequest {
  readonly id: string;
  readonly address: string;
  readonly displayName: string;
  readonly direction: 'incoming' | 'outgoing';
}

/** Friends, requests and who is currently aboard. */
export function SocialPanel() {
  const [tab, setTab] = useState('crew');
  const [address, setAddress] = useState('');
  const remotePlayers = useGameStore((state) => state.remotePlayers);
  const { run, busy } = useAction();

  const { data, refresh } = usePanelData(
    () => api.get<{ friends: Friend[]; requests: FriendRequest[] }>('/api/social/friends'),
    [],
  );

  const incoming = (data?.requests ?? []).filter((entry) => entry.direction === 'incoming');
  const nearby = Array.from(remotePlayers.values());

  return (
    <div>
      <Tabs
        items={[
          { id: 'crew', label: 'Aboard', badge: nearby.length },
          { id: 'friends', label: 'Friends', badge: data?.friends.length ?? 0 },
          { id: 'requests', label: 'Requests', badge: incoming.length },
        ]}
        active={tab}
        onChange={setTab}
        className="mb-3"
      />

      {tab === 'crew' && (
        <ul className="space-y-1.5">
          {nearby.length === 0 && (
            <li className="py-8 text-center text-xs text-slate-500">
              Nobody else is on the station right now.
            </li>
          )}
          {nearby.map((player) => (
            <li
              key={player.id}
              className="flex items-center gap-3 border border-slate-800/70 bg-slate-900/40 p-2"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-slate-200">{player.name}</p>
                <p className="font-mono text-[10px] text-slate-500">
                  LV {player.level} · {shortAddress(player.address)}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                loading={busy}
                onClick={() =>
                  void run(
                    async () => {
                      await api.post('/api/social/friends/request', { address: player.address });
                      await refresh();
                    },
                    { success: `Request sent to ${player.name}` },
                  )
                }
              >
                Add
              </Button>
            </li>
          ))}
        </ul>
      )}

      {tab === 'friends' && (
        <div className="space-y-3">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                async () => {
                  await api.post('/api/social/friends/request', { address: address.trim() });
                  setAddress('');
                  await refresh();
                },
                { success: 'Request sent' },
              );
            }}
          >
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="0x… wallet address"
              aria-label="Friend wallet address"
              className="flex-1 border border-slate-700/60 bg-slate-900/60 px-2 py-1.5 font-mono text-[11px] text-slate-200 outline-none focus:border-sky-500/60"
            />
            <Button type="submit" size="sm" loading={busy} disabled={address.trim().length < 42}>
              Send request
            </Button>
          </form>

          <ul className="space-y-1.5">
            {(data?.friends ?? []).length === 0 && (
              <li className="py-6 text-center text-xs text-slate-500">No friends yet.</li>
            )}
            {(data?.friends ?? []).map((friend) => (
              <li
                key={friend.address}
                className="flex items-center gap-3 border border-slate-800/70 bg-slate-900/40 p-2"
              >
                <span
                  className={`h-2 w-2 rounded-full ${friend.online ? 'bg-emerald-400' : 'bg-slate-600'}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-slate-200">{friend.displayName}</p>
                  <p className="text-[10px] text-slate-500">
                    LV {friend.level} ·{' '}
                    {friend.online ? 'aboard now' : `seen ${relativeTime(friend.lastSeenAt)}`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busy}
                  onClick={() =>
                    void run(
                      async () => {
                        await api.post('/api/social/friends/remove', { address: friend.address });
                        await refresh();
                      },
                      { success: 'Removed' },
                    )
                  }
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'requests' && (
        <ul className="space-y-1.5">
          {(data?.requests ?? []).length === 0 && (
            <li className="py-8 text-center text-xs text-slate-500">Nothing pending.</li>
          )}
          {(data?.requests ?? []).map((request) => (
            <li
              key={request.id}
              className="flex items-center gap-3 border border-slate-800/70 bg-slate-900/40 p-2"
            >
              <Badge>{request.direction}</Badge>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-slate-200">{request.displayName}</p>
                <p className="font-mono text-[10px] text-slate-500">{shortAddress(request.address)}</p>
              </div>
              {request.direction === 'incoming' ? (
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="success"
                    loading={busy}
                    onClick={() =>
                      void run(
                        async () => {
                          await api.post('/api/social/friends/respond', {
                            requestId: request.id,
                            action: 'accept',
                          });
                          await refresh();
                        },
                        { success: 'Friend added' },
                      )
                    }
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={busy}
                    onClick={() =>
                      void run(async () => {
                        await api.post('/api/social/friends/respond', {
                          requestId: request.id,
                          action: 'decline',
                        });
                        await refresh();
                      })
                    }
                  >
                    Decline
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busy}
                  onClick={() =>
                    void run(async () => {
                      await api.post('/api/social/friends/respond', {
                        requestId: request.id,
                        action: 'cancel',
                      });
                      await refresh();
                    })
                  }
                >
                  Cancel
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
