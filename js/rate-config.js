/**
 * Shared radio tuning model. Values are serializable so the phone controller
 * can send the exact same setup to the simulator over PeerJS.
 */
export class RateConfig extends EventTarget {
  static STORAGE_KEY = 'flight-lab-rate-config-v2';

  static PRESETS = Object.freeze({
    beginner: { maxSpeedScale: 0.35, throttleCap: 0.65, rcRate: 0.65, expo: 0.45, deadband: 0.08 },
    standard: { maxSpeedScale: 0.7, throttleCap: 0.85, rcRate: 1, expo: 0.3, deadband: 0.06 },
    racing: { maxSpeedScale: 1, throttleCap: 1, rcRate: 1.45, expo: 0.18, deadband: 0.05 }
  });

  constructor(initial = {}) {
    super();
    this.values = {
      ...RateConfig.PRESETS.standard,
      stickMode: 'mode2',
      ...RateConfig.load(),
      ...initial
    };
    this.set(this.values, false);
  }

  static load() {
    try { return JSON.parse(localStorage.getItem(RateConfig.STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }

  set(patch, notify = true) {
    const number = (key, min, max) => {
      if (patch[key] == null) return;
      this.values[key] = Math.min(max, Math.max(min, Number(patch[key]) || min));
    };
    number('maxSpeedScale', 0.1, 1);
    number('throttleCap', 0.1, 1);
    number('rcRate', 0.1, 2);
    number('expo', 0, 1);
    number('deadband', 0, 0.2);
    if (patch.stickMode) this.values.stickMode = patch.stickMode === 'mode1' ? 'mode1' : 'mode2';
    localStorage.setItem(RateConfig.STORAGE_KEY, JSON.stringify(this.values));
    if (notify) this.dispatchEvent(new CustomEvent('change', { detail: this.toJSON() }));
    return this;
  }

  applyPreset(name) {
    if (RateConfig.PRESETS[name]) this.set(RateConfig.PRESETS[name]);
  }

  /** Deadband is rescaled, then the requested cubic Expo formula is applied. */
  shapeAxis(input) {
    const value = Math.min(1, Math.max(-1, Number(input) || 0));
    const magnitude = Math.abs(value);
    if (magnitude <= this.values.deadband) return 0;
    const normalized = Math.sign(value) * (magnitude - this.values.deadband) / (1 - this.values.deadband);
    const expoOutput = (1 - this.values.expo) * normalized + this.values.expo * normalized ** 3;
    return Math.min(1, Math.max(-1, expoOutput * this.values.rcRate));
  }

  toJSON() { return { ...this.values }; }
}

/** Connect a RateConfig to range inputs that use matching data-config keys. */
export function bindRatePanel(root, config, onChange = () => {}) {
  if (!root) return;
  const render = () => {
    root.querySelectorAll('[data-config]').forEach(input => {
      const key = input.dataset.config;
      input.value = String(config.values[key]);
      const output = root.querySelector(`[data-output="${key}"]`);
      if (output) output.textContent = formatValue(key, config.values[key]);
    });
    root.querySelectorAll('[data-stick-mode]').forEach(button => {
      const active = button.dataset.stickMode === config.values.stickMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  };
  root.querySelectorAll('[data-config]').forEach(input => input.addEventListener('input', () => {
    config.set({ [input.dataset.config]: Number(input.value) });
    onChange(config.toJSON());
  }));
  root.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
    config.applyPreset(button.dataset.preset);
    render();
    onChange(config.toJSON());
  }));
  root.querySelectorAll('[data-stick-mode]').forEach(button => button.addEventListener('click', () => {
    config.set({ stickMode: button.dataset.stickMode });
    render();
    onChange(config.toJSON());
  }));
  config.addEventListener('change', render);
  render();
}

function formatValue(key, value) {
  if (key === 'maxSpeedScale' || key === 'throttleCap') return `${Math.round(value * 100)}%`;
  if (key === 'deadband' || key === 'expo') return Number(value).toFixed(2);
  return `${Number(value).toFixed(2)}×`;
}
