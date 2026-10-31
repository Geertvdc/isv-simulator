/**
 * Dev-only model sheet for the production developers: one role turned round
 * (front, three-quarter, side, back) or the whole crew in a row, on a plain
 * studio backdrop. `?turnaround&role=<role>` or `?turnaround&lineup`, plus
 * `&action=<action>&time=<ms>&still`, `&rear` and `&gray` for the lineup.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ROLE_LABELS } from '../sim/content';
import { ROLE_IDS, type RoleId } from '../sim/roles';
import {
  applyPose,
  createDeveloper,
  disposeCharacter,
  type Character,
} from '../render/three/Characters';
import { DEVELOPER_HAIRSTYLES, developerAppearance } from '../render/three/DeveloperRig';
import { kitMaterials } from '../render/three/kit';
import { playerPose } from '../render/three/pose';
import { ticketModel } from '../render/three/ticketModels';
import { Stage, disposeTree } from '../render/three/stage';
import { STUDY_ACTIONS, studyFrame, type StudyAction } from './studyScenes';
import './studies.css';

const params = new URLSearchParams(location.search);
const lineup = params.has('lineup');
const role: RoleId = ROLE_IDS.find((r) => r === params.get('role')) ?? 'generalist';
const action: StudyAction = STUDY_ACTIONS.find((a) => a === params.get('action')) ?? 'idle';
let time = Number(params.get('time') ?? (action === 'throw' ? 1200 : 900));
if (!Number.isFinite(time)) throw new Error('Invalid pose time');
const paused = params.has('still');
const rear = params.has('rear');
const gray = params.has('gray');
const SCENE_BACKDROP = 0x4a4a4a;
const SPACING = lineup ? 1.12 : 1.18;

document.body.classList.add('study-page');
document.title = lineup ? 'Developer line-up' : `${ROLE_LABELS[role]} turnaround`;
document.body.style.background = '#2e2e2e';
const parent = document.createElement('div');
parent.id = 'study-stage';
document.body.prepend(parent);
const labels = document.createElement('div');
labels.style.cssText =
  'position:fixed;inset:0;pointer-events:none;font:600 15px/1.2 system-ui,sans-serif;color:#d8d8d8';
document.body.append(labels);

const stage = new Stage(parent);
stage.setGraphics('high');
const scene = new THREE.Scene();
// The post chain (tone mapping) darkens the clear color, so the scene asks
// for a lighter gray that lands on #2e2e2e on screen.
scene.background = new THREE.Color(SCENE_BACKDROP);
const pmrem = new THREE.PMREMGenerator(stage.renderer);
const room = new RoomEnvironment();
const environment = pmrem.fromScene(room, 0.04).texture;
room.dispose();
scene.environment = environment;
scene.environmentIntensity = 0.55;

// Studio lights: a warm key from the front left, a cool fill, a rim from behind.
const key = new THREE.DirectionalLight(0xfff1de, 2.3);
key.position.set(-3, 6, 7);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
const extent = SPACING * 3;
Object.assign(key.shadow.camera, {
  left: -extent,
  right: extent,
  top: 3,
  bottom: -2,
  near: 1,
  far: 20,
});
const fill = new THREE.DirectionalLight(0xcfe0ff, 0.7);
fill.position.set(5, 3, 4);
const rim = new THREE.DirectionalLight(0xffffff, 1.6);
rim.position.set(1, 5, -6);
const sky = new THREE.HemisphereLight(0xe8eeff, 0x3a3530, 0.6);
const center = new THREE.Group();
key.target = center;
scene.add(key, fill, rim, sky, center);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2),
  new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.32 }),
);
ground.receiveShadow = true;
scene.add(ground);

const materials = kitMaterials();
const folder = ticketModel('feature');
interface Actor {
  character: Character;
  anchor: THREE.Group;
  ticket: THREE.Mesh;
  yaw: number;
  label: string;
}
const actors: Actor[] = [];
const place = (character: Character, x: number, yaw: number, label: string): void => {
  const anchor = new THREE.Group();
  anchor.position.x = x;
  const ticket = new THREE.Mesh(folder.body, materials.body);
  ticket.castShadow = true;
  anchor.add(character.root, ticket);
  scene.add(anchor);
  actors.push({ character, anchor, ticket, yaw, label });
};
const triangles = (character: Character): number => {
  let count = 0;
  character.root.traverse((part) => {
    if (part instanceof THREE.Mesh) {
      const g = part.geometry as THREE.BufferGeometry;
      const vertices = (g.getAttribute('position') as THREE.BufferAttribute).count;
      count += (g.index ? g.index.count : vertices) / 3;
    }
  });
  return count;
};

if (lineup) {
  ROLE_IDS.forEach((r, i) => {
    const id = (i % 4) + 1;
    const character = createDeveloper(id, materials, r, {
      ...developerAppearance(id),
      hairstyle: DEVELOPER_HAIRSTYLES[i % DEVELOPER_HAIRSTYLES.length] ?? 'swept',
    });
    place(character, (i - 2) * SPACING, -0.55, ROLE_LABELS[r]);
  });
} else {
  const views: [string, number][] = [
    ['Front', 0],
    ['Three-quarter', -0.75],
    ['Side', -Math.PI / 2],
    ['Back', Math.PI],
  ];
  views.forEach(([name, yaw], i) => {
    const character = createDeveloper(1, materials, role);
    place(character, (i - 1.5) * SPACING, yaw, name);
  });
}
const title = document.createElement('div');
title.style.cssText = 'position:absolute;left:24px;top:18px;font-size:20px;color:#f0f0f0';
const first = actors[0];
title.textContent = lineup
  ? `Developer line-up · ${action}${rear ? ' · rear' : ''}`
  : `${ROLE_LABELS[role]} · ${action} · ${first ? Math.round(triangles(first.character)) : 0} triangles`;
labels.append(title);
const tags = actors.map((actor) => {
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;transform:translate(-50%,0);white-space:nowrap';
  el.textContent = actor.label;
  labels.append(el);
  return el;
});

const camera = stage.camera;
function resize(): void {
  stage.resize(innerWidth, innerHeight);
  const aspect = innerWidth / innerHeight;
  camera.fov = 16;
  camera.aspect = aspect;
  const count = actors.length;
  const halfWidth = (count * SPACING) / 2 + 0.05;
  const halfHeight = 0.98;
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const distance = Math.max(halfHeight / tan, halfWidth / (tan * aspect));
  const target = new THREE.Vector3(0, 0.74, 0);
  const pitch = 0.1;
  camera.position.set(0, target.y + Math.sin(pitch) * distance, Math.cos(pitch) * distance);
  camera.lookAt(target);
  camera.near = 0.5;
  camera.far = 80;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

let last: number | null = null;
stage.renderer.setAnimationLoop((now: number) => {
  const delta = last === null ? 0 : Math.min(100, now - last);
  last = now;
  if (!paused) time += delta;
  const frame = studyFrame(action, time);
  for (const actor of actors) {
    actor.anchor.rotation.y = actor.yaw + (rear ? Math.PI : 0);
    applyPose(actor.character, playerPose(frame.input, time));
    actor.ticket.visible = frame.ticket !== null;
    if (frame.ticket) actor.ticket.position.set(frame.ticket.x, frame.ticket.y, frame.ticket.z);
    actor.ticket.rotation.y = frame.ticketYaw;
  }
  parent.style.filter = gray ? 'grayscale(1)' : '';
  stage.render(scene, delta);
  actors.forEach((actor, i) => {
    const p = new THREE.Vector3(actor.anchor.position.x, -0.08, 0).project(camera);
    const tag = tags[i];
    if (!tag) return;
    tag.style.left = `${((p.x + 1) / 2) * innerWidth}px`;
    tag.style.top = `${((1 - p.y) / 2) * innerHeight + 6}px`;
  });
  document.body.dataset.castReady = 'true';
});
window.addEventListener('pagehide', () => {
  stage.renderer.setAnimationLoop(null);
  window.removeEventListener('resize', resize);
  for (const actor of actors) {
    disposeCharacter(actor.character);
    actor.ticket.removeFromParent();
  }
  stage.forget(scene);
  disposeTree(scene);
  for (const geometry of [folder.body, folder.glow, folder.glass]) geometry?.dispose();
  for (const material of [materials.body, materials.glow, materials.glass, materials.character]) {
    material.dispose();
  }
  environment.dispose();
  pmrem.dispose();
  stage.renderer.dispose();
});
