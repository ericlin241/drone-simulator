export const FlightMode = Object.freeze({ ANGLE: 'ANGLE', ACRO: 'ACRO', ALT_HOLD: 'ALT HOLD' });

/** Deterministic light-weight rigid-body approximation for browser training. */
export class PhysicsEngine extends EventTarget {
  constructor(THREE, drone, options = {}) {
    super();
    this.THREE = THREE;
    this.drone = drone;
    this.restY = options.restY ?? 0.16;
    this.velocity = new THREE.Vector3();
    this.wind = new THREE.Vector3();
    this.mode = FlightMode.ANGLE;
    this.yaw = 0;
    this.altitudeTarget = null;
    this.windSpeed = 2;
    this.windDirection = 35;
    this.elapsed = 0;
  }

  cycleMode() {
    const modes = Object.values(FlightMode);
    this.mode = modes[(modes.indexOf(this.mode) + 1) % modes.length];
    this.altitudeTarget = this.mode === FlightMode.ALT_HOLD ? this.drone.position.y : null;
    this.dispatchEvent(new CustomEvent('modechange', { detail: this.mode }));
    return this.mode;
  }

  setWind(speed, direction) {
    this.windSpeed = Math.max(0, Math.min(15, Number(speed) || 0));
    this.windDirection = Number(direction) || 0;
  }

  reset(position) {
    this.drone.position.copy(position);
    this.drone.rotation.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    this.yaw = 0;
    this.altitudeTarget = null;
  }

  /** Smooth multi-octave sine noise is used as a dependency-free turbulence field. */
  turbulence(t, seed) {
    return Math.sin(t * 1.7 + seed) * 0.55 + Math.sin(t * 4.13 + seed * 2.3) * 0.3 + Math.sin(t * 9.1 + seed) * 0.15;
  }

  update(dt, input, state) {
    this.elapsed += dt;
    const active = state.armed && !state.crashed;
    const yawInput = active ? input.yaw : 0;
    const pitchInput = active ? input.pitch : 0;
    const rollInput = active ? input.roll : 0;
    const throttle = active ? input.throttle : 0.5;
    const speedScale = state.maxSpeedScale;

    this.yaw -= yawInput * (this.mode === FlightMode.ACRO ? 2.8 : 1.55) * dt;
    if (this.mode === FlightMode.ACRO && active) {
      this.drone.rotation.x += -pitchInput * 2.15 * dt;
      this.drone.rotation.z += -rollInput * 2.15 * dt;
    } else if (!state.crashed) {
      const targetPitch = -pitchInput * 0.34;
      const targetRoll = -rollInput * 0.4;
      this.drone.rotation.x = this.THREE.MathUtils.lerp(this.drone.rotation.x, targetPitch, 1 - Math.exp(-6 * dt));
      this.drone.rotation.z = this.THREE.MathUtils.lerp(this.drone.rotation.z, targetRoll, 1 - Math.exp(-6 * dt));
    }
    if (!state.crashed) this.drone.rotation.y = this.yaw;

    const forward = new this.THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new this.THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    if (active) {
      this.velocity.addScaledVector(forward, pitchInput * 6.2 * dt);
      this.velocity.addScaledVector(right, rollInput * 6.2 * dt);
      let verticalCommand = (throttle - 0.5) * 2;
      if (this.mode === FlightMode.ALT_HOLD && Math.abs(verticalCommand) < 0.12) {
        this.altitudeTarget ??= this.drone.position.y;
        verticalCommand = this.THREE.MathUtils.clamp((this.altitudeTarget - this.drone.position.y) * 1.7 - this.velocity.y * 0.7, -0.45, 0.45);
      } else if (this.mode === FlightMode.ALT_HOLD) this.altitudeTarget = this.drone.position.y;

      // Ground effect adds up to 12% lift below 0.5 m and fades continuously.
      const height = this.drone.position.y - this.restY;
      const groundEffect = height < 0.5 ? (1 - Math.max(0, height) / 0.5) * 0.12 : 0;
      this.velocity.y += (verticalCommand * 7 + groundEffect * 2.2) * dt;

      const angle = this.THREE.MathUtils.degToRad(this.windDirection);
      const gust = 1 + this.turbulence(this.elapsed, 1.7) * 0.28;
      this.wind.set(Math.sin(angle), this.turbulence(this.elapsed, 4.1) * 0.16, Math.cos(angle)).multiplyScalar(this.windSpeed * gust);
      // Quadratic relative-air drag; area and density are folded into this training coefficient.
      const relativeAir = this.wind.clone().sub(this.velocity);
      const dragMagnitude = Math.min(5, relativeAir.lengthSq() * 0.018);
      if (relativeAir.lengthSq() > 0.0001) this.velocity.addScaledVector(relativeAir.normalize(), dragMagnitude * dt);
    }

    if (state.crashed) {
      this.velocity.y -= 7.2 * dt;
      this.velocity.x *= Math.exp(-0.65 * dt);
      this.velocity.z *= Math.exp(-0.65 * dt);
    } else {
      this.velocity.multiplyScalar(Math.exp(-2.15 * dt));
      const horizontal = Math.hypot(this.velocity.x, this.velocity.z);
      const maxHorizontal = 8 * speedScale;
      if (horizontal > maxHorizontal) {
        this.velocity.x *= maxHorizontal / horizontal;
        this.velocity.z *= maxHorizontal / horizontal;
      }
      this.velocity.y = this.THREE.MathUtils.clamp(this.velocity.y, -4 * speedScale, 4 * speedScale);
    }
    this.drone.position.addScaledVector(this.velocity, dt);
    this.drone.position.y = Math.min(15 + this.restY, this.drone.position.y);
    return { velocity: this.velocity, yaw: this.yaw, wind: this.wind };
  }
}
