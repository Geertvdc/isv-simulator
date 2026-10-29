/** Dev-only comparison of the production models, not a role-selection screen. */
import * as THREE from 'three';
import { ROLE_LABELS } from '../sim/content';
import { ROLE_IDS, type RoleId } from '../sim/roles';
import { PLAYER_RADIUS } from '../sim/balance';
import { playerColor } from '../render/playerColors';
import { fitCamera3d, projectPoint, type CameraPose } from '../render/projection';
import {
  createDeveloper,
  applyPose,
  disposeCharacter,
  type Character,
} from '../render/three/Characters';
import { kitMaterials } from '../render/three/kit';
import { createLights, dressScene } from '../render/three/look';
import { ticketModel } from '../render/three/models';
import { playerPose } from '../render/three/pose';
import { playerMarker } from '../render/three/playerMarker';
import { developerAppearance } from '../render/three/DeveloperRig';
import { Stage, disposeTree } from '../render/three/stage';
import { STUDY_ACTIONS, STUDY_LOOP_MS, studyFrame, type StudyAction } from './studyScenes';
import './studies.css';

document.body.classList.add('study-page');
document.title = 'Compact angular production cast';
const params = new URLSearchParams(location.search);
const selected = ROLE_IDS.find((role) => role === params.get('role'));
const action: StudyAction = STUDY_ACTIONS.find((a) => a === params.get('action')) ?? 'carry';
let time = Number(params.get('time') ?? 900);
if (!Number.isFinite(time)) throw new Error('Invalid pose time');
let paused = params.has('still');
let gray = params.has('gray');
let rear = params.has('rear');

const controls = document.createElement('section');
controls.className = 'study-controls';
controls.setAttribute('aria-label', 'Production cast review');
controls.innerHTML = `
  <h1>Compact angular crew</h1>
  <p>One crew, short and long hair in every role · <a href="/?scene=cast-mixed&quality=low">Mixed gameplay</a> · <a href="/?scene=cast-platform&quality=low">Platform gameplay</a> · <a href="/?scene=cast-duplicates&quality=low">Four generalists</a> · <a href="/models.html">Office kit</a></p>
  <form class="study-toolbar">
    <input type="hidden" name="cast">
    <label>Cast <select name="role"><option value="">All five roles</option>${ROLE_IDS.map((role) => `<option value="${role}">${ROLE_LABELS[role]} · four copies</option>`).join('')}</select></label>
    <label>Action <select name="action">${STUDY_ACTIONS.map((a) => `<option>${a}</option>`).join('')}</select></label>
    <label><input name="rear" type="checkbox"> Reverse</label>
    <label><input name="gray" type="checkbox"> Grayscale</label>
    <button id="cast-pause" type="button">Pause</button>
    <label>Pose time <input id="cast-time" type="range" min="0" max="${STUDY_LOOP_MS - 1}" step="1"><output id="cast-time-label"></output></label>
  </form>`;
document.body.append(controls);
const form = controls.querySelector('form');
const roleControl = controls.querySelector<HTMLSelectElement>('[name=role]');
const actionControl = controls.querySelector<HTMLSelectElement>('[name=action]');
const rearControl = controls.querySelector<HTMLInputElement>('[name=rear]');
const grayControl = controls.querySelector<HTMLInputElement>('[name=gray]');
const scrub = controls.querySelector<HTMLInputElement>('#cast-time');
const output = controls.querySelector<HTMLOutputElement>('#cast-time-label');
const pause = controls.querySelector<HTMLButtonElement>('#cast-pause');
if (
  !form ||
  !roleControl ||
  !actionControl ||
  !rearControl ||
  !grayControl ||
  !scrub ||
  !output ||
  !pause
) {
  throw new Error('Missing cast controls');
}
roleControl.value = selected ?? '';
actionControl.value = action;
rearControl.checked = rear;
grayControl.checked = gray;
const save = (): void => {
  const query = new URLSearchParams();
  new FormData(form).forEach((value, key) => {
    if (typeof value !== 'string') throw new Error('Unexpected file in cast controls');
    query.set(key, value);
  });
  query.set('time', String(Math.round(time % STUDY_LOOP_MS)));
  if (paused) query.set('still', '');
  history.replaceState(null, '', `?${query}`);
};
for (const el of [roleControl, actionControl])
  el.addEventListener('change', () => {
    save();
    location.reload();
  });
rearControl.addEventListener('change', () => {
  rear = rearControl.checked;
  save();
});
grayControl.addEventListener('change', () => {
  gray = grayControl.checked;
  save();
});
pause.addEventListener('click', () => {
  paused = !paused;
  save();
});
scrub.addEventListener('input', () => {
  time = Number(scrub.value);
  paused = true;
  save();
});
form.addEventListener('submit', (event) => {
  event.preventDefault();
});

const parent = document.createElement('div');
parent.id = 'study-stage';
document.body.prepend(parent);
const names = document.createElement('div');
names.className = 'study-names';
document.body.append(names);
const caption = document.createElement('p');
caption.className = 'study-caption';
const variantCaption = selected
  ? 'Four independent owners, with the same role.'
  : 'All roles: short hair back row, long hair front row. Each role supports every hairstyle.';
caption.textContent = `${variantCaption} Reverse for rear views. Outfits/badges identify role; color/shape/number identify owner. Enlarged review, not couch-distance proof. Model-sheet throw release is illustrative.`;
document.body.append(caption);
const stage = new Stage(parent);
stage.setGraphics('low');
const scene = new THREE.Scene();
dressScene(scene, stage.renderer);
scene.add(...createLights({ width: 10, height: 6 }));
const materials = kitMaterials();
const folder = ticketModel('feature');
const actors: { character: Character; ticket: THREE.Mesh; anchor: THREE.Group; yaw: number }[] = [];
const labels: { el: HTMLDivElement; x: number; z: number }[] = [];
const roles: readonly RoleId[] = selected ? [selected] : ROLE_IDS;
roles.forEach((role, i) => {
  const count = selected ? 4 : 2;
  for (let n = 0; n < count; n++) {
    // Same person/color across roles, then four independent owners for duplicate comparisons.
    const id = selected ? n + 1 : 1;
    const character = createDeveloper(id, materials, role, {
      ...developerAppearance(id),
      hairstyle: selected
        ? developerAppearance(id).hairstyle
        : i % 2 === 0
          ? n === 0
            ? 'swept'
            : 'long'
          : n === 0
            ? 'cropped'
            : 'tied',
    });
    const anchor = new THREE.Group();
    const x = selected ? (n % 2) * 1.6 : i * 1.65;
    const z = selected ? Math.floor(n / 2) * 2.2 : n * 2.2;
    anchor.position.set(x, 0, z);
    const ticket = new THREE.Mesh(folder.body, materials.body);
    ticket.castShadow = true;
    anchor.add(character.root, ticket);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(PLAYER_RADIUS * 0.95, PLAYER_RADIUS * 1.25, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: playerColor(id) }),
    );
    ring.position.set(x, 0.006, z);
    ring.add(new THREE.Mesh(playerMarker(id), new THREE.MeshBasicMaterial({ vertexColors: true })));
    scene.add(anchor, ring);
    actors.push({ character, ticket, anchor, yaw: 0 });
  }
  const el = document.createElement('div');
  el.className = 'study-name cast-name';
  el.textContent = ROLE_LABELS[role];
  names.append(el);
  labels.push({ el, x: selected ? 0.8 : i * 1.65, z: 3.1 });
});
const width = selected ? 3.6 : 8.6;
const floor = new THREE.Mesh(
  new THREE.BoxGeometry(width, 0.12, 5.2),
  new THREE.MeshStandardMaterial({ color: 0x58766c, roughness: 0.9 }),
);
floor.position.set(selected ? 0.8 : 3.3, -0.07, 0.9);
floor.receiveShadow = true;
scene.add(floor);
let camera: CameraPose;
function resize(): void {
  stage.resize(innerWidth, innerHeight);
  camera = fitCamera3d(
    { min: { x: -0.9, y: -0.2, z: -1.7 }, max: { x: selected ? 2.5 : 7.5, y: 1.6, z: 3.5 } },
    { width: innerWidth, height: innerHeight },
    { top: controls.offsetHeight + 20, right: 24, bottom: 86, left: 24 },
  );
  stage.setPose(camera);
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
  }
  parent.style.filter = gray ? 'grayscale(1)' : '';
  stage.render(scene, delta);
  for (const label of labels) {
    const p = projectPoint(camera, { x: label.x, y: 0, z: label.z });
    label.el.style.left = `${p.x}px`;
    label.el.style.top = `${p.y}px`;
  }
  pause.textContent = paused ? 'Animate' : 'Pause';
  scrub.value = String(Math.round(time % STUDY_LOOP_MS));
  output.value = `${Math.round(time % STUDY_LOOP_MS)} ms`;
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
  for (const material of [materials.body, materials.glow, materials.glass]) material.dispose();
  if (scene.background instanceof THREE.Texture) scene.background.dispose();
  stage.renderer.dispose();
});
