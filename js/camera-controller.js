export const CameraMode = Object.freeze({ CHASE: '追隨', FPV: 'FPV', PILOT: '飛手', ORBIT: '環繞' });

/** Owns the camera exclusively, preventing orbit gestures and custom cams from competing. */
export class CameraController extends EventTarget {
  constructor(THREE, camera, canvas, drone) {
    super();
    this.THREE = THREE; this.camera = camera; this.canvas = canvas; this.drone = drone;
    this.modes = Object.values(CameraMode); this.mode = CameraMode.CHASE;
    this.target = new THREE.Vector3(); this.yaw = 0; this.pitch = 0.45; this.distance = 16; this.dragButton = -1;
    this.pilotPosition = new THREE.Vector3(0, 1.7, -8);
    this.attachOrbitEvents();
  }

  cycle() { this.setMode(this.modes[(this.modes.indexOf(this.mode) + 1) % this.modes.length]); }
  setMode(mode) {
    this.mode = this.modes.includes(mode) ? mode : CameraMode.CHASE;
    if (this.mode === CameraMode.ORBIT) this.captureOrbit();
    this.dispatchEvent(new CustomEvent('modechange', { detail: this.mode }));
  }
  captureOrbit() {
    this.target.copy(this.drone.position);
    const offset = this.camera.position.clone().sub(this.target);
    this.distance = this.THREE.MathUtils.clamp(offset.length(), 3, 55);
    this.pitch = this.THREE.MathUtils.clamp(Math.asin(offset.y / this.distance), 0.12, 1.42);
    this.yaw = Math.atan2(offset.x, offset.z);
  }
  attachOrbitEvents() {
    this.canvas.addEventListener('contextmenu', event => event.preventDefault());
    this.canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0 && event.button !== 2) return;
      if (this.mode !== CameraMode.ORBIT) this.setMode(CameraMode.ORBIT);
      this.dragButton = event.button; this.canvas.classList.add('dragging'); this.canvas.setPointerCapture(event.pointerId); event.preventDefault();
    });
    this.canvas.addEventListener('pointermove', event => {
      if (this.dragButton < 0 || this.mode !== CameraMode.ORBIT) return;
      if (this.dragButton === 2) {
        this.yaw -= event.movementX * 0.006;
        this.pitch = this.THREE.MathUtils.clamp(this.pitch + event.movementY * 0.0045, 0.12, 1.42);
      } else {
        const right = new this.THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).setY(0).normalize();
        const forward = new this.THREE.Vector3(); this.camera.getWorldDirection(forward); forward.setY(0).normalize();
        this.target.addScaledVector(right, -event.movementX * this.distance * 0.0018);
        this.target.addScaledVector(forward, event.movementY * this.distance * 0.0018);
      }
    });
    const end = event => { this.dragButton = -1; this.canvas.classList.remove('dragging'); if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId); };
    this.canvas.addEventListener('pointerup', end); this.canvas.addEventListener('pointercancel', end);
    this.canvas.addEventListener('wheel', event => {
      if (this.mode !== CameraMode.ORBIT) this.setMode(CameraMode.ORBIT);
      this.distance = this.THREE.MathUtils.clamp(this.distance * Math.exp(event.deltaY * 0.001), 3, 55); event.preventDefault();
    }, { passive: false });
  }

  update(dt, crashed = false) {
    const desired = new this.THREE.Vector3(); const focus = this.drone.position;
    if (this.mode === CameraMode.FPV) {
      desired.set(0, 0.25, -1.05).applyQuaternion(this.drone.quaternion).add(focus);
      this.camera.position.lerp(desired, 1 - Math.exp(-14 * dt));
      const view = new this.THREE.Vector3(0, Math.tan(this.THREE.MathUtils.degToRad(20)), -8).applyQuaternion(this.drone.quaternion).add(this.camera.position);
      this.camera.lookAt(view); return;
    }
    if (this.mode === CameraMode.PILOT) desired.copy(this.pilotPosition);
    else if (this.mode === CameraMode.ORBIT) {
      const horizontal = Math.cos(this.pitch) * this.distance;
      desired.set(Math.sin(this.yaw) * horizontal, Math.sin(this.pitch) * this.distance, Math.cos(this.yaw) * horizontal).add(this.target);
    } else {
      desired.set(0, 3.4, 7.4).applyAxisAngle(new this.THREE.Vector3(0, 1, 0), this.drone.rotation.y).add(focus);
      desired.x += this.drone.rotation.z * 0.45;
    }
    if (crashed) desired.add(new this.THREE.Vector3((Math.random() - 0.5) * 0.12, 0, (Math.random() - 0.5) * 0.12));
    this.camera.position.lerp(desired, 1 - Math.exp(-3.5 * dt));
    this.camera.lookAt(this.mode === CameraMode.ORBIT ? this.target : focus);
  }
}
