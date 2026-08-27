'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { parseEther } from 'viem';
import { NovaItemsAbi, NovaMarketplaceAbi } from '@nova/web3';
import { Badge, Button, RARITY_TEXT } from '@nova/ui';
import type { BlockchainAssetDto } from '@nova/shared';
import { api } from '@/lib/api';
import { usePlayerStore } from '@/stores/usePlayerStore';
import { useChainConfig, useContractWrite } from '@/lib/useChain';
import { shortAddress } from '@/lib/format';
import { useAction, usePanelData } from './usePanelData';
import { TxStatus } from './TxStatus';

/**
 * On-chain assets.
 *
 * Two operations live here and both are honest about what they are: minting
 * moves an item the player already owns off-chain onto the chain (the server
 * holds the minter role and burns the off-chain copy in the same step), and
 * listing sends a transaction from the player's own wallet to the marketplace
 * contract. Nothing is simulated.
 */
export function AssetsPanel() {
  const { address, isConnected } = useAccount();
  const inventory = usePlayerStore((state) => state.inventory);
  const refreshInventory = usePlayerStore((state) => state.refreshInventory);
  const { config, loading: configLoading, load } = useChainConfig();
  const { write, state: tx, reset } = useContractWrite();
  const { run, busy } = useAction();
  const [listing, setListing] = useState<{ asset: BlockchainAssetDto; price: string } | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const { data, refresh } = usePanelData(
    () => api.get<{ assets: BlockchainAssetDto[]; pendingTransactions: number }>('/api/chain/assets'),
    [],
  );

  const mintable = (inventory?.entries ?? []).filter(
    (entry) =>
      (entry.kind === 'module' || entry.kind === 'equipment' || entry.kind === 'cosmetic') &&
      (config?.mintableItems ?? []).some((item) => item.defId === entry.defId),
  );

  if (configLoading) {
    return <p className="py-8 text-center text-xs text-slate-500">Reading chain configuration…</p>;
  }

  if (!config?.configured) {
    return (
      <div className="space-y-2 py-6 text-center">
        <p className="text-xs text-amber-300">On-chain features are not configured on this deployment.</p>
        <p className="text-[11px] text-slate-500">
          Deploy the contracts and set the CONTRACT_* environment variables to enable minting,
          trading and ownership verification. Everything else in the game works without them.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!isConnected && (
        <p className="border border-amber-500/40 bg-amber-950/20 p-3 text-[11px] text-amber-200">
          Connect your wallet to mint, list or transfer assets. You can still browse what you own.
        </p>
      )}

      <TxStatus phase={tx.phase} hash={tx.hash} error={tx.error} />

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
            Owned on chain ({data?.assets.length ?? 0})
          </h3>
          {(data?.pendingTransactions ?? 0) > 0 && (
            <Badge color="#fbbf24">{data?.pendingTransactions} pending</Badge>
          )}
        </div>

        {(data?.assets ?? []).length === 0 ? (
          <p className="py-6 text-center text-[11px] text-slate-500">
            No tokens yet. Take an eligible item on chain below.
          </p>
        ) : (
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {(data?.assets ?? []).map((asset) => (
              <li key={asset.id} className="border border-violet-500/30 bg-slate-900/40 p-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`truncate text-xs ${RARITY_TEXT[asset.rarity]}`}>{asset.name}</span>
                  <Badge color="#c084fc">
                    {asset.standard === 'erc721' ? `#${asset.tokenId}` : `×${asset.amount}`}
                  </Badge>
                </div>
                <p className="mt-0.5 font-mono text-[10px] text-slate-500">
                  {shortAddress(asset.collection)} · block {asset.lastSyncedBlock}
                </p>
                <div className="mt-2 flex gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!isConnected}
                    onClick={() => setListing({ asset, price: '0.01' })}
                  >
                    List for sale
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {listing && (
        <section className="border border-sky-500/40 bg-slate-900/60 p-3">
          <h3 className="text-[11px] text-slate-200">List {listing.asset.name}</h3>
          <p className="mt-1 text-[11px] text-slate-500">
            Listing escrows the token in the marketplace contract. Two transactions: approve the
            marketplace, then list.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={listing.price}
              onChange={(event) => setListing({ ...listing, price: event.target.value })}
              aria-label="Price in ETH"
              className="w-32 border border-slate-700/60 bg-slate-950/60 px-2 py-1.5 font-mono text-xs text-slate-200 outline-none focus:border-sky-500/60"
            />
            <span className="text-[11px] text-slate-500">ETH</span>
            <Button
              size="sm"
              variant="primary"
              disabled={!isConnected}
              onClick={async () => {
                reset();
                const price = safeParseEther(listing.price);
                if (price === null) return;

                const approved = await write({
                  address: listing.asset.collection as `0x${string}`,
                  abi: NovaItemsAbi as never,
                  functionName: 'setApprovalForAll',
                  args: [config.contracts.marketplace, true],
                  intent: 'list',
                  description: 'Marketplace approval',
                });
                if (!approved) return;

                const listed = await write({
                  address: config.contracts.marketplace,
                  abi: NovaMarketplaceAbi as never,
                  functionName: 'list',
                  args: [
                    listing.asset.collection,
                    BigInt(listing.asset.tokenId),
                    BigInt(listing.asset.standard === 'erc721' ? 1 : 1),
                    price,
                  ],
                  intent: 'list',
                  description: 'Listing',
                });
                if (listed) {
                  setListing(null);
                  await refresh();
                }
              }}
            >
              Approve &amp; list
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setListing(null)}>
              Cancel
            </Button>
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">
          Take an item on chain
        </h3>
        {!config.mintingAvailable ? (
          <p className="text-[11px] text-slate-500">
            This deployment has no minter key configured, so items cannot be moved on chain here.
          </p>
        ) : mintable.length === 0 ? (
          <p className="text-[11px] text-slate-500">
            Nothing in your inventory is eligible. Craft a rare module or cosmetic first.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {mintable.map((entry) => (
              <li
                key={entry.defId}
                className="flex items-center gap-3 border border-slate-800/70 bg-slate-900/40 p-2"
              >
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-xs ${RARITY_TEXT[entry.rarity]}`}>{entry.name}</p>
                  <p className="text-[10px] text-slate-500">
                    ×{entry.amount} held off-chain · minting burns one copy
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  loading={busy}
                  disabled={!address}
                  onClick={() =>
                    void run(
                      async () => {
                        await api.post('/api/chain/mint', {
                          kind: entry.kind,
                          defId: entry.defId,
                          amount: 1,
                        });
                        await Promise.all([refresh(), refreshInventory()]);
                      },
                      {
                        success: 'Mint submitted',
                        detail: 'The indexer will show the token once the block confirms.',
                      },
                    )
                  }
                >
                  Mint
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function safeParseEther(value: string): bigint | null {
  try {
    const parsed = parseEther(value as `${number}`);
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}
