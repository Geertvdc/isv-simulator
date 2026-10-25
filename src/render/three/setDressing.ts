import type { SetPiece } from './setDressing/shared';
import {
  bike,
  bins,
  bushes,
  car,
  cat,
  drums,
  fencePanel,
  hoop,
  kennel,
  oldPCs,
  shed,
  shelves,
  tires,
  tree,
  workbench,
} from './setDressing/garage';
import {
  arcade,
  beanbags,
  bigPlant,
  bookshelf,
  coffeeBar,
  foosball,
  fridge,
  highTable,
  miniRamp,
  neonSign,
  pingPong,
  serverRack,
  standingDesk,
  whiteboardStand,
} from './setDressing/startup';
import {
  cabinets,
  coatRack,
  cubicle,
  kitchenIsland,
  lobbySign,
  lockers,
  meetingPod,
  phoneBooth,
  printer,
  screenWall,
  shredder,
  sofa,
  teamDesk,
  vending,
  waterCooler,
} from './setDressing/offices';
import {
  bench,
  bikeRack,
  dronePad,
  foodTruck,
  fountain,
  lampPost,
  picnicTable,
  scooterDock,
  sculpture,
  shuttleStop,
  solarPanels,
  sortingBins,
} from './setDressing/bigTech';

/**
 * Props for the world around a level (phase 15): what stands outside the
 * office, per chapter. Each stands on the ground at the origin, fronts
 * toward +z, and takes up `size` tiles (x by z) of ground. Some seat
 * people (`seats`): background characters placed and animated by
 * `surroundings.ts`.
 *
 * Most props come in a few looks (`variants`, phase 20): different plants
 * in a pot, other things on a shelf, another paint job. `surroundings.ts`
 * picks the look per placement and tints and sizes each one a little, so
 * two of the same prop rarely look alike.
 */

export type { Seat, SeatPose, SetPiece } from './setDressing/shared';
export { WALL_TOP_PROPS } from './setDressing/wallTops';

/**
 * What a chapter's world is made of, the ground it stands on (darker than
 * the office floor, so the eye stays inside), and what fills its rows.
 */
export interface Setting {
  ground: number;
  /** A strip along the left of the level (a driveway, an aisle), or none. */
  path: number | null;
  /** Props near the office walls, and further out. */
  near: readonly SetPiece[];
  far: readonly SetPiece[];
  /** Props that show once per level (the car, the cat), at the start of a far row. */
  rare: readonly SetPiece[];
  /** How many background people walk a loop. */
  walkers: number;
}

export const SETTINGS: Readonly<Record<string, Setting>> = {
  garage: {
    ground: 0x3e5a35,
    path: 0x3a3e46,
    near: [shelves, bike, drums, workbench, bins, tires, oldPCs],
    far: [tree, bushes, shed, fencePanel, kennel],
    rare: [car, cat, hoop],
    walkers: 0,
  },
  startup: {
    // Polished concrete: apart from the wood walls and the slab's edge.
    ground: 0x3a3f47,
    path: null,
    near: [bigPlant, coffeeBar, arcade, beanbags, standingDesk, bookshelf, whiteboardStand, fridge],
    far: [pingPong, sofa, foosball, highTable, serverRack, miniRamp],
    rare: [neonSign],
    walkers: 1,
  },
  'scale-up': {
    ground: 0x485666,
    path: 0x3f4b5a,
    near: [teamDesk, sofa, screenWall, standingDesk, whiteboardStand, bookshelf, bigPlant],
    far: [meetingPod, bigPlant, kitchenIsland, phoneBooth, serverRack, lockers],
    rare: [],
    walkers: 2,
  },
  enterprise: {
    ground: 0x6b6253,
    path: 0x5a5245,
    near: [cubicle, printer, cabinets, waterCooler, vending, coatRack, shredder],
    far: [meetingPod, bigPlant, bookshelf, lockers, serverRack, phoneBooth],
    rare: [lobbySign],
    walkers: 2,
  },
  'big-tech': {
    // Lawns round the campus, with a paved path.
    ground: 0x41663a,
    path: 0x5a5e66,
    near: [picnicTable, bikeRack, bigPlant, bench, sortingBins, scooterDock, dronePad, lampPost],
    far: [tree, foodTruck, bushes, solarPanels, shuttleStop],
    rare: [fountain, sculpture],
    walkers: 3,
  },
};
