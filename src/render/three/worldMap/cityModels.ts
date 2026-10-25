import { type CityPiece, type PieceKind, seeded } from './cityPlan';
import type { Parts, PieceBuilders } from './models/shared';
import { bike, fence, garage, house, mailbox } from './models/garageTown';
import { bench, cowork, kiosk, picnic, pingPong, scooter, warehouse } from './models/startupPark';
import { car, crane, lamp, office } from './models/downtown';
import { fountain, hq, planter, tower } from './models/enterpriseCity';
import { campus, glassTower, hedge, helipad, skyscraper } from './models/campus';
import {
  antenna,
  cooling,
  dish,
  dronePad,
  evCharger,
  robot,
  serverRack,
  solar,
  spool,
} from './models/engineering';
import { bikeRack, bin, busStop, foodTruck, hydrant, shed } from './models/street';

/**
 * The world map's set pieces, built in code like the office kit: chunky,
 * rounded and toy-like. Each model stands on the ground at the origin,
 * facing the camera (+z), sized to its piece's footprint (`w` along x, `d`
 * along z) and height. `body` is matte, `shiny` is glass that reflects the
 * sky, `glow` is lit windows and screens, `blink` is the warning lights
 * that blink on cranes and towers.
 */

export type { PieceBuilders } from './models/shared';
export { CRANE, carModel, craneJib } from './models/downtown';
export { TREE_HEIGHT, treeModel } from './models/trees';

/** Each kind's model; trees are instanced instead (see `treeModel`). */
const MODELS: Record<PieceKind, ((p: CityPiece, parts: Parts, rng: () => number) => void) | null> =
  {
    house: house,
    garage: garage,
    fence: fence,
    mailbox: mailbox,
    bike: bike,
    warehouse: warehouse,
    cowork: cowork,
    kiosk: kiosk,
    scooter: scooter,
    bench: bench,
    pingPong: pingPong,
    picnic: picnic,
    office: office,
    crane: crane,
    lamp: lamp,
    car: car,
    tower: tower,
    hq: hq,
    fountain: fountain,
    planter: planter,
    glassTower: glassTower,
    campus: campus,
    skyscraper: skyscraper,
    helipad: helipad,
    hedge: hedge,
    serverRack: serverRack,
    dish: dish,
    antenna: antenna,
    solar: solar,
    cooling: cooling,
    spool: spool,
    dronePad: dronePad,
    robot: robot,
    evCharger: evCharger,
    shed: shed,
    bin: bin,
    hydrant: hydrant,
    busStop: busStop,
    bikeRack: bikeRack,
    foodTruck: foodTruck,
    tree: null,
    roundTree: null,
    pine: null,
    birch: null,
    palm: null,
    bush: null,
  };

/** Builds piece `p`'s model into `builders`, in the piece's own frame. */
export function buildPiece(p: CityPiece, builders: PieceBuilders): void {
  const rng = seeded(Math.floor(p.variant * 1e9));
  const parts: Parts = { ...builders, glow: builders.body };
  MODELS[p.kind]?.(p, parts, rng);
}
