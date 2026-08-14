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
    this.samples = [];
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
    this.active = false; this.score = 100; this.nextWaypoint = 0; this.points = []; this.colors = []; this.samples = [];
    this.accumulator = 0; this.startedAt = 0; this.lastPenaltyAt = 0;
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
    // Only retain actual powered-flight samples so parked time cannot overwrite the flight log.
    if (!armed) return;
    const altitude = position.y - 0.16;
    const altitudeError = Math.abs(altitude - this.targetAltitude);
    const routeError = this.nearestRouteDistance(position);
    const color = altitudeError < 0.5 ? new this.THREE.Color(0x42e69a) : altitudeError > 0.8 ? new this.THREE.Color(0xff5068) : new this.THREE.Color(0xffd45a);
    this.points.push(position.x, position.y, position.z);
    this.colors.push(color.r, color.g, color.b);
    if (this.points.length / 3 > this.maxPoints) { this.points.splice(0, 3); this.colors.splice(0, 3); }
    this.geometry.setAttribute('position', new this.THREE.Float32BufferAttribute(this.points, 3));
    this.geometry.setAttribute('color', new this.THREE.Float32BufferAttribute(this.colors, 3));
    this.geometry.computeBoundingSphere();

    if (this.active) {
      const now = performance.now();
      // Training-friendly tolerances: 1.5 m route and ±0.5 m altitude before deductions.
      if (now - this.lastPenaltyAt > 250) {
        if (routeError > 1.5) this.score -= Math.min(0.5, (routeError - 1.5) * 0.1);
        if (altitudeError > 0.5) this.score -= Math.min(0.4, (altitudeError - 0.5) * 0.15);
        this.score = Math.max(0, this.score);
        this.lastPenaltyAt = now;
      }
      const waypoint = this.waypoints[this.nextWaypoint];
      if (waypoint && waypoint.distanceTo(new this.THREE.Vector2(position.x, position.z)) < 1.4 && altitudeError < 1.2) {
        this.nextWaypoint += 1;
        if (this.nextWaypoint === this.waypoints.length) this.finish();
      }
    }
    this.samples.push({
      time: this.startedAt ? (performance.now() - this.startedAt) / 1000 : 0,
      x: position.x, y: position.y, z: position.z, altitude,
      routeError, altitudeError, score: this.score, waypoint: Math.min(this.nextWaypoint + 1, 7), armed: Boolean(armed)
    });
    if (this.samples.length > this.maxPoints) this.samples.shift();
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
      passed: this.score >= 60,
      waypoint: Math.min(this.nextWaypoint + 1, 7),
      routeError, altitudeError,
      time: this.startedAt ? (performance.now() - this.startedAt) / 1000 : 0,
      completed: this.nextWaypoint >= this.waypoints.length,
      sampleCount: this.samples.length
    };
  }

  /** Export all retained 50 ms samples for spreadsheet or post-flight analysis. */
  toCSV() {
    const columns = ['time', 'x', 'y', 'z', 'altitude', 'routeError', 'altitudeError', 'score', 'waypoint', 'armed'];
    const rows = this.samples.map(sample => columns.map(key => typeof sample[key] === 'number' ? sample[key].toFixed(4) : sample[key]).join(','));
    return [columns.join(','), ...rows].join('\n');
  }

  toJSON() {
    return JSON.stringify({ exportedAt: new Date().toISOString(), targetAltitude: this.targetAltitude, result: this.snapshot(), samples: this.samples }, null, 2);
  }
}
