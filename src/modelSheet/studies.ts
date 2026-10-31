import * as THREE from 'three';
import monorepoText from '../../maps/level-15-monorepo.txt?raw';
import { CAMERA_FIT_PADDING, CAMERA_HUD_BOTTOM, PLAYER_RADIUS } from '../sim/balance';
import { parseLevelMap } from '../sim/level';
import { DEFAULT_LOOK, LEVEL_LOOKS } from '../render/mapLook';
import { playerColor } from '../render/playerColors';
import { type CameraPose, fitCamera3d, projectPoint } from '../render/projection';
import {
  STUDY_NAMES,
  STUDY_STYLES,
  type StudyCharacter,
  type StudyStyle,
  createStudy,
  disposeStudy,
  poseStudy,
} from '../render/three/CharacterStudies';
import { buildMap } from '../render/three/MapView';
import { type Model, kitMaterials } from '../render/three/kit';
import { levelBox } from '../render/three/layout';
import { createLights, dressScene } from '../render/three/look';
import { ticketModel } from '../render/three/ticketModels';
import { Stage, disposeTree } from '../render/three/stage';
import { STUDY_ACTIONS, STUDY_LOOP_MS, type StudyAction, studyFrame } from './studyScenes';
import './studies.css';

document.body.classList.add('study-page');
document.title = '21a hat-free character studies';
const params = new URLSearchParams(location.search);
const sceneKind = params.get('view') === 'office' ? 'office' : 'models';
const selected = STUDY_STYLES.find((style) => style === params.get('style')) ?? 'all';
let action: StudyAction = STUDY_ACTIONS.find((a) => a === params.get('action')) ?? 'carry';
let paused = params.has('still');
let time = Number(params.get('time') ?? 900);
if (!Number.isFinite(time)) time = 900;
let rear = params.has('rear');
let gray = params.has('gray');

const controls = document.createElement('section');
controls.className = 'study-controls';
controls.setAttribute('aria-label', 'Character study controls');
controls.innerHTML = `
  <h1>Three hat-free studies. No final cast selected.</h1>
  <p>21a visual investigation · playable characters unchanged · <a href="/models.html">Office kit</a></p>
  <div class="study-toolbar">
    <label>View <select id="study-view"><option value="models">Model comparison (enlarged)</option><option value="office">Monorepo (gameplay scale)</option></select></label>
    <label>Study <select id="study-style"><option value="all">All three languages</option>${STUDY_STYLES.map((s) => `<option value="${s}">${STUDY_NAMES[s]} · four copies</option>`).join('')}</select></label>
    <label>Action <select id="study-action">${STUDY_ACTIONS.map((a) => `<option>${a}</option>`).join('')}</select></label>
    <label><input id="study-rear" type="checkbox"> Rear</label>
    <label><input id="study-gray" type="checkbox"> Grayscale</label>
    <button id="study-pause" type="button">Pause</button>
    <label>Pose time <input id="study-time" type="range" min="0" max="${STUDY_LOOP_MS - 1}" step="1"><output id="study-time-label"></output></label>
  </div>`;
document.body.append(controls);
const names = document.createElement('div');
names.className = 'study-names';
document.body.append(names);
const caption = document.createElement('p');
caption.className = 'study-caption';
caption.textContent =
  sceneKind === 'office'
    ? 'Isolated office pose preview · real Monorepo map, game camera fit, lighting and renderer · no simulation or role stats. Throw release is illustrative.'
    : 'Enlarged review, not gameplay scale · front pair faces forward, back pair faces away · switch to Monorepo to judge size. No style is approved yet.';
document.body.append(caption);

function select(id: string): HTMLSelectElement {
  const el = controls.querySelector<HTMLSelectElement>(`#${id}`);
  if (!el) throw new Error(`Missing study control: ${id}`);
  return el;
}
function input(id: string): HTMLInputElement {
  const el = controls.querySelector<HTMLInputElement>(`#${id}`);
  if (!el) throw new Error(`Missing study control: ${id}`);
  return el;
}
const viewControl = select('study-view');
const styleControl = select('study-style');
const actionControl = select('study-action');
const rearControl = input('study-rear');
const grayControl = input('study-gray');
const timeControl = input('study-time');
const pauseControl = controls.querySelector<HTMLButtonElement>('#study-pause');
const timeLabel = controls.querySelector<HTMLOutputElement>('#study-time-label');
viewControl.value = sceneKind;
styleControl.value = selected;
actionControl.value = action;
rearControl.checked = rear;
grayControl.checked = gray;

function saveParams(): void {
  const query = new URLSearchParams({
    studies: '',
    view: viewControl.value,
    style: styleControl.value,
    action,
    time: String(Math.round(time % STUDY_LOOP_MS)),
  });
  if (paused) query.set('still', '');
  if (rear) query.set('rear', '');
  if (gray) query.set('gray', '');
  history.replaceState(null, '', `?${query}`);
}
for (const el of [viewControl, styleControl]) {
  el.addEventListener('change', () => {
    saveParams();
    location.reload();
  });
}
actionControl.addEventListener('change', () => {
  action = STUDY_ACTIONS.find((a) => a === actionControl.value) ?? 'idle';
  saveParams();
});
rearControl.addEventListener('change', () => {
  rear = rearControl.checked;
  saveParams();
});
grayControl.addEventListener('change', () => {
  gray = grayControl.checked;
  saveParams();
});
pauseControl?.addEventListener('click', () => {
  paused = !paused;
  saveParams();
});
timeControl.addEventListener('input', () => {
  time = Number(timeControl.value);
  paused = true;
  saveParams();
});

const parent = document.createElement('div');
parent.id = 'study-stage';
document.body.prepend(parent);
const stage = new Stage(parent);
// Fixed quality makes before/after comparisons reproducible on slower machines.
stage.setGraphics('low');
const scene = new THREE.Scene();
dressScene(scene, stage.renderer);
const materials = kitMaterials();
const map = parseLevelMap(monorepoText);
const office = sceneKind === 'office';
const mapView = office ? buildMap(map, LEVEL_LOOKS.monorepo ?? DEFAULT_LOOK) : null;
if (mapView) scene.add(mapView.root);
scene.add(...createLights(office ? map : { width: 12, height: 6 }));

function addModel(model: Model): THREE.Group {
  const group = new THREE.Group();
  for (const [geometry, material] of [
    [model.body, materials.body],
    [model.glow, materials.glow],
    [model.glass, materials.glass],
  ] as const) {
    if (!geometry) continue;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

const actors: {
  character: StudyCharacter;
  ticket: THREE.Group;
  facing: THREE.Group;
  yaw: number;
}[] = [];
const labels: { el: HTMLDivElement; at: { x: number; y: number; z: number } }[] = [];
const ringGeometry = new THREE.RingGeometry(PLAYER_RADIUS * 0.95, PLAYER_RADIUS * 1.25, 40).rotateX(
  -Math.PI / 2,
);
const card = ticketModel('feature');
const positions = [
  [4, 2],
  [12, 2],
  [4, 7],
  [11, 7],
] as const;
const styles = selected === 'all' ? STUDY_STYLES : [selected];
const descriptions: Record<StudyStyle, string> = {
  angular: 'Cut shoulders · swept block hair · compact stride',
  clay: 'Pear jacket · scalloped curls · soft waddle',
  cartoon: 'Wide shoulders · narrow waist · long stride',
};
for (const [styleIndex, style] of styles.entries()) {
  const count = office && selected === 'all' ? (styleIndex === 0 ? 2 : 1) : 4;
  for (let n = 0; n < count; n++) {
    const index = actors.length;
    const id = (office && selected === 'all' ? index : n) + 1;
    const character = createStudy(style, id, materials);
    const ticket = addModel(card);
    const anchor = new THREE.Group();
    const facing = new THREE.Group();
    const at = positions[index];
    if (office && !at) throw new Error('Office study supports exactly four players');
    const x = office && at ? at[0] : styleIndex * 3.4 + (n % 2) * 1.15;
    const z = office && at ? at[1] : Math.floor(n / 2) * 2.2;
    anchor.position.set(x, 0, z);
    facing.add(character.root, ticket);
    anchor.add(facing);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: playerColor(id) });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.y = 0.006;
    anchor.add(ring);
    // Floor numbers preserve identity without introducing role/color semantics.
    const number = document.createElement('canvas');
    number.width = number.height = 64;
    const ctx = number.getContext('2d');
    if (!ctx) throw new Error('Cannot draw study player number');
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 48px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(String(id), 32, 49);
    const texture = new THREE.CanvasTexture(number);
    const badge = new THREE.Mesh(
      new THREE.PlaneGeometry(0.23, 0.23).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true }),
    );
    badge.position.set(0, 0.012, 0.41);
    anchor.add(badge);
    scene.add(anchor);
    actors.push({ character, ticket, facing, yaw: !office && n >= 2 ? Math.PI : 0 });
  }
  if (!office) {
    const el = document.createElement('div');
    el.className = 'study-name';
    const title = document.createElement('strong');
    title.textContent = STUDY_NAMES[style];
    const description = document.createElement('span');
    description.textContent = descriptions[style];
    el.append(title, description);
    names.append(el);
    labels.push({ el, at: { x: styleIndex * 3.4 + 0.575, y: 0, z: 3.1 } });
  }
}
if (!office) {
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(styles.length * 3.4, 0.12, 5.2),
    new THREE.MeshStandardMaterial({ color: 0x58766c, roughness: 0.9 }),
  );
  floor.position.set((styles.length - 1) * 1.7 + 0.575, -0.07, 0.9);
  floor.receiveShadow = true;
  scene.add(floor);
}
let cameraPose: CameraPose;
function resize(): void {
  const width = innerWidth;
  const height = innerHeight;
  stage.resize(width, height);
  cameraPose = fitCamera3d(
    office
      ? levelBox(map)
      : {
          min: { x: -0.9, y: -0.2, z: -1.7 },
          max: { x: (styles.length - 1) * 3.4 + 2.1, y: 1.6, z: 3.5 },
        },
    { width, height },
    office
      ? {
          top: CAMERA_FIT_PADDING + height * 0.1,
          right: CAMERA_FIT_PADDING,
          bottom: CAMERA_FIT_PADDING + height * CAMERA_HUD_BOTTOM,
          left: CAMERA_FIT_PADDING,
        }
      : { top: controls.offsetHeight + 20, right: 30, bottom: 72, left: 30 },
  );
  stage.setPose(cameraPose);
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
    actor.facing.rotation.y = actor.yaw + (rear ? Math.PI : 0);
    poseStudy(actor.character, frame.input, time);
    actor.ticket.visible = frame.ticket !== null;
    if (frame.ticket) actor.ticket.position.set(frame.ticket.x, frame.ticket.y, frame.ticket.z);
    actor.ticket.rotation.y = frame.ticketYaw;
  }
  parent.style.filter = gray ? 'grayscale(1)' : '';
  mapView?.update(time);
  stage.render(scene, delta);
  for (const label of labels) {
    const p = projectPoint(cameraPose, label.at);
    label.el.style.left = `${p.x}px`;
    label.el.style.top = `${p.y}px`;
  }
  if (pauseControl) pauseControl.textContent = paused ? 'Animate' : 'Pause';
  timeControl.value = String(Math.round(time % STUDY_LOOP_MS));
  if (timeLabel) timeLabel.value = `${Math.round(time % STUDY_LOOP_MS)} ms`;
  document.body.dataset.studyReady = 'true';
});
window.addEventListener('pagehide', () => {
  stage.renderer.setAnimationLoop(null);
  window.removeEventListener('resize', resize);
  for (const actor of actors) disposeStudy(actor.character);
  stage.forget(scene);
  disposeTree(scene);
  for (const geometry of [card.body, card.glow, card.glass]) geometry?.dispose();
  for (const material of [materials.body, materials.glow, materials.glass, materials.character]) {
    material.dispose();
  }
  if (scene.background instanceof THREE.Texture) scene.background.dispose();
  stage.renderer.dispose();
});
