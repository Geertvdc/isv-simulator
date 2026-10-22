import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * A tiny kit for building models in code: rounded boxes, cylinders, spheres
 * and the like, each with one color, merged into a single geometry with
 * vertex colors. A model is two geometries: `body` (matte) and `glow`
 * (screens and LEDs, drawn emissive so they bloom). Every model shares the
 * same two materials, so a level's props are a few instanced draw calls.
 *
 * Models stand on the floor at the origin, one tile wide, built facing the
 * camera (+z); `ModelPart` transforms place the pieces.
 */

/** Edge rounding on boxes: the soft toy look. */
export const BEVEL = 0.025;

export interface Model {
  body: THREE.BufferGeometry;
  glow: THREE.BufferGeometry | null;
  glass: THREE.BufferGeometry | null;
}

export interface Place {
  /** Position of the piece's center. */
  at?: [number, number, number];
  /** Rotation in radians around x, y, z. */
  rot?: [number, number, number];
}

/** Collects colored pieces into a model. */
export class ModelBuilder {
  private readonly body: THREE.BufferGeometry[] = [];
  private readonly glow: THREE.BufferGeometry[] = [];
  private readonly glass: THREE.BufferGeometry[] = [];

  /** A box `w` × `h` × `d` with rounded edges. */
  box(w: number, h: number, d: number, color: number, place: Place = {}, bevel = BEVEL): this {
    const r = Math.min(bevel, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
    // Rounding costs ~150 triangles a box; on thin strips and tiny bevels it doesn't show.
    const rounded = r >= 0.01 && Math.min(w, h, d) >= 0.08;
    const geometry = rounded
      ? new RoundedBoxGeometry(w, h, d, 2, r)
      : new THREE.BoxGeometry(w, h, d);
    return this.add(geometry, color, place);
  }

  /** A box resting on `y` (its bottom), centered on x and z. */
  slab(w: number, h: number, d: number, color: number, x: number, y: number, z: number): this {
    return this.box(w, h, d, color, { at: [x, y + h / 2, z] });
  }

  cylinder(
    rTop: number,
    rBottom: number,
    h: number,
    color: number,
    place: Place = {},
    sides = 20,
  ): this {
    return this.add(new THREE.CylinderGeometry(rTop, rBottom, h, sides), color, place);
  }

  sphere(
    r: number,
    color: number,
    place: Place = {},
    scale: [number, number, number] = [1, 1, 1],
  ): this {
    const geometry = new THREE.SphereGeometry(r, 16, 12);
    geometry.scale(...scale);
    return this.add(geometry, color, place);
  }

  capsule(r: number, length: number, color: number, place: Place = {}): this {
    return this.add(new THREE.CapsuleGeometry(r, length, 4, 12), color, place);
  }

  torus(r: number, tube: number, color: number, place: Place = {}, arc = Math.PI * 2): this {
    return this.add(new THREE.TorusGeometry(r, tube, 8, 24, arc), color, place);
  }

  cone(r: number, h: number, color: number, place: Place = {}, sides = 16): this {
    return this.add(new THREE.ConeGeometry(r, h, sides), color, place);
  }

  /** A flat glowing panel (a screen) `w` × `h`, facing +z before `place` turns it. */
  screen(w: number, h: number, color: number, place: Place = {}): this {
    return this.add(new THREE.PlaneGeometry(w, h), color, place, 'glow');
  }

  /** A small glowing sphere (an LED). */
  led(r: number, color: number, place: Place = {}): this {
    return this.add(new THREE.SphereGeometry(r, 8, 6), color, place, 'glow');
  }

  /** A see-through box (a glass pane), drawn with the glass material. */
  pane(w: number, h: number, d: number, color: number, place: Place = {}): this {
    return this.add(new THREE.BoxGeometry(w, h, d), color, place, 'glass');
  }

  /** Any geometry, for one-off shapes. */
  add(
    geometry: THREE.BufferGeometry,
    color: number,
    place: Place,
    layer: 'body' | 'glow' | 'glass' = 'body',
  ): this {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    g.deleteAttribute('uv');
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...(place.at ?? [0, 0, 0])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(place.rot ?? [0, 0, 0]))),
      new THREE.Vector3(1, 1, 1),
    );
    g.applyMatrix4(m);
    paint(g, color);
    this[layer].push(g);
    return this;
  }

  build(): Model {
    const body = mergeAll(this.body);
    const glow = this.glow.length > 0 ? mergeAll(this.glow) : null;
    const glass = this.glass.length > 0 ? mergeAll(this.glass) : null;
    return { body, glow, glass };
  }
}

function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (parts.length === 0) return new THREE.BufferGeometry();
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  return merged;
}

/** Sets every vertex of `g` to `color` (linear, like three.js expects vertex colors). */
function paint(g: THREE.BufferGeometry, color: number): void {
  const c = new THREE.Color(color);
  const count = g.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/** The shared materials every model draws with. */
export interface KitMaterials {
  body: THREE.MeshStandardMaterial;
  glow: THREE.MeshBasicMaterial;
  glass: THREE.MeshStandardMaterial;
}

/**
 * Screens and LEDs draw this much brighter than their color: over white, so
 * they (and only they) bloom. Only with post-processing; without it the
 * colors would clip, so the stage sets it per quality (`GLOW_BOOST_KEY`).
 */
export const GLOW_BOOST = 2.5;
/** `userData` key on materials whose color the stage sets to the glow boost. */
export const GLOW_BOOST_KEY = 'glowBoost';

export function kitMaterials(): KitMaterials {
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  glow.userData[GLOW_BOOST_KEY] = GLOW_BOOST;
  glow.color.setScalar(GLOW_BOOST);
  return {
    body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 }),
    // Unlit and brighter than white, so screens and LEDs bloom.
    glow,
    glass: new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.1,
      metalness: 0,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    }),
  };
}

/** `color` mixed `amount` of the way to white (or to black for a negative amount). */
export function tint(color: number, amount: number): number {
  const c = new THREE.Color(color);
  return amount >= 0
    ? c.lerp(new THREE.Color(0xffffff), amount).getHex()
    : c.lerp(new THREE.Color(0x000000), -amount).getHex();
}
