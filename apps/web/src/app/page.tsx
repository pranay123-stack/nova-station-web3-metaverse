import Link from 'next/link';
import { FACTIONS, FACTION_IDS, MINING_ZONES, MISSIONS, RESOURCES, SHIPS } from '@nova/game-data';

/**
 * The landing page.
 *
 * Rendered on the server with no client JavaScript beyond the providers: it is
 * the first thing anyone sees, and it should paint instantly rather than wait
 * for a 3D bundle it does not need.
 */
export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#05070d] text-slate-200">
      <div aria-hidden className="grid-backdrop pointer-events-none absolute inset-0 opacity-40" />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full opacity-25 blur-3xl"
        style={{ background: 'radial-gradient(circle, #38bdf8 0%, transparent 65%)' }}
      />

      <Nav />
      <Hero />
      <Features />
      <HowItWorks />
      <Ownership />
      <Content />
      <Roadmap />
      <Faq />
      <Footer />
    </main>
  );
}

function Nav() {
  return (
    <nav className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
      <Link href="/" className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="flex h-8 w-8 items-center justify-center border border-sky-400/60 text-sm text-sky-300"
          style={{ clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 0 100%)' }}
        >
          ◈
        </span>
        <span className="text-sm font-semibold tracking-[0.3em] text-slate-100">NOVA</span>
      </Link>
      <div className="flex items-center gap-5 text-[11px] uppercase tracking-[0.18em] text-slate-400">
        <a href="#features" className="transition-colors hover:text-sky-300">
          Features
        </a>
        <a href="#ownership" className="hidden transition-colors hover:text-sky-300 sm:inline">
          Ownership
        </a>
        <a href="#roadmap" className="hidden transition-colors hover:text-sky-300 sm:inline">
          Roadmap
        </a>
        <Link
          href="/play"
          className="border border-sky-400/60 bg-sky-500/10 px-4 py-1.5 text-sky-200 transition-colors hover:bg-sky-500/20"
        >
          Play now
        </Link>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <header className="relative z-10 mx-auto max-w-6xl px-5 pb-24 pt-16 sm:pt-24">
      <p className="text-[11px] uppercase tracking-[0.42em] text-sky-400">Orbital Charter 44-A</p>
      <h1 className="mt-4 text-5xl font-semibold leading-[0.95] tracking-tight text-slate-50 sm:text-7xl">
        NOVA
        <br />
        STATION
      </h1>

      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-1 text-xl text-slate-400 sm:text-2xl">
        {['Explore.', 'Trade.', 'Build.', 'Own.'].map((word, index) => (
          <span
            key={word}
            className={index === 3 ? 'text-sky-300' : undefined}
            style={{ animationDelay: `${index * 220}ms` }}
          >
            {word}
          </span>
        ))}
      </div>

      <p className="mt-6 max-w-xl text-sm leading-relaxed text-slate-400">
        A persistent orbital station you can actually walk around. Take contracts from three
        factions, fly out to the belt, work an asteroid with your own hands, and bring the ore home.
        What you earn is yours — and the rare part of it lives on chain, where nobody can take it
        back.
      </p>

      <div className="mt-9 flex flex-wrap items-center gap-3">
        <Link
          href="/play"
          className="group relative border border-sky-400/70 bg-sky-500/15 px-8 py-3 text-sm uppercase tracking-[0.2em] text-sky-100 transition-colors hover:bg-sky-500/25"
          style={{ clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)' }}
        >
          Enter station
        </Link>
        <Link
          href="/marketplace"
          className="border border-slate-700 px-6 py-3 text-sm uppercase tracking-[0.2em] text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100"
        >
          Browse market
        </Link>
      </div>

      <dl className="mt-14 grid max-w-2xl grid-cols-2 gap-x-8 gap-y-4 border-t border-slate-800 pt-6 sm:grid-cols-4">
        {[
          { label: 'Contracts', value: MISSIONS.length },
          { label: 'Hulls', value: SHIPS.length },
          { label: 'Materials', value: Object.keys(RESOURCES).length },
          { label: 'Fields', value: MINING_ZONES.length },
        ].map((stat) => (
          <div key={stat.label}>
            <dt className="text-[10px] uppercase tracking-[0.24em] text-slate-600">{stat.label}</dt>
            <dd className="font-mono text-2xl text-slate-200">{stat.value}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}

const FEATURES = [
  {
    title: '3D Space Station',
    body: 'Seven sectors on one continuous deck plan — command, hangar, market, lab, habitats, mining bay and the open docking aperture. No loading screens between them.',
    icon: '🛰️',
  },
  {
    title: 'Player-Owned Assets',
    body: 'Rare modules, bespoke hulls and legendary cosmetics exist as ERC-721 and ERC-1155 tokens. Ownership is verified against the chain, not against our database.',
    icon: '🔗',
  },
  {
    title: 'Mining With Your Hands',
    body: 'Fly to the belt, pick a rock, and hold the resonance band while the beam cuts. Playing it well is worth up to 45% more ore — and the server decides what comes out.',
    icon: '⛏️',
  },
  {
    title: 'A Real Economy',
    body: 'Refine, craft, trade. Credits enter through work and leave through fees, fuel and fabrication. Every movement is journalled and can be replayed.',
    icon: '⇅',
  },
  {
    title: 'Contracts & Factions',
    body: 'Three factions with genuinely opposed interests. Working for the Syndicate costs you with the Federation, and standing opens fields, schematics and hulls.',
    icon: '◈',
  },
  {
    title: 'Live Multiplayer',
    body: 'See other commanders walking the deck in real time, with interpolated movement, area chat and emotes. The server is authoritative over all of it.',
    icon: '⚇',
  },
];

function Features() {
  return (
    <section id="features" className="relative z-10 mx-auto max-w-6xl px-5 py-20">
      <SectionHeading eyebrow="Features" title="What is aboard" />
      <ul className="mt-10 grid gap-px bg-slate-800/60 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <li key={feature.title} className="bg-[#080d15] p-6 transition-colors hover:bg-[#0c1420]">
            <span aria-hidden className="text-2xl">
              {feature.icon}
            </span>
            <h3 className="mt-3 text-sm uppercase tracking-[0.18em] text-slate-100">{feature.title}</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-slate-400">{feature.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

const STEPS = [
  { step: '01', title: 'Connect', body: 'Sign one message with your wallet. No transaction, no gas, no key ever leaves your browser.' },
  { step: '02', title: 'Kit out', body: 'A Kestrel, a standard suit and 2,500 credits. Customise the suit at the locker in the habitat ring.' },
  { step: '03', title: 'Take a contract', body: 'The board at the command deck, the hangar and the market all carry work. Read the brief before you accept.' },
  { step: '04', title: 'Fly and mine', body: 'Launch from the docking bay, work the field, and come home before your fuel does.' },
  { step: '05', title: 'Refine and build', body: 'Turn ore into credits at the refinery, or into modules at the lab bench.' },
  { step: '06', title: 'Own and trade', body: 'Move a rare item on chain, list it for ETH, and let the registry prove it is yours.' },
];

function HowItWorks() {
  return (
    <section className="relative z-10 border-y border-slate-800/70 bg-[#070b12]">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <SectionHeading eyebrow="How it works" title="Six steps from wallet to hangar" />
        <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((entry) => (
            <li key={entry.step} className="border-l border-sky-500/30 pl-4">
              <span className="font-mono text-[11px] text-sky-500">{entry.step}</span>
              <h3 className="mt-1 text-sm text-slate-100">{entry.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">{entry.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Ownership() {
  return (
    <section id="ownership" className="relative z-10 mx-auto max-w-6xl px-5 py-20">
      <SectionHeading eyebrow="Web3 ownership" title="On chain where it matters, off chain where it does not" />
      <div className="mt-10 grid gap-px bg-slate-800/60 lg:grid-cols-2">
        <div className="bg-[#080d15] p-6">
          <h3 className="text-sm uppercase tracking-[0.18em] text-violet-300">On chain</h3>
          <ul className="mt-3 space-y-2 text-[13px] text-slate-400">
            {[
              'Bespoke hulls and one-off collectibles (ERC-721)',
              'Rare modules, equipment and cosmetics (ERC-1155)',
              'Marketplace listings, sales and escrow',
              'Event and tournament rewards, redeemed against a signed voucher',
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-violet-400">◆</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-[#080d15] p-6">
          <h3 className="text-sm uppercase tracking-[0.18em] text-sky-300">Off chain</h3>
          <ul className="mt-3 space-y-2 text-[13px] text-slate-400">
            {[
              'Movement, presence and chat',
              'Ordinary resources, XP and reputation',
              'Contracts, crafting and refining',
              'Everything that would otherwise cost gas to play',
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-sky-400">◇</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-6 max-w-2xl text-[13px] leading-relaxed text-slate-500">
        Putting a mining run on chain would mean a transaction per asteroid and a wallet prompt every
        twelve seconds. The chain is used for what it is genuinely good at — ownership, provenance and
        trade that outlives the game server — and nothing else. Owning a token never makes a ship
        stronger than one a player crafted.
      </p>
    </section>
  );
}

function Content() {
  return (
    <section className="relative z-10 border-y border-slate-800/70 bg-[#070b12]">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <SectionHeading eyebrow="The system" title="Three factions, four fields, six materials" />
        <div className="mt-10 grid gap-px bg-slate-800/60 lg:grid-cols-3">
          {FACTION_IDS.map((id) => {
            const faction = FACTIONS[id];
            return (
              <div key={id} className="bg-[#080d15] p-6">
                <h3 className="text-sm uppercase tracking-[0.18em]" style={{ color: faction.color }}>
                  {faction.name}
                </h3>
                <p className="mt-1 text-[11px] italic text-slate-500">“{faction.motto}”</p>
                <p className="mt-3 text-[13px] leading-relaxed text-slate-400">{faction.description}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Object.values(RESOURCES).map((resource) => (
            <div key={resource.id} className="flex items-start gap-3 border border-slate-800/70 p-3">
              <span className="mt-1 h-3 w-3 shrink-0" style={{ background: resource.color }} />
              <div>
                <p className="text-[13px] text-slate-200">{resource.name}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{resource.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const ROADMAP = [
  { phase: 'Shipped', items: ['Station and character controller', 'Mining expeditions and the resonance minigame', 'Contracts, crafting, refining and the exchange', 'Live multiplayer, chat and emotes', 'ERC-721/1155 assets and an escrowed marketplace'] },
  { phase: 'Next', items: ['Station modules players can own and decorate', 'Co-operative expeditions with shared holds', 'Faction seasons with ranked standings', 'Mobile controls beyond the current touch stick'] },
  { phase: 'Later', items: ['A second station in a different orbit', 'Player-run manufacturing contracts', 'Spectatable tournaments with vault-backed prizes'] },
];

function Roadmap() {
  return (
    <section id="roadmap" className="relative z-10 mx-auto max-w-6xl px-5 py-20">
      <SectionHeading eyebrow="Roadmap" title="Where this goes" />
      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        {ROADMAP.map((entry, index) => (
          <div key={entry.phase}>
            <h3
              className={`text-sm uppercase tracking-[0.18em] ${
                index === 0 ? 'text-emerald-300' : index === 1 ? 'text-sky-300' : 'text-slate-500'
              }`}
            >
              {entry.phase}
            </h3>
            <ul className="mt-3 space-y-2">
              {entry.items.map((item) => (
                <li key={item} className="flex gap-2 text-[13px] text-slate-400">
                  <span className={index === 0 ? 'text-emerald-400' : 'text-slate-600'}>
                    {index === 0 ? '✓' : '○'}
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

const FAQ = [
  {
    q: 'Do I need cryptocurrency to play?',
    a: 'No. Connecting a wallet costs nothing and signing in is a signature, not a transaction. Everything in the core loop — mining, contracts, crafting, the credit exchange — runs without ever touching the chain. You only need Sepolia ETH if you want to move an asset on chain or buy one from another player.',
  },
  {
    q: 'Is this pay-to-win?',
    a: 'No, and it is designed not to become so. Every on-chain item has a craftable equivalent with the same stats, and nothing bought with ETH grants raw power a working player cannot earn. Ownership buys provenance and the right to sell, not an advantage.',
  },
  {
    q: 'What stops someone cheating the economy?',
    a: 'The server owns every number that matters and never accepts a client\'s word for one. Mining yields are rolled server-side from a seed the client never sees, credits move only through an append-only ledger, and each asteroid can be worked exactly once. The client is treated as hostile throughout.',
  },
  {
    q: 'What happens to my assets if the game shuts down?',
    a: 'Anything on chain is yours regardless — the tokens live in your wallet and the marketplace contract is not ours to switch off. Off-chain progress lives in the game database and would go with it, which is exactly why the split is drawn where it is.',
  },
  {
    q: 'Which network is this on?',
    a: 'Sepolia. It is a testnet, so the ETH involved has no monetary value — the point is to demonstrate the ownership model end to end, not to sell anything.',
  },
  {
    q: 'What do I need to run it?',
    a: 'A modern browser with WebGL2 and a keyboard. The game measures its own frame rate and steps quality down if it cannot hold 60fps, so it runs on integrated graphics.',
  },
];

function Faq() {
  return (
    <section className="relative z-10 border-t border-slate-800/70 bg-[#070b12]">
      <div className="mx-auto max-w-3xl px-5 py-20">
        <SectionHeading eyebrow="FAQ" title="Questions worth asking" />
        <dl className="mt-10 divide-y divide-slate-800">
          {FAQ.map((entry) => (
            <div key={entry.q} className="py-5">
              <dt className="text-sm text-slate-100">{entry.q}</dt>
              <dd className="mt-2 text-[13px] leading-relaxed text-slate-400">{entry.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="relative z-10 mx-auto max-w-6xl px-5 py-16 text-center">
      <Link
        href="/play"
        className="inline-block border border-sky-400/70 bg-sky-500/15 px-10 py-4 text-sm uppercase tracking-[0.24em] text-sky-100 transition-colors hover:bg-sky-500/25"
        style={{ clipPath: 'polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%)' }}
      >
        Play now
      </Link>
      <p className="mt-8 text-[11px] text-slate-600">
        NOVA STATION · A demonstration of hybrid Web2/Web3 game architecture · Sepolia testnet
      </p>
    </footer>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.34em] text-sky-500">{eyebrow}</p>
      <h2 className="mt-2 text-2xl tracking-tight text-slate-100 sm:text-3xl">{title}</h2>
    </div>
  );
}
