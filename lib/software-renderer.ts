import * as THREE from 'three';
import type { StudioSettings } from '../components/RomanViewer';
import { buildRomanScene, disposeRomanScene, ROMAN_FRAMING } from './roman-geometry';

export type SoftwareRuntime = {
  update: (settings: StudioSettings) => void;
  exportPNG: () => Promise<void>;
  reset: () => void;
  dispose: () => void;
};

type GeometryData = {
  positions: Float32Array;
  normals: Float32Array;
  dark: Uint8Array;
  casts: Uint8Array;
  count: number;
};
type ClipVertex = [number, number, number, number, number, number];

const PALETTES = {
  limestone: ['#e8e0cd', '#31382f'],
  terracotta: ['#f0d5ba', '#8d432d'],
  cyanotype: ['#e3e9df', '#244c65'],
} as const;
const SHADOW_SIZE = 2048;
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));
const rgba = (hex: string) => {
  const rgb = parseInt(hex.slice(1), 16);
  return (0xff000000 | ((rgb & 255) << 16) | (rgb & 0xff00) | (rgb >>> 16)) >>> 0;
};

function readGeometry(kind: StudioSettings['scene']): GeometryData {
  const materials = {
    stone: new THREE.MeshBasicMaterial(), dark: new THREE.MeshBasicMaterial(),
    ground: new THREE.MeshBasicMaterial(), accent: new THREE.MeshBasicMaterial(),
  };
  const group = buildRomanScene(kind, materials);
  let count = 0;
  group.traverse(child => {
    if (child instanceof THREE.Mesh) count += child.geometry.getAttribute('position').count / 3;
  });
  const positions = new Float32Array(count * 9);
  const normals = new Float32Array(count * 3);
  const dark = new Uint8Array(count);
  const casts = new Uint8Array(count);
  let triangle = 0;
  group.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    const p = child.geometry.getAttribute('position');
    const n = child.geometry.getAttribute('normal');
    for (let v = 0; v < p.count; v += 3, triangle++) {
      let nx = 0, ny = 0, nz = 0, maxY = -Infinity;
      for (let j = 0; j < 3; j++) {
        const offset = triangle * 9 + j * 3;
        positions[offset] = p.getX(v + j);
        positions[offset + 1] = p.getY(v + j);
        positions[offset + 2] = p.getZ(v + j);
        maxY = Math.max(maxY, positions[offset + 1]);
        nx += n.getX(v + j); ny += n.getY(v + j); nz += n.getZ(v + j);
      }
      const length = Math.hypot(nx, ny, nz) || 1;
      normals[triangle * 3] = nx / length;
      normals[triangle * 3 + 1] = ny / length;
      normals[triangle * 3 + 2] = nz / length;
      dark[triangle] = child.material === materials.dark ? 1 : 0;
      casts[triangle] = child.castShadow && maxY > 0.08 ? 1 : 0;
    }
  });
  disposeRomanScene(group);
  Object.values(materials).forEach(material => material.dispose());
  return { positions, normals, dark, casts, count };
}

/** A true z-buffer renderer for devices without WebGL; the same meshes drive both paths. */
export function createSoftwareRuntime(
  container: HTMLDivElement,
  initial: StudioSettings,
  callbacks: { ready: () => void; error: (text: string) => void; view: (yaw: number) => void },
): SoftwareRuntime {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas 2D is unavailable');
  const ctx = context;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '古罗马建筑光影作品。左右拖动或使用左右方向键旋转视角。');
  canvas.tabIndex = 0;
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y;cursor:grab;outline-offset:-4px';
  container.appendChild(canvas);

  let settings = { ...initial };
  let geometry = readGeometry(settings.scene);
  let lightCoordinates = new Float32Array(geometry.count * 9);
  let illumination = new Uint8Array(geometry.count);
  let shadowBias = new Float32Array(geometry.count);
  const shadow = new Float32Array(SHADOW_SIZE * SHADOW_SIZE);
  let projected = new Float64Array(geometry.count * 21);
  let image: ImageData;
  let pixels = new Uint32Array(0);
  let depths = new Float32Array(0);
  let owners = new Uint32Array(0);
  let width = 1, height = 1, cssWidth = 1;
  let paper = 0, ink = 0;
  let yaw = .34, desiredYaw = .34;
  let timer = 0, frame = 0, lastDraw = 0;
  let tourStart = 0, tourBase = .34;
  let visible = true, disposed = false, exporting = false, shadowDirty = true;
  let pointer: { id: number; x: number; yaw: number } | null = null;
  const revokedURLs = new Map<string, number>();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function rasterShadow(triangle: number) {
    const p = lightCoordinates, offset = triangle * 9;
    let a = offset, b = offset + 3, c = offset + 6;
    let area = (p[b] - p[a]) * (p[c + 1] - p[a + 1]) - (p[b + 1] - p[a + 1]) * (p[c] - p[a]);
    if (Math.abs(area) < .005) return;
    if (area < 0) { const swap = b; b = c; c = swap; area = -area; }
    const minX = Math.max(0, Math.floor(Math.min(p[a], p[b], p[c])));
    const maxX = Math.min(SHADOW_SIZE - 1, Math.ceil(Math.max(p[a], p[b], p[c])));
    const minY = Math.max(0, Math.floor(Math.min(p[a + 1], p[b + 1], p[c + 1])));
    const maxY = Math.min(SHADOW_SIZE - 1, Math.ceil(Math.max(p[a + 1], p[b + 1], p[c + 1])));
    if (minX > maxX || minY > maxY) return;
    const ax = p[b + 1] - p[c + 1], ay = p[c] - p[b];
    const bx = p[c + 1] - p[a + 1], by = p[a] - p[c];
    const cx = p[a + 1] - p[b + 1], cy = p[b] - p[a];
    const x = minX + .5, y = minY + .5;
    let ra = ax * (x - p[c]) + ay * (y - p[c + 1]);
    let rb = bx * (x - p[a]) + by * (y - p[a + 1]);
    let rc = cx * (x - p[b]) + cy * (y - p[b + 1]);
    const za = p[a + 2] / area, zb = p[b + 2] / area, zc = p[c + 2] / area;
    const dz = ax * za + bx * zb + cx * zc;
    for (let py = minY; py <= maxY; py++) {
      let ea = ra, eb = rb, ec = rc;
      let z = ea * za + eb * zb + ec * zc;
      let index = py * SHADOW_SIZE + minX;
      for (let px = minX; px <= maxX; px++, index++, ea += ax, eb += bx, ec += cx, z += dz) {
        if (ea >= 0 && eb >= 0 && ec >= 0 && z < shadow[index]) shadow[index] = z;
      }
      ra += ay; rb += by; rc += cy;
    }
  }

  function prepareShadow() {
    const azimuth = settings.azimuth * Math.PI / 180;
    const altitude = settings.altitude * Math.PI / 180;
    const lx = Math.cos(azimuth) * Math.cos(altitude);
    const ly = Math.sin(altitude);
    const lz = Math.sin(azimuth) * Math.cos(altitude);
    const lightCamera = new THREE.OrthographicCamera(-44, 44, 42, -42, 1, 160);
    lightCamera.position.set(lx * 68, ly * 68, lz * 68 - 8);
    lightCamera.lookAt(0, 0, -8);
    lightCamera.updateMatrixWorld();
    const matrix = new THREE.Matrix4().multiplyMatrices(lightCamera.projectionMatrix, lightCamera.matrixWorldInverse).elements;
    const p = geometry.positions;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      lightCoordinates[i] = ((matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) * .5 + .5) * (SHADOW_SIZE - 1);
      lightCoordinates[i + 1] = (.5 - (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) * .5) * (SHADOW_SIZE - 1);
      lightCoordinates[i + 2] = (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]) * .5 + .5;
    }
    for (let t = 0; t < geometry.count; t++) {
      const i = t * 3;
      const dot = geometry.normals[i] * lx + geometry.normals[i + 1] * ly + geometry.normals[i + 2] * lz;
      illumination[t] = !geometry.dark[t] && dot > .095 ? 1 : 0;
      // A receiver-plane bias compensates for the actual depth change across a
      // shadow texel, preventing the striped self-shadowing of pitched roofs.
      const j = t * 9, p = lightCoordinates;
      const ux = p[j + 3] - p[j], uy = p[j + 4] - p[j + 1];
      const vx = p[j + 6] - p[j], vy = p[j + 7] - p[j + 1];
      const determinant = ux * vy - uy * vx;
      let slope = 0;
      if (Math.abs(determinant) > .00001) {
        const ud = p[j + 5] - p[j + 2], vd = p[j + 8] - p[j + 2];
        slope = (Math.abs((ud * vy - vd * uy) / determinant) +
          Math.abs((ux * vd - vx * ud) / determinant)) * .85;
      }
      shadowBias[t] = Math.min(.004, Math.max(.00022, slope + .00008));
    }
    shadow.fill(Infinity);
    for (let t = 0; t < geometry.count; t++) if (geometry.casts[t]) rasterShadow(t);
    shadowDirty = false;
  }

  function rasterCamera(t: number, p: Float64Array, a: number, b: number, c: number) {
    let area = (p[b] - p[a]) * (p[c + 1] - p[a + 1]) - (p[b + 1] - p[a + 1]) * (p[c] - p[a]);
    if (Math.abs(area) < .015) return;
    if (area < 0) { const swap = b; b = c; c = swap; area = -area; }
    const minX = Math.max(0, Math.floor(Math.min(p[a], p[b], p[c])));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(p[a], p[b], p[c])));
    const minY = Math.max(0, Math.floor(Math.min(p[a + 1], p[b + 1], p[c + 1])));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(p[a + 1], p[b + 1], p[c + 1])));
    if (minX > maxX || minY > maxY) return;
    const ax = p[b + 1] - p[c + 1], ay = p[c] - p[b];
    const bx = p[c + 1] - p[a + 1], by = p[a] - p[c];
    const cx = p[a + 1] - p[b + 1], cy = p[b] - p[a];
    let ra = ax * (minX + .5 - p[c]) + ay * (minY + .5 - p[c + 1]);
    let rb = bx * (minX + .5 - p[a]) + by * (minY + .5 - p[a + 1]);
    let rc = cx * (minX + .5 - p[b]) + cy * (minY + .5 - p[b + 1]);
    const inverseArea = 1 / area;
    const qa = p[a + 2] * inverseArea, qb = p[b + 2] * inverseArea, qc = p[c + 2] * inverseArea;
    const ua = p[a + 3] * inverseArea, ub = p[b + 3] * inverseArea, uc = p[c + 3] * inverseArea;
    const va = p[a + 4] * inverseArea, vb = p[b + 4] * inverseArea, vc = p[c + 4] * inverseArea;
    const da = p[a + 5] * inverseArea, db = p[b + 5] * inverseArea, dc = p[c + 5] * inverseArea;
    const dxq = ax * qa + bx * qb + cx * qc;
    const dxu = ax * ua + bx * ub + cx * uc;
    const dxv = ax * va + bx * vb + cx * vc;
    const dxd = ax * da + bx * db + cx * dc;
    const lit = illumination[t], bias = shadowBias[t];
    for (let y = minY; y <= maxY; y++) {
      let ea = ra, eb = rb, ec = rc;
      let q = ea * qa + eb * qb + ec * qc;
      let u = ea * ua + eb * ub + ec * uc;
      let v = ea * va + eb * vb + ec * vc;
      let d = ea * da + eb * db + ec * dc;
      let index = y * width + minX;
      for (let x = minX; x <= maxX; x++, index++, ea += ax, eb += bx, ec += cx, q += dxq, u += dxu, v += dxv, d += dxd) {
        if (ea < 0 || eb < 0 || ec < 0 || q <= depths[index]) continue;
        depths[index] = q;
        owners[index] = t + 1;
        let color = ink;
        if (lit) {
          const reciprocal = 1 / q;
          // Raster samples live at texel centres, rather than texel corners.
          const sx = u * reciprocal - .5, sy = v * reciprocal - .5;
          if (sx < 0 || sy < 0 || sx >= SHADOW_SIZE - 1 || sy >= SHADOW_SIZE - 1) color = paper;
          else {
            const ix = sx | 0, iy = sy | 0;
            const mapIndex = iy * SHADOW_SIZE + ix;
            const depth = d * reciprocal - bias;
            const fx = sx - ix, fy = sy - iy;
            const s00 = depth <= shadow[mapIndex] ? 1 : 0;
            const s10 = depth <= shadow[mapIndex + 1] ? 1 : 0;
            const s01 = depth <= shadow[mapIndex + SHADOW_SIZE] ? 1 : 0;
            const s11 = depth <= shadow[mapIndex + SHADOW_SIZE + 1] ? 1 : 0;
            if ((s00 * (1 - fx) + s10 * fx) * (1 - fy) + (s01 * (1 - fx) + s11 * fx) * fy >= .5) color = paper;
          }
        }
        pixels[index] = color;
      }
      ra += ay; rb += by; rc += cy;
    }
  }

  function addInkEdges() {
    const n = geometry.normals;
    const normalBreak = (a: number, b: number) => {
      if (a === b) return false;
      if (!b) return true;
      const ai = (a - 1) * 3, bi = (b - 1) * 3;
      return n[ai] * n[bi] + n[ai + 1] * n[bi + 1] + n[ai + 2] * n[bi + 2] < .60;
    };
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1, i = y * width + 1; x < width - 1; x++, i++) {
        if (!owners[i] || pixels[i] === ink) continue;
        const id = owners[i], q = depths[i];
        if (Math.abs(depths[i - 1] + depths[i + 1] - 2 * q) > q * .006 ||
            Math.abs(depths[i - width] + depths[i + width] - 2 * q) > q * .006 ||
            normalBreak(id, owners[i + 1]) || normalBreak(id, owners[i + width])) pixels[i] = ink;
      }
    }
  }

  function draw() {
    if (disposed || width < 2 || height < 2) return;
    const drawStarted = performance.now();
    if (shadowDirty) prepareShadow();
    const colors = PALETTES[settings.palette];
    paper = rgba(colors[0]); ink = rgba(colors[1]);
    pixels.fill(paper); depths.fill(0); owners.fill(0);
    const aspect = width / height;
    const frameHeight = settings.scene === 'pantheon' ? 26 : 25;
    const framedWidth = Math.max(ROMAN_FRAMING[settings.scene].width, frameHeight * aspect);
    const fov = (6 + settings.perspective * 38) * Math.PI / 180;
    const distance = framedWidth * .5 / Math.tan(fov * .5);
    const focal = width * .5 / Math.tan(fov * .5);
    const near = Math.max(.5, distance - Math.max(140, framedWidth * 5));
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    const cy = height / 2 - 7.2 * width / framedWidth;
    const world = geometry.positions;
    for (let i = 0, j = 0; i < world.length; i += 3, j += 7) {
      const x = world[i], y = world[i + 1], z = world[i + 2] + 10;
      const depth = distance - x * sin - z * cos;
      const q = 1 / depth;
      projected[j] = width / 2 + (x * cos - z * sin) * q * focal;
      projected[j + 1] = cy - (y - 13) * q * focal;
      projected[j + 2] = q;
      projected[j + 3] = lightCoordinates[i] * q;
      projected[j + 4] = lightCoordinates[i + 1] * q;
      projected[j + 5] = lightCoordinates[i + 2] * q;
      projected[j + 6] = depth;
    }
    for (let t = 0; t < geometry.count; t++) {
      const offset = t * 21;
      if (projected[offset + 6] >= near && projected[offset + 13] >= near && projected[offset + 20] >= near) {
        rasterCamera(t, projected, offset, offset + 7, offset + 14);
        continue;
      }
      if (projected[offset + 6] < near && projected[offset + 13] < near && projected[offset + 20] < near) continue;
      const source: ClipVertex[] = [];
      for (let v = 0; v < 3; v++) {
        const i = t * 9 + v * 3;
        const x = world[i], y = world[i + 1], z = world[i + 2] + 10;
        source.push([x * cos - z * sin, y - 13, distance - x * sin - z * cos,
          lightCoordinates[i], lightCoordinates[i + 1], lightCoordinates[i + 2]]);
      }
      const clipped: ClipVertex[] = [];
      for (let v = 0; v < source.length; v++) {
        const a = source[v], b = source[(v + 1) % source.length];
        const aIn = a[2] >= near, bIn = b[2] >= near;
        if (aIn) clipped.push(a);
        if (aIn !== bIn) {
          const fraction = (near - a[2]) / (b[2] - a[2]);
          clipped.push(a.map((value, i) => value + (b[i] - value) * fraction) as ClipVertex);
        }
      }
      const data = new Float64Array(clipped.length * 7);
      clipped.forEach((v, i) => {
        const j = i * 7, q = 1 / v[2];
        data[j] = width / 2 + v[0] * q * focal;
        data[j + 1] = cy - v[1] * q * focal;
        data[j + 2] = q; data[j + 3] = v[3] * q;
        data[j + 4] = v[4] * q; data[j + 5] = v[5] * q;
      });
      for (let v = 1; v < clipped.length - 1; v++) rasterCamera(t, data, 0, v * 7, (v + 1) * 7);
    }
    addInkEdges();
    ctx.putImageData(image, 0, 0);
    lastDraw = drawStarted;
  }

  function setSize(w: number, h: number) {
    width = Math.max(2, Math.round(w)); height = Math.max(2, Math.round(h));
    if (canvas.width === width && canvas.height === height && pixels.length === width * height) return;
    canvas.width = width; canvas.height = height;
    image = ctx.createImageData(width, height);
    pixels = new Uint32Array(image.data.buffer);
    depths = new Float32Array(width * height);
    owners = new Uint32Array(width * height);
  }

  function tick(time: number) {
    frame = 0;
    if (disposed || exporting) return;
    if (visible && settings.autoRotate && !pointer && !reducedMotion.matches) {
      if (!tourStart) { tourStart = time; tourBase = desiredYaw; }
      yaw = tourBase + Math.sin((time - tourStart) / 44000 * Math.PI * 2) * .30;
    } else yaw = desiredYaw;
    try { draw(); } catch (error) {
      console.error('UMBRA software rendering failed', error);
      callbacks.error('画面暂时中断，请刷新页面重试。');
      return;
    }
    if (visible && settings.autoRotate && !reducedMotion.matches) requestDraw();
  }

  function requestDraw() {
    if (disposed || exporting || timer || frame) return;
    const delay = Math.max(0, 95 - (performance.now() - lastDraw));
    timer = window.setTimeout(() => { timer = 0; frame = requestAnimationFrame(tick); }, delay);
  }

  function resize() {
    if (disposed || exporting) return;
    const box = container.getBoundingClientRect();
    cssWidth = Math.max(1, box.width);
    const scale = Math.min(1.5, 1920 / Math.max(box.width, box.height, 1));
    setSize(Math.max(2, box.width * scale), Math.max(2, box.height * scale));
    draw();
    if (settings.autoRotate && visible) requestDraw();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  const intersectionObserver = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) requestDraw();
  });
  intersectionObserver.observe(container);
  const onDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    desiredYaw = yaw;
    pointer = { id: event.pointerId, x: event.clientX, yaw };
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = 'grabbing'; tourStart = 0;
  };
  const onMove = (event: PointerEvent) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    desiredYaw = clamp(pointer.yaw - (event.clientX - pointer.x) / Math.max(cssWidth, 300) * 1.6, -.8, .8);
    callbacks.view(desiredYaw); requestDraw();
  };
  const onUp = () => { pointer = null; canvas.style.cursor = 'grab'; tourStart = 0; };
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    desiredYaw = clamp(yaw + (event.key === 'ArrowLeft' ? -.075 : .075), -.8, .8);
    tourStart = 0; callbacks.view(desiredYaw); requestDraw();
  };
  const onVisibility = () => { visible = !document.hidden; tourStart = 0; if (visible) requestDraw(); };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisibility);

  resize(); draw();
  container.dataset.ready = 'true';
  container.dataset.renderer = 'software';
  callbacks.ready();

  return {
    update(next) {
      const newScene = next.scene !== settings.scene;
      shadowDirty = shadowDirty || newScene || next.azimuth !== settings.azimuth || next.altitude !== settings.altitude;
      if (next.autoRotate !== settings.autoRotate) { desiredYaw = yaw; tourStart = 0; }
      settings = { ...next };
      if (newScene) {
        geometry = readGeometry(settings.scene);
        lightCoordinates = new Float32Array(geometry.count * 9);
        illumination = new Uint8Array(geometry.count);
        shadowBias = new Float32Array(geometry.count);
        projected = new Float64Array(geometry.count * 21);
        desiredYaw = settings.scene === 'aqueduct' ? .22 : .34;
        tourStart = 0;
      }
      requestDraw();
    },
    async exportPNG() {
      if (exporting || disposed) return;
      exporting = true;
      if (frame) cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
      frame = 0; timer = 0;
      const scale = 3840 / Math.max(width, height);
      const exportW = Math.round(width * scale), exportH = Math.round(height * scale);
      try {
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        if (disposed) return;
        setSize(exportW, exportH); draw();
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
          value => value ? resolve(value) : reject(new Error('暂时无法保存画面，请重试。')), 'image/png'));
        if (disposed) return;
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `UMBRA-${settings.scene}-${settings.palette}-${exportW}x${exportH}.png`;
        document.body.appendChild(anchor); anchor.click(); anchor.remove();
        revokedURLs.set(url, window.setTimeout(() => { URL.revokeObjectURL(url); revokedURLs.delete(url); }, 30000));
      } finally {
        exporting = false;
        if (!disposed) { resize(); draw(); requestDraw(); }
      }
    },
    reset() { desiredYaw = .34; tourStart = 0; callbacks.view(desiredYaw); requestDraw(); },
    dispose() {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
      resizeObserver.disconnect(); intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('keydown', onKey);
      revokedURLs.forEach((timeout, url) => { clearTimeout(timeout); URL.revokeObjectURL(url); });
      revokedURLs.clear(); canvas.remove();
    },
  };
}
