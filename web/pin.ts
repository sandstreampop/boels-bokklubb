// The PIN screen: "Boels bokklubb" in display type and four digit boxes with the numeric keyboard.
// A wrong PIN shakes and empties the boxes; after the fifth the link is locked for a while and
// "Vänta en stund" replaces the boxes until the lock has passed. Shown only when there is no pass.

import { login } from './api';
import { captureError, crumb } from './telemetry';

const WAIT_TEXT = 'Vänta en stund';
const SHAKE_MS = 450;

export function renderTitleOnly(): HTMLElement {
  const main = document.createElement('main');
  main.className = 'screen title-only';
  main.innerHTML = `<h1 class="title">Boels bokklubb</h1>`;
  return main;
}

export function renderPin(token: string, onPass: () => void): HTMLElement {
  const main = document.createElement('main');
  main.className = 'screen pin';
  main.innerHTML = `
    <h1 class="title">Boels bokklubb</h1>
    <div class="rainbow-bar"></div>
    <form class="pin-form" autocomplete="off">
      <label class="pin-boxes" aria-label="Kod">
        <span class="pin-box"></span><span class="pin-box"></span><span class="pin-box"></span><span class="pin-box"></span>
        <input class="pin-input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="one-time-code" enterkeyhint="done" />
      </label>
      <p class="pin-wait" hidden>${WAIT_TEXT}</p>
    </form>`;
  const form = main.querySelector<HTMLFormElement>('.pin-form')!;
  const boxes = main.querySelector<HTMLElement>('.pin-boxes')!;
  const digits = [...main.querySelectorAll<HTMLElement>('.pin-box')];
  const input = main.querySelector<HTMLInputElement>('.pin-input')!;
  const wait = main.querySelector<HTMLElement>('.pin-wait')!;
  let busy = false;
  let waitTimer: ReturnType<typeof setTimeout> | null = null;

  const paint = () => {
    const value = input.value;
    digits.forEach((d, i) => {
      d.textContent = value[i] ?? '';
      d.classList.toggle('filled', i < value.length);
    });
  };

  const clear = () => {
    input.value = '';
    paint();
  };

  const lock = (until: string | null) => {
    const ms = Math.max(5_000, (until ? new Date(until).getTime() : Date.now() + 15 * 60_000) - Date.now() + 1_000);
    boxes.hidden = true;
    wait.hidden = false;
    clear();
    if (waitTimer) clearTimeout(waitTimer);
    // The page retries when the lock has passed: the boxes come back.
    waitTimer = setTimeout(() => {
      wait.hidden = true;
      boxes.hidden = false;
      input.focus();
    }, ms);
  };

  const wrong = () => {
    boxes.classList.add('shake');
    setTimeout(() => {
      boxes.classList.remove('shake');
      clear();
      input.focus();
    }, SHAKE_MS);
  };

  const submit = async () => {
    if (busy || input.value.length !== 4) return;
    busy = true;
    input.disabled = true;
    try {
      const result = await login(token, input.value);
      if (result.ok) {
        crumb('pin.ok');
        onPass();
        return;
      }
      crumb('pin.wrong', { locked: !!result.lockedUntil });
      if (result.lockedUntil) lock(result.lockedUntil);
      else wrong();
    } catch (err) {
      captureError('pin', err);
      wrong();
    } finally {
      busy = false;
      input.disabled = false;
    }
  };

  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 4);
    paint();
    if (input.value.length === 4) void submit();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void submit();
  });
  // The keyboard opens on the first tap (browsers only allow focus from a gesture).
  boxes.addEventListener('click', () => input.focus());
  queueMicrotask(() => input.focus());
  return main;
}
