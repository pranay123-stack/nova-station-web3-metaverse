'use client';

import { AREA_GRAPH, STATION_AREAS, STATION_AREA_IDS, type StationAreaId } from '@nova/game-data';
import { gameSocket } from '@/game/net/socket';
import { AREA_COLORS, Badge } from '@nova/ui';
import { useGameStore } from '@/stores/useGameStore';
import { usePlayerStore } from '@/stores/usePlayerStore';

/**
 * The station map.
 *
 * Drawn from the same area table the 3D station is built from, so it can never
 * show a room that does not exist or miss one that does. Clicking a sector
 * gives directions rather than teleporting: walking there is the game.
 */
const VIEW = { minX: -120, maxX: 120, minZ: -170, maxZ: 175 };
const WIDTH = VIEW.maxX - VIEW.minX;
const HEIGHT = VIEW.maxZ - VIEW.minZ;

export function MapPanel() {
  const current = useGameStore((state) => state.area);
  const areaCounts = useGameStore((state) => state.areaCounts);
  const player = usePlayerStore((state) => state.player);
  const toast = useGameStore((state) => state.toast);

  const unlocked = new Set(player?.unlockedAreas ?? []);

  return (
    <div className="space-y-3">
      {/* The plan is taller than it is wide, so the map is bounded by height
          and centred — otherwise it fills the dialog and the southern sectors
          fall below the fold. */}
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        className="mx-auto max-h-[52vh] w-full border border-slate-800 bg-slate-950/60"
        role="img"
        aria-label="Station map"
      >
        {/* Corridors, drawn from the adjacency graph. */}
        {STATION_AREA_IDS.flatMap((from) =>
          (AREA_GRAPH[from] ?? []).map((to) => {
            if (from === 'corridor' || to === 'corridor') return null;
            const a = STATION_AREAS[from as Exclude<StationAreaId, 'corridor'>];
            const b = STATION_AREAS[to as Exclude<StationAreaId, 'corridor'>];
            return (
              <line
                key={`${from}-${to}`}
                x1={a.center[0] - VIEW.minX}
                y1={a.center[2] - VIEW.minZ}
                x2={b.center[0] - VIEW.minX}
                y2={b.center[2] - VIEW.minZ}
                stroke="#233246"
                strokeWidth={6}
              />
            );
          }),
        )}

        {STATION_AREA_IDS.map((id) => {
          if (id === 'corridor') return null;
          const area = STATION_AREAS[id as Exclude<StationAreaId, 'corridor'>];
          const [cx, , cz] = area.center;
          const [hx, hz] = area.halfExtents;
          const locked = !unlocked.has(id);
          const here = current === id;
          const occupants = areaCounts[id] ?? 0;

          return (
            <g
              key={id}
              className="cursor-pointer"
              onClick={() =>
                toast({
                  kind: locked ? 'warn' : 'info',
                  title: locked ? `${area.name} is locked` : `Heading for ${area.name}`,
                  detail: locked
                    ? `Unlocks at level ${area.requiredLevel}`
                    : area.description,
                  ttl: 6000,
                })
              }
            >
              <rect
                x={cx - hx - VIEW.minX}
                y={cz - hz - VIEW.minZ}
                width={hx * 2}
                height={hz * 2}
                fill={locked ? '#0b1119' : `${AREA_COLORS[id]}18`}
                stroke={here ? AREA_COLORS[id] : locked ? '#1e293b' : '#334155'}
                strokeWidth={here ? 3 : 1.5}
              />
              <text
                x={cx - VIEW.minX}
                y={cz - VIEW.minZ - 3}
                textAnchor="middle"
                fill={locked ? '#475569' : AREA_COLORS[id]}
                fontSize={8}
                letterSpacing="0.08em"
                className="uppercase"
              >
                {area.name}
              </text>
              {occupants > 0 && (
                <text
                  x={cx - VIEW.minX}
                  y={cz - VIEW.minZ + 8}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize={7}
                >
                  {occupants} aboard
                </text>
              )}
              {locked && (
                <text
                  x={cx - VIEW.minX}
                  y={cz - VIEW.minZ + 8}
                  textAnchor="middle"
                  fill="#64748b"
                  fontSize={7}
                >
                  LV {area.requiredLevel}
                </text>
              )}
            </g>
          );
        })}

        {/* The player marker. */}
        <PlayerMarker />
      </svg>

      <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {STATION_AREA_IDS.map((id) => {
          if (id === 'corridor') return null;
          const area = STATION_AREAS[id as Exclude<StationAreaId, 'corridor'>];
          const locked = !unlocked.has(id);
          return (
            <li
              key={id}
              className="flex items-center gap-2 border border-slate-800/70 bg-slate-900/40 px-2 py-1.5"
            >
              <span aria-hidden>{area.icon}</span>
              <span className={`text-[11px] ${locked ? 'text-slate-600' : 'text-slate-300'}`}>
                {area.name}
              </span>
              {current === id && <Badge color={AREA_COLORS[id]}>Here</Badge>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Reads the live pose straight off the socket, so the dot tracks the player. */
function PlayerMarker() {
  const pose = usePose();
  return (
    <g>
      <circle
        cx={pose.x - VIEW.minX}
        cy={pose.z - VIEW.minZ}
        r={4}
        fill="#38bdf8"
        stroke="#e0f2fe"
        strokeWidth={1.5}
      />
      <circle cx={pose.x - VIEW.minX} cy={pose.z - VIEW.minZ} r={9} fill="none" stroke="#38bdf8" strokeWidth={1} opacity={0.5} />
    </g>
  );
}

function usePose() {
  // The map is open a few seconds at a time; reading the live pose on render is
  // enough, and avoids subscribing the panel to a value that changes at 60Hz.
  return gameSocket.pose;
}
