/**
 * Each chapter's theme: its landmarks, the rows of buildings along the
 * back street and the shore, the props scattered in between, and its ground.
 */

import type { MapPoint, MapRegion, WorldMap } from '../../../flow/worldMap';
import { BACKLOT, type GroundKind, type PieceKind, STREET } from './cityPlan';

/** One kind of piece and the sizes it comes in. */
export interface Spec {
  kind: PieceKind;
  w: [number, number];
  d: [number, number];
  /** Storeys (buildings) or a plain height range (props: `storeys` [0, 0]). */
  storeys: [number, number];
  h?: [number, number];
  /** Extra height over the storeys: roofs, signs. */
  roof?: number;
  /** Small pieces may turn freely. */
  turns?: boolean;
  weight?: number;
}

/** A row of pieces between two depths, walked left to right. */
export interface Row {
  from: number;
  to: number;
  /** Line the pieces' backs (or fronts) up on the row's edge. */
  align: 'back' | 'front';
  specs: Spec[];
  gap: [number, number];
  /** Picket fences in front of houses. */
  fences?: boolean;
}

export interface Landmark {
  spec: Spec;
  /** Where it wants to stand; the planner takes the nearest free spot. */
  prefer: (region: MapRegion, map: WorldMap) => MapPoint;
  /** Little pieces round it, placed relative to its front middle. */
  companions?: { spec: Spec; dx: number; dy: number }[];
}

export interface Theme {
  landmarks: Landmark[];
  rows: Row[];
  fillers: Spec[];
  /** Random tries to scatter fillers over the region. */
  fillTries: number;
  /** What the ground is, before buildings pave it. */
  ground: (x: number, y: number) => GroundKind;
  /** The ground round buildings: paved, or left as garden. */
  yard: GroundKind;
}

export const prop = (
  kind: PieceKind,
  w: number,
  d: number,
  h: number,
  extra: Partial<Spec> = {},
): Spec => ({
  kind,
  w: [w, w],
  d: [d, d],
  storeys: [0, 0],
  h: [h, h],
  ...extra,
});

const TREE = prop('tree', 0.9, 0.9, 1.75, { weight: 3 });
const ROUND_TREE = prop('roundTree', 0.7, 0.7, 1.35, { weight: 2 });
const BUSH = prop('bush', 0.6, 0.6, 0.45, { turns: true, weight: 2 });
export const LAMP = prop('lamp', 0.25, 0.25, 1.1, { weight: 1 });
const CAR = prop('car', 0.45, 0.85, 0.42, { weight: 1 });
const BENCH = prop('bench', 0.6, 0.3, 0.3, { weight: 1 });
const PLANTER = prop('planter', 0.5, 0.5, 0.55, { weight: 1 });
const HEDGE = prop('hedge', 1.1, 0.35, 0.4, { weight: 1 });
const PINE = prop('pine', 0.7, 0.7, 1.9, { weight: 2 });
const BIRCH = prop('birch', 0.6, 0.6, 1.75, { weight: 2 });
const PALM = prop('palm', 0.7, 0.7, 1.9, { weight: 2 });
/** Engineering props: an outdoor server cabinet, a satellite dish, a radio mast. */
const RACK: Spec = { ...prop('serverRack', 0.45, 0.38, 0.8), h: [0.6, 1.0] };
const DISH = prop('dish', 0.55, 0.55, 0.75, { weight: 1 });
const ANTENNA = prop('antenna', 0.5, 0.5, 1.7, { weight: 1 });
const SOLAR = prop('solar', 0.8, 0.5, 0.35, { weight: 1 });
const COOLING = prop('cooling', 0.55, 0.45, 0.45, { weight: 1 });
const SPOOL = prop('spool', 0.35, 0.35, 0.3, { turns: true, weight: 1 });
const DRONE_PAD = prop('dronePad', 0.5, 0.5, 0.25, { weight: 1 });
const ROBOT = prop('robot', 0.2, 0.26, 0.22, { turns: true, weight: 1 });
const EV = prop('evCharger', 0.25, 0.2, 0.5, { weight: 1 });
/** Street furniture. */
const SHED = prop('shed', 0.6, 0.5, 0.6, { weight: 1 });
const BIN = prop('bin', 0.22, 0.22, 0.35, { weight: 1 });
const HYDRANT = prop('hydrant', 0.18, 0.18, 0.3, { weight: 1 });
const BUS_STOP = prop('busStop', 0.9, 0.35, 0.6, { weight: 1 });
const BIKE_RACK = prop('bikeRack', 0.8, 0.35, 0.35, { weight: 1 });
const FOOD_TRUCK = prop('foodTruck', 1.0, 0.5, 0.6, { weight: 1 });

/** Back of the island's back street, and its front. */
export const STREET_BACK = STREET.row;
export const STREET_FRONT = STREET.row + 1;
/**
 * The rows the themes fill: the back lot behind the street (tall
 * buildings, the skyline), the row between the street and the far flags
 * (where the landmarks stand, in view under the level card), and the
 * strip along the near shore (low things only; the hint covers part of it).
 */
const BACK_ROW = { from: -BACKLOT + 0.15, to: STREET_BACK - 0.35 };
const FRONT_ROW = { from: STREET_FRONT + 0.4, to: 2.15 };
const SHORE_ROW = { from: 10.6, to: 11.85 };

const HOUSE: Spec = { kind: 'house', w: [1.2, 1.6], d: [1.15, 1.3], storeys: [1, 1], roof: 0.85 };

/** The first level of `region`'s chapter on the near side of the road. */
function nearNode(region: MapRegion, map: WorldMap): MapPoint {
  const near = map.nodes.find(
    (n, i) => map.nodeChapters[i] === region.chapter && n.y > map.height / 2,
  );
  return near ?? { x: region.x + region.width / 2, y: map.height * 0.7 };
}

export const THEMES: Theme[] = [
  // Garage: a sleepy suburban street; the founders' garage by the first level.
  {
    landmarks: [
      {
        spec: { kind: 'garage', w: [1.8, 1.8], d: [1.35, 1.35], storeys: [1, 1], roof: 1.15 },
        prefer: (_r, map) => {
          const first = map.nodes[0] ?? { x: 1.5, y: 8 };
          return { x: first.x - 0.3, y: first.y - 3 };
        },
        companions: [
          { spec: prop('mailbox', 0.25, 0.25, 0.6), dx: 1.15, dy: 0.15 },
          { spec: prop('bike', 0.3, 0.6, 0.5), dx: -1.15, dy: -0.25 },
        ],
      },
    ],
    rows: [
      { ...BACK_ROW, align: 'front', specs: [HOUSE], gap: [0.6, 1.3], fences: true },
      { ...FRONT_ROW, align: 'back', specs: [HOUSE], gap: [0.9, 1.8], fences: true },
      {
        ...SHORE_ROW,
        align: 'front',
        specs: [BUSH, TREE, ROUND_TREE, PINE, BIRCH, SHED],
        gap: [0.5, 1.4],
      },
    ],
    fillers: [TREE, ROUND_TREE, PINE, BIRCH, BUSH, DISH, SHED, BIN, HYDRANT, SOLAR],
    fillTries: 260,
    ground: () => 'grass',
    yard: 'grass',
  },
  // Startup: an office park round a converted warehouse, coffee and scooters.
  {
    landmarks: [
      {
        spec: { kind: 'warehouse', w: [3, 3], d: [1.75, 1.75], storeys: [1, 1], roof: 1.2 },
        prefer: (r) => ({ x: r.x + 4.2, y: 1.2 }),
      },
      {
        spec: prop('kiosk', 0.95, 0.85, 1.05),
        prefer: (r, map) => {
          const near = nearNode(r, map);
          return { x: near.x + 2, y: near.y + 1.6 };
        },
        companions: [
          { spec: prop('bench', 0.6, 0.3, 0.3), dx: 0.95, dy: -0.15 },
          { spec: prop('scooter', 0.22, 0.55, 0.45), dx: -0.75, dy: -0.25 },
          { spec: prop('scooter', 0.22, 0.55, 0.45), dx: -1.0, dy: -0.25 },
        ],
      },
    ],
    rows: [
      {
        ...BACK_ROW,
        align: 'front',
        specs: [
          { kind: 'cowork', w: [1.6, 2.0], d: [1.3, 1.6], storeys: [2, 3], roof: 0.25 },
          { kind: 'office', w: [1.4, 1.7], d: [1.3, 1.5], storeys: [2, 3], roof: 0.15 },
        ],
        gap: [0.4, 0.9],
      },
      {
        ...FRONT_ROW,
        align: 'back',
        specs: [{ kind: 'cowork', w: [1.4, 1.8], d: [1.1, 1.4], storeys: [2, 3], roof: 0.25 }],
        gap: [0.6, 1.2],
      },
      {
        ...SHORE_ROW,
        align: 'front',
        specs: [prop('scooter', 0.22, 0.55, 0.45), BENCH, BUSH, BIKE_RACK, BIN],
        gap: [0.4, 1.4],
      },
    ],
    fillers: [
      TREE,
      ROUND_TREE,
      BIRCH,
      BUSH,
      FOOD_TRUCK,
      BIKE_RACK,
      SPOOL,
      SOLAR,
      COOLING,
      prop('pingPong', 0.85, 0.5, 0.4),
      prop('picnic', 0.8, 0.65, 0.38),
      prop('scooter', 0.22, 0.55, 0.45, { turns: true }),
      RACK,
      DISH,
    ],
    fillTries: 240,
    ground: () => 'grass',
    yard: 'paving',
  },
  // Scale-Up: downtown blocks of offices, and a crane: the company is growing.
  {
    landmarks: [
      {
        spec: { kind: 'crane', w: [2.2, 2.2], d: [1.85, 1.85], storeys: [3, 3], roof: 3.2 },
        prefer: (r) => ({ x: r.x + 6.3, y: 1.2 }),
      },
    ],
    rows: [
      {
        ...BACK_ROW,
        align: 'front',
        specs: [{ kind: 'office', w: [1.4, 2.0], d: [1.5, 2.4], storeys: [4, 6], roof: 0.2 }],
        gap: [0.25, 0.55],
      },
      {
        ...FRONT_ROW,
        align: 'back',
        specs: [{ kind: 'office', w: [1.3, 1.8], d: [1.1, 1.5], storeys: [3, 5], roof: 0.2 }],
        gap: [0.3, 0.7],
      },
      {
        ...SHORE_ROW,
        align: 'front',
        specs: [CAR, CAR, LAMP, BUS_STOP, HYDRANT, BIN],
        gap: [0.3, 0.8],
      },
    ],
    fillers: [TREE, ROUND_TREE, PINE, BUSH, BUSH, RACK, ANTENNA, COOLING, EV, SPOOL, FOOD_TRUCK],
    fillTries: 200,
    ground: (_x, y) => (y < STREET_FRONT + 1.5 ? 'paving' : 'grass'),
    yard: 'paving',
  },
  // Enterprise: a city of towers round the corporate HQ, and a plaza with a fountain.
  {
    landmarks: [
      {
        spec: { kind: 'hq', w: [2.5, 2.5], d: [1.9, 1.9], storeys: [12, 12], roof: 0.9 },
        prefer: (r) => ({ x: r.x + 4.2, y: 1.2 }),
      },
      {
        spec: prop('fountain', 1.3, 1.3, 0.7),
        prefer: (r, map) => {
          const near = nearNode(r, map);
          return { x: near.x + 2.2, y: near.y + 1.6 };
        },
        companions: [
          { spec: BENCH, dx: -1.0, dy: -0.4 },
          { spec: BENCH, dx: 1.0, dy: -0.4 },
        ],
      },
    ],
    rows: [
      {
        ...BACK_ROW,
        align: 'front',
        specs: [{ kind: 'tower', w: [1.4, 1.9], d: [1.6, 2.6], storeys: [8, 13], roof: 0.3 }],
        gap: [0.15, 0.35],
      },
      {
        ...FRONT_ROW,
        align: 'back',
        specs: [{ kind: 'tower', w: [1.3, 1.7], d: [1.2, 1.6], storeys: [5, 8], roof: 0.3 }],
        gap: [0.2, 0.45],
      },
      {
        ...SHORE_ROW,
        align: 'front',
        specs: [CAR, CAR, LAMP, PLANTER, BUS_STOP, BIN, HYDRANT],
        gap: [0.3, 0.7],
      },
    ],
    fillers: [PLANTER, ROUND_TREE, PINE, BUSH, RACK, RACK, ANTENNA, COOLING, SPOOL, DISH, EV],
    fillTries: 200,
    ground: (_x, y) => (y < 3 || y > 9 ? 'concrete' : 'paving'),
    yard: 'paving',
  },
  // Big Tech: a glass campus on a manicured lawn, and the tallest tower at the end of the road.
  {
    landmarks: [
      {
        spec: { kind: 'skyscraper', w: [2.1, 2.1], d: [1.85, 1.85], storeys: [16, 16], roof: 1.2 },
        prefer: (r) => ({ x: r.x + r.width - 1.3, y: 1.15 }),
      },
      {
        spec: { kind: 'campus', w: [3.4, 3.4], d: [2.6, 2.6], storeys: [3, 3], roof: 0.1 },
        prefer: (r) => ({ x: r.x + r.width * 0.35, y: STREET_BACK - 1.5 }),
      },
      {
        spec: prop('helipad', 1.3, 1.3, 0.08),
        prefer: (r, map) => {
          const near = nearNode(r, map);
          return { x: near.x + 2.2, y: near.y + 1.6 };
        },
      },
    ],
    rows: [
      {
        ...BACK_ROW,
        align: 'front',
        specs: [{ kind: 'glassTower', w: [1.4, 1.9], d: [1.6, 2.4], storeys: [11, 16], roof: 0.3 }],
        gap: [0.3, 0.6],
      },
      {
        ...FRONT_ROW,
        align: 'back',
        specs: [{ kind: 'glassTower', w: [1.3, 1.8], d: [1.2, 1.6], storeys: [7, 10], roof: 0.2 }],
        gap: [0.4, 0.9],
      },
      {
        ...SHORE_ROW,
        align: 'front',
        specs: [HEDGE, ROUND_TREE, BENCH, PALM, BIKE_RACK, ROBOT],
        gap: [0.35, 0.8],
      },
    ],
    fillers: [ROUND_TREE, PALM, BIRCH, HEDGE, BUSH, RACK, DISH, DRONE_PAD, ROBOT, SOLAR, EV],
    fillTries: 200,
    ground: () => 'lawn',
    yard: 'plaza',
  },
];
