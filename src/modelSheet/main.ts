/**
 * `/models.html`: every model of the 3D office kit on a turntable, with its
 * name, lit like a level. A dev page for building and reviewing models; not
 * part of the game build.
 */

import * as THREE from 'three';
import { applyPose, createDeveloper, createManager } from '../render/three/Characters';
import { type Model, kitMaterials } from '../render/three/kit';
import { type PoseInput, playerPose } from '../render/three/pose';
import { dressScene } from '../render/three/look';
import { GLOW_BOOST } from '../render/three/MapView';
import { STATION_MODELS, WALL_DECO_MODELS, floorModel, wallModel } from '../render/three/models';
import { FLOOR_THEMES, WALL_THEMES } from '../render/MapRenderer';

const SPACING = 1.7;
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
      pose.rightHand = { x: 0.24, y: 0.5, z: 0.2 };
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
};

const entries: Entry[] = [
  ...Object.entries(STATION_MODELS),
  ...people,
  ...WALL_THEMES.flatMap((theme): Entry[] => [
    [`wall ${theme}`, () => wallModel(theme, 'wall')],
    [`wall-front ${theme}`, () => wallModel(theme, 'wall-front')],
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
materials.glow.color.setScalar(GLOW_BOOST);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.NeutralToneMapping;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
dressScene(scene, renderer);
scene.add(new THREE.HemisphereLight(0xc9dcff, 0x6e5a48, 0.75));
const sun = new THREE.DirectionalLight(0xffe9c7, 3.2);
sun.position.set(-4, 9, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14 });
scene.add(sun);

const rows = Math.ceil(entries.length / COLUMNS);
const turntables: THREE.Group[] = [];
const labels = document.getElementById('labels');
const labelEls: [HTMLDivElement, THREE.Vector3][] = [];
entries.forEach(([name, make], i) => {
  const made = make();
  const table = new THREE.Group();
  const x = ((i % COLUMNS) - (COLUMNS - 1) / 2) * SPACING;
  const z = (Math.floor(i / COLUMNS) - (rows - 1) / 2) * SPACING;
  table.position.set(x, 0, z);
  if (made instanceof THREE.Object3D) {
    table.add(made);
  } else {
    const layers: [THREE.BufferGeometry | null, THREE.Material][] = [
      [made.body, materials.body],
      [made.glow, materials.glow],
      [made.glass, materials.glass],
    ];
    for (const [geometry, material] of layers) {
      if (!geometry?.getAttribute('position')) continue;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = material === materials.body;
      mesh.receiveShadow = true;
      table.add(mesh);
    }
  }
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
  const pitch = (56 * Math.PI) / 180;
  camera.position.set(0, Math.sin(pitch) * distance, Math.cos(pitch) * distance);
  camera.lookAt(0, 0, 0);
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
