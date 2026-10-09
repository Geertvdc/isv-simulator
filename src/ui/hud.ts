export const VERSION = 'v0';

export function mountHud(root: HTMLElement): void {
  const version = document.createElement('div');
  version.className = 'hud-version';
  version.textContent = VERSION;
  root.append(version);
}
