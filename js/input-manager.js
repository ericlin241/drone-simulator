/**
 * Unifies phone, keyboard and Web Gamepad API values. Public output always uses
 * throttle 0..1 and yaw/pitch/roll -1..1, independent of the active device.
 */
export class InputManager extends EventTarget {
  constructor(rateConfig, onCommand) {
    super();
    this.config = rateConfig;
    this.onCommand = onCommand;
    this.remote = { throttle: 0.5, yaw: 0, pitch: 0, roll: 0 };
    this.output = { ...this.remote };
    this.keys = new Set();
    this.gamepadIndex = null;
    this.lastRemoteAt = 0;
    this.lastSource = '待命';
    this.buttonLatch = new Map();
    this.attachEvents();
  }

  attachEvents() {
    addEventListener('keydown', event => {
      const code = event.code;
      if (['Space', 'KeyR', 'KeyM', 'KeyC'].includes(code) && !event.repeat) {
        event.preventDefault();
        if (code === 'Space') this.onCommand('arm');
        if (code === 'KeyR') this.onCommand('reset');
        if (code === 'KeyM') this.dispatchEvent(new Event('cycle-flight-mode'));
        if (code === 'KeyC') this.dispatchEvent(new Event('cycle-camera'));
      }
      if (this.isFlightKey(code)) { event.preventDefault(); this.keys.add(code); }
    });
    addEventListener('keyup', event => this.keys.delete(event.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('gamepadconnected', event => {
      this.gamepadIndex = event.gamepad.index;
      this.dispatchEvent(new CustomEvent('device', { detail: `手把：${event.gamepad.id}` }));
    });
    addEventListener('gamepaddisconnected', event => {
      if (event.gamepad.index === this.gamepadIndex) this.gamepadIndex = null;
      this.dispatchEvent(new CustomEvent('device', { detail: '手把已中斷' }));
    });
  }

  isFlightKey(code) {
    return ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code);
  }

  setRemote(values) {
    this.remote = this.sanitize(values);
    this.lastRemoteAt = performance.now();
  }

  sanitize(values = {}) {
    const signed = key => Math.min(1, Math.max(-1, Number(values[key]) || 0));
    return {
      throttle: Math.min(1, Math.max(0, Number(values.throttle) || 0)),
      yaw: signed('yaw'), pitch: signed('pitch'), roll: signed('roll')
    };
  }

  readKeyboard() {
    const axis = (positive, negative) => Number(this.keys.has(positive)) - Number(this.keys.has(negative));
    return {
      throttle: this.keys.has('KeyW') ? 1 : this.keys.has('KeyS') ? 0 : 0.5,
      yaw: axis('KeyD', 'KeyA'),
      pitch: axis('ArrowUp', 'ArrowDown'),
      roll: axis('ArrowRight', 'ArrowLeft')
    };
  }

  readGamepad() {
    const gamepad = this.gamepadIndex == null ? null : navigator.getGamepads?.()[this.gamepadIndex];
    if (!gamepad) return null;
    const pressed = index => Boolean(gamepad.buttons[index]?.pressed);
    [[0, 'arm'], [1, 'reset']].forEach(([index, command]) => {
      const wasPressed = this.buttonLatch.get(index) || false;
      if (pressed(index) && !wasPressed) this.onCommand(command);
      this.buttonLatch.set(index, pressed(index));
    });
    const mode1 = this.config.values.stickMode === 'mode1';
    const leftY = -(gamepad.axes[1] || 0);
    const rightY = -(gamepad.axes[3] || 0);
    return {
      throttle: ((mode1 ? rightY : leftY) + 1) / 2,
      yaw: gamepad.axes[0] || 0,
      pitch: mode1 ? leftY : rightY,
      roll: gamepad.axes[2] || 0
    };
  }

  /** Poll once per animation frame; active keyboard has priority, then gamepad, then phone. */
  update() {
    let raw;
    const gamepad = this.readGamepad();
    if ([...this.keys].some(code => this.isFlightKey(code))) {
      raw = this.readKeyboard(); this.lastSource = '鍵盤';
    } else {
      raw = gamepad;
      if (gamepad) this.lastSource = 'Gamepad';
      else { raw = this.remote; this.lastSource = performance.now() - this.lastRemoteAt < 1000 ? '手機' : '待命'; }
    }
    this.output.throttle = Math.min(1, Math.max(0, 0.5 + (raw.throttle - 0.5) * this.config.values.throttleCap));
    this.output.yaw = this.config.shapeAxis(raw.yaw);
    this.output.pitch = this.config.shapeAxis(raw.pitch);
    this.output.roll = this.config.shapeAxis(raw.roll);
    return this.output;
  }
}
