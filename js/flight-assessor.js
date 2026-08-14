/** Records a color-coded ghost trail and scores the P1-P7 figure-eight route. */
export class FlightAssessor extends EventTarget {
  constructor(THREE, scene, options = {}) {
    super();
    this.THREE = THREE;
    this.targetAltitude = options.targetAltitude ?? 3;
    this.maxPoints = options.maxPoints ?? 1000;
    this.sampleInterval = options.sampleInterval ?? 0.05;
    this.points = [];
    this.colors = [];
    this.accumulator = 0;
    this.score = 100;
    this.active = false;
    this.startedAt = 0;
    this.nextWaypoint = 0;
    this.lastPenaltyAt = 0;
    this.waypoints = [
      [-3.2, -5.5], [-6.4, -2.3], [-3.2, 0.9], [0, -2.3],
      [3.2, -5.5], [6.4, -2.3], [3.2, 0.9]
    ].map(([x, z]) => new THREE.Vector2(x, z));
    this.geometry = new THREE.BufferGeometry();
    this.line = new THREE.Line(this.geometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
    this.line.frustumCulled = false;
    scene.add(this.line);
  }

  start() {
    this.reset(); this.active = true; this.startedAt = performance.now();
    this.dispatchEvent(new CustomEvent('update', { detail: this.snapshot() }));
  }

  reset() {
    this.active = false; this.score = 100; this.nextWaypoint = 0; this.points = []; this.colors = [];
    this.geometry.setAttribute('position', new this.THREE.Float32BufferAttribute([], 3));
    this.geometry.setAttribute('color', new this.THREE.Float32BufferAttribute([], 3));
  }

  nearestRouteDistance(position) {
    let closest = Infinity;
    for (const cx of [-3.2, 3.2]) {
      const radial = Math.abs(Math.hypot(position.x - cx, position.z + 2.3) - 3.2);
      closest = Math.min(closest, radial);
    }
    return closest;
  }

  update(dt, position, armed) {
    this.accumulator += dt;
    if (this.accumulator < this.sampleInterval) return;
    this.accumulator = 0;
    const altitude = position.y - 0.16;
    const altitudeError = Math.abs(altitude - this.targetAltitude);
    const routeError = this.nearestRouteDistance(position);
    const color = altitudeError < 0.3 ? new this.THREE.Color(0x42e69a) : altitudeError > 0.5 ? new this.THREE.Color(0xff5068) : new this.THREE.Color(0xffd45a);
    this.points.push(position.x, position.y, position.z);
    this.colors.push(color.r, color.g, color.b);
    if (this.points.length / 3 > this.maxPoints) { this.points.splice(0, 3); this.colors.splice(0, 3); }
    this.geometry.setAttribute('position', new this.THREE.Float32BufferAttribute(this.points, 3));
    this.geometry.setAttribute('color', new this.THREE.Float32BufferAttribute(this.colors, 3));
    this.geometry.computeBoundingSphere();

    if (!this.active || !armed) return;
    const now = performance.now();
    if (now - this.lastPenaltyAt > 250) {
      if (routeError > 1) this.score -= Math.min(0.8, (routeError - 1) * 0.18);
      if (altitudeError > 0.3) this.score -= Math.min(0.6, (altitudeError - 0.3) * 0.3);
      this.score = Math.max(0, this.score);
      this.lastPenaltyAt = now;
    }
    const waypoint = this.waypoints[this.nextWaypoint];
    if (waypoint && waypoint.distanceTo(new this.THREE.Vector2(position.x, position.z)) < 1.05 && altitudeError < 1) {
      this.nextWaypoint += 1;
      if (this.nextWaypoint === this.waypoints.length) this.finish();
    }
    this.dispatchEvent(new CustomEvent('update', { detail: this.snapshot(routeError, altitudeError) }));
  }

  finish() {
    this.active = false;
    const result = this.snapshot();
    result.finished = true;
    this.dispatchEvent(new CustomEvent('finish', { detail: result }));
  }

  snapshot(routeError = 0, altitudeError = 0) {
    return {
      score: Math.round(this.score * 10) / 10,
      passed: this.score >= 70,
      waypoint: Math.min(this.nextWaypoint + 1, 7),
      routeError, altitudeError,
      time: this.startedAt ? (performance.now() - this.startedAt) / 1000 : 0,
      completed: this.nextWaypoint >= this.waypoints.length
    };
  }
}
