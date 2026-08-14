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
    this.finishedAt = 0;
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
    this.accumulator = 0; this.startedAt = 0; this.finishedAt = 0; this.lastPenaltyAt = 0;
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
      const finalWaypoint = this.nextWaypoint === this.waypoints.length - 1;
      const detectionRadius = finalWaypoint ? 2 : 1.6;
      const altitudeTolerance = finalWaypoint ? 1.6 : 1.4;
      if (waypoint && waypoint.distanceTo(new this.THREE.Vector2(position.x, position.z)) < detectionRadius && altitudeError < altitudeTolerance) {
        this.nextWaypoint += 1;
        if (this.nextWaypoint === this.waypoints.length) this.finish();
      }
    }
    this.samples.push({
      time: this.elapsedSeconds(),
      x: position.x, y: position.y, z: position.z, altitude,
      routeError, altitudeError, score: this.score, waypoint: Math.min(this.nextWaypoint + 1, 7), armed: Boolean(armed)
    });
    if (this.samples.length > this.maxPoints) this.samples.shift();
    this.dispatchEvent(new CustomEvent('update', { detail: this.snapshot(routeError, altitudeError) }));
  }

  finish() {
    if (!this.active) return;
    this.finishedAt = performance.now();
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
      passedWaypoints: this.nextWaypoint,
      routeError, altitudeError,
      time: this.elapsedSeconds(),
      completed: this.nextWaypoint >= this.waypoints.length,
      sampleCount: this.samples.length
    };
  }

  elapsedSeconds() {
    if (!this.startedAt) return 0;
    return ((this.finishedAt || performance.now()) - this.startedAt) / 1000;
  }

  /** Export all retained 50 ms samples for spreadsheet or post-flight analysis. */
  toCSV() {
    const columns = ['time', 'x', 'y', 'z', 'altitude', 'routeError', 'altitudeError', 'score', 'waypoint', 'armed'];
    const rows = this.samples.map(sample => columns.map(key => typeof sample[key] === 'number' ? sample[key].toFixed(4) : sample[key]).join(','));
    return [columns.join(','), ...rows].join('\n');
  }

  /**
   * Build a self-contained top-down JPG report without external chart libraries.
   * The course and recorded path share the same metric coordinate transform.
   */
  toJpegDataURL(width = 1600, height = 1000) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    const chart = { x: 80, y: 150, width: 1040, height: 760 };
    const worldMin = -8;
    const worldSize = 16;
    const mapX = x => chart.x + (x - worldMin) / worldSize * chart.width;
    const mapZ = z => chart.y + (z - worldMin) / worldSize * chart.height;

    context.fillStyle = '#07111f';
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#eef7ff';
    context.font = '700 40px system-ui, sans-serif';
    context.fillText('Web Flight Lab · 水平 8 字飛行軌跡', 80, 70);
    context.fillStyle = '#77dfff';
    context.font = '20px ui-monospace, monospace';
    context.fillText(`EXPORT ${new Date().toLocaleString('zh-TW')}`, 82, 108);

    // Chart background and one-metre grid.
    context.fillStyle = '#0c1c2c';
    context.fillRect(chart.x, chart.y, chart.width, chart.height);
    context.strokeStyle = 'rgba(174, 211, 232, .12)';
    context.lineWidth = 1;
    for (let metre = -8; metre <= 8; metre += 1) {
      context.beginPath(); context.moveTo(mapX(metre), chart.y); context.lineTo(mapX(metre), chart.y + chart.height); context.stroke();
      context.beginPath(); context.moveTo(chart.x, mapZ(metre)); context.lineTo(chart.x + chart.width, mapZ(metre)); context.stroke();
    }
    context.strokeStyle = 'rgba(238, 247, 255, .65)';
    context.lineWidth = 3;
    context.strokeRect(mapX(-7.5), mapZ(-7.5), mapX(7.5) - mapX(-7.5), mapZ(7.5) - mapZ(-7.5));

    // Standard figure-eight reference route.
    context.strokeStyle = '#24bde9';
    context.lineWidth = 5;
    context.setLineDash([14, 10]);
    for (const cx of [-3.2, 3.2]) {
      context.beginPath();
      context.ellipse(mapX(cx), mapZ(-2.3), 3.2 / worldSize * chart.width, 3.2 / worldSize * chart.height, 0, 0, Math.PI * 2);
      context.stroke();
    }
    context.setLineDash([]);

    // P1-P7 detection points.
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '700 18px system-ui, sans-serif';
    this.waypoints.forEach((point, index) => {
      context.beginPath(); context.fillStyle = '#f04d60'; context.arc(mapX(point.x), mapZ(point.y), 14, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#ffffff'; context.fillText(`P${index + 1}`, mapX(point.x), mapZ(point.y));
    });

    // Each segment uses its ending sample's altitude-error band.
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = 7;
    for (let index = 1; index < this.samples.length; index += 1) {
      const previous = this.samples[index - 1];
      const sample = this.samples[index];
      context.strokeStyle = sample.altitudeError < 0.5 ? '#42e69a' : sample.altitudeError > 0.8 ? '#ff5068' : '#ffd45a';
      context.beginPath(); context.moveTo(mapX(previous.x), mapZ(previous.z)); context.lineTo(mapX(sample.x), mapZ(sample.z)); context.stroke();
    }
    if (this.samples.length) {
      const endpoints = [this.samples[0], this.samples.at(-1)];
      ['#ffffff', '#ff9b54'].forEach((color, index) => {
        context.beginPath(); context.fillStyle = color; context.arc(mapX(endpoints[index].x), mapZ(endpoints[index].z), 11, 0, Math.PI * 2); context.fill();
      });
    }

    // Summary panel and legend.
    const result = this.snapshot();
    const altitudes = this.samples.map(sample => sample.altitude);
    const routeErrors = this.samples.map(sample => sample.routeError);
    const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const maximum = values => values.length ? Math.max(...values) : 0;
    const summary = [
      ['評分', `${result.score.toFixed(1)} / 100`],
      ['結果', result.completed ? (result.passed ? 'PASS 合格' : 'FAIL 未通過') : '練習未完成'],
      ['時間', `${result.time.toFixed(1)} s`],
      ['軌跡點', `${this.samples.length}`],
      ['平均高度', `${average(altitudes).toFixed(2)} m`],
      ['最高高度', `${maximum(altitudes).toFixed(2)} m`],
      ['平均路徑誤差', `${average(routeErrors).toFixed(2)} m`],
      ['最大路徑誤差', `${maximum(routeErrors).toFixed(2)} m`]
    ];
    context.textAlign = 'left'; context.textBaseline = 'alphabetic';
    context.fillStyle = '#10283c'; context.fillRect(1160, 150, 360, 760);
    context.font = '700 26px system-ui, sans-serif'; context.fillStyle = '#77dfff'; context.fillText('FLIGHT SUMMARY', 1200, 205);
    summary.forEach(([label, value], index) => {
      const y = 260 + index * 62;
      context.font = '17px system-ui, sans-serif'; context.fillStyle = '#8faabd'; context.fillText(label, 1200, y);
      context.font = '700 22px ui-monospace, monospace'; context.fillStyle = '#eef7ff'; context.fillText(value, 1200, y + 28);
    });
    [['#42e69a', '高度誤差 < 0.5 m'], ['#ffd45a', '高度誤差 0.5–0.8 m'], ['#ff5068', '高度誤差 > 0.8 m']].forEach(([color, label], index) => {
      const y = 800 + index * 32;
      context.fillStyle = color; context.fillRect(1200, y - 14, 24, 8);
      context.font = '15px system-ui, sans-serif'; context.fillStyle = '#b9ccda'; context.fillText(label, 1238, y - 4);
    });
    context.fillStyle = 'rgba(220, 237, 248, .62)'; context.font = '16px system-ui, sans-serif';
    context.fillText('© 2026 ericlin241. All rights reserved.', 80, 960);
    return canvas.toDataURL('image/jpeg', 0.92);
  }
}
