/**
 * `/models.html`: every model of the 3D office kit on a turntable, with its
 * name, lit like a level. A dev page for building and reviewing models; not
 * part of the game build.
 */

import * as THREE from 'three';
import { applyPose, createDeveloper, createManager } from '../render/three/Characters';
import { type KitMaterials, type Model, kitMaterials } from '../render/three/kit';
import { type PoseInput, playerPose } from '../render/three/pose';
import { createLights, dressScene } from '../render/three/look';
import {
  STATION_MODELS,
  type StationModel,
  WALL_DECO_MODELS,
  floorModel,
  ticketModel,
  wallModel,
} from '../render/three/models';
import { VIEW3D_PITCH } from '../render/projection';
import { STATION_HEIGHT } from '../render/three/layout';
import { FLOOR_THEMES, WALL_THEMES } from '../render/mapLook';
import { ROLE_IDS } from '../sim/roles';
import { ROLE_LABELS } from '../sim/content';
import { DEVELOPER_HAIRSTYLES, developerAppearance } from '../render/three/DeveloperRig';

const SPACING = 2.2;
const COLUMNS = 7;

/** A model, or a character in a pose (a group of its own). */
type Entry = [string, () => Model | THREE.Object3D];

const POSES: [string, Partial<PoseInput>][] = [
  ['idle', {}],
  ['carrying', { carrying: true }],
  ['working', { working: true }],
  ['dashing', { dashing: true, speed: 14 }],
];

const people: Entry[] = [
  ...ROLE_IDS.flatMap((role) =>
    DEVELOPER_HAIRSTYLES.map((hairstyle): Entry => [
      `${ROLE_LABELS[role]} ${hairstyle} hair`,
      () => {
        const c = createDeveloper(1, materials, role, { ...developerAppearance(1), hairstyle });
        applyPose(c, playerPose(IDLE, 0));
        return c.root;
      },
    ]),
  ),
  ...POSES.map(([pose, input], i): Entry => [
    `player ${i + 1} ${pose}`,
    () => {
      const c = createDeveloper(i + 1, materials);
      applyPose(c, playerPose({ ...IDLE, ...input }, 0));
      return c.root;
    },
  ]),
  [
    'manager',
    () => {
      const c = createManager(materials);
      const pose = playerPose(IDLE, 0);
      pose.rightHand = { x: 0.42, y: 0.55, z: 0.3 };
      applyPose(c, pose);
      return c.root;
    },
  ],
];

const IDLE: PoseInput = {
  speed: 0,
  fullSpeed: 5,
  carrying: false,
  working: false,
  dashing: false,
  windUp: 0,
  shovedMs: null,
  phase: 0,
  stride: 0,
};

/** A station's base with its hero prop standing on it. */
function station(model: StationModel, materials: KitMaterials): THREE.Object3D {
  const group = new THREE.Group();
  group.add(meshes(model.base, materials));
  if (model.hero) {
    const hero = meshes(model.hero, materials);
    hero.position.set(model.heroAt[0], 0, model.heroAt[1]);
    group.add(hero);
  }
  return group;
}

function meshes(model: Model, materials: KitMaterials): THREE.Group {
  const group = new THREE.Group();
  const layers: [THREE.BufferGeometry | null, THREE.Material][] = [
    [model.body, materials.body],
    [model.glow, materials.glow],
    [model.glass, materials.glass],
  ];
  for (const [geometry, material] of layers) {
    if (!geometry?.getAttribute('position')) continue;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = material === materials.body;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

const entries: Entry[] = [
  ...Object.entries(STATION_MODELS).map(([name, make]): Entry => [
    name,
    () => station(make(), materials),
  ]),
  ...(['feature', 'bug', 'incident'] as const).map((kind): Entry => [
    `ticket ${kind}`,
    () => {
      // On a plain counter, as on a level, and bigger so it shows.
      const group = station(STATION_MODELS.counter(), materials);
      const ticket = meshes(ticketModel(kind), materials);
      ticket.position.y = STATION_HEIGHT;
      ticket.scale.setScalar(1.5);
      group.add(ticket);
      return group;
    },
  ]),
  ...people,
  ...WALL_THEMES.flatMap((theme): Entry[] => [
    [`wall ${theme}`, () => wallModel(theme, 'wall')],
    [`wall-front ${theme}`, () => wallModel(theme, 'wall-front')],
    [`wall-inner ${theme}`, () => wallModel(theme, 'wall-inner')],
  ]),
  ...FLOOR_THEMES.map((theme): [string, () => Model] => [
    `floor ${theme}`,
    () => floorModel(theme),
  ]),
  ...Object.entries(WALL_DECO_MODELS).map(([name, make]): Entry => [
    `deco ${name}`,
    () => {
      // Hung on a plaster wall, as in a level.
      const wall = wallModel('plaster', 'wall');
      const deco = make();
      return { body: merge(wall.body, deco.body), glow: deco.glow, glass: null };
    },
  ]),
];

function merge(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const x = a.getAttribute(name);
    const y = b.getAttribute(name);
    const data = new Float32Array(x.array.length + y.array.length);
    data.set(x.array);
    data.set(y.array, x.array.length);
    out.setAttribute(name, new THREE.BufferAttribute(data, 3));
  }
  return out;
}

const materials = kitMaterials();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.NeutralToneMapping;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
dressScene(scene, renderer);
const rows = Math.ceil(entries.length / COLUMNS);
// The game's lights, fitted to the grid as if it were a level.
scene.add(...createLights({ width: COLUMNS * SPACING, height: rows * SPACING }));

const turntables: THREE.Group[] = [];
const labels = document.getElementById('labels');
const labelEls: [HTMLDivElement, THREE.Vector3][] = [];
entries.forEach(([name, make], i) => {
  const made = make();
  const table = new THREE.Group();
  const x = (i % COLUMNS) * SPACING;
  const z = Math.floor(i / COLUMNS) * SPACING;
  table.position.set(x, 0, z);
  table.add(made instanceof THREE.Object3D ? made : meshes(made, materials));
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 0.8, 0.04, 40),
    new THREE.MeshStandardMaterial({ color: 0x3a4256, roughness: 0.9 }),
  );
  plate.position.y = -0.03;
  plate.receiveShadow = true;
  table.add(plate);
  scene.add(table);
  turntables.push(table);
  const label = document.createElement('div');
  label.textContent = name;
  labels?.append(label);
  labelEls.push([label, new THREE.Vector3(x, -0.05, z + 0.85)]);
});

const camera = new THREE.PerspectiveCamera(28, 1, 0.5, 200);
const still = new URLSearchParams(window.location.search).has('still');

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  // Same tilt as the game camera, far enough back for the whole grid.
  const span = Math.max((COLUMNS * SPACING) / camera.aspect, rows * SPACING * 1.2);
  const distance = span / (2 * Math.tan((camera.fov * Math.PI) / 360)) + 4;
  // The game camera's tilt, looking at the middle of the grid.
  const pitch = VIEW3D_PITCH;
  const cx = ((COLUMNS - 1) * SPACING) / 2;
  const cz = ((rows - 1) * SPACING) / 2;
  camera.position.set(cx, Math.sin(pitch) * distance, cz + Math.cos(pitch) * distance);
  camera.lookAt(cx, 0, cz);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

renderer.setAnimationLoop((t: number) => {
  for (const table of turntables) table.rotation.y = still ? 0 : Math.sin(t / 2400) * 0.8;
  renderer.render(scene, camera);
  for (const [el, at] of labelEls) {
    const p = at.clone().project(camera);
    el.style.left = `${((p.x + 1) / 2) * window.innerWidth}px`;
    el.style.top = `${((1 - p.y) / 2) * window.innerHeight}px`;
  }
});
