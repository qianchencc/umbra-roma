import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type SceneId = 'forum' | 'pantheon' | 'aqueduct';
export type RomanMaterials = {
  stone: THREE.Material;
  dark: THREE.Material;
  ground: THREE.Material;
  accent: THREE.Material;
};

export const ROMAN_FRAMING = {
  forum: { center: [0, 4.8, -10], width: 44, height: 15.5 },
  pantheon: { center: [0, 6.0, -9], width: 34, height: 17 },
  aqueduct: { center: [0, 6.2, -11], width: 43, height: 17 },
} as const;

type MaterialName = keyof RomanMaterials;
type Rotation = [number, number, number];

/** Original procedural architecture, in metres. All static surfaces are merged. */
class RomanKit {
  private pieces: Record<MaterialName, THREE.BufferGeometry[]> = {
    stone: [], dark: [], ground: [], accent: [],
  };

  add(geometry: THREE.BufferGeometry, x = 0, y = 0, z = 0,
    material: MaterialName = 'stone', rotation: Rotation = [0, 0, 0]) {
    geometry.rotateX(rotation[0]);
    geometry.rotateY(rotation[1]);
    geometry.rotateZ(rotation[2]);
    geometry.translate(x, y, z);
    const plain = geometry.index ? geometry.toNonIndexed() : geometry;
    if (plain !== geometry) geometry.dispose();
    Object.keys(plain.attributes).forEach((name) => {
      if (name !== 'position' && name !== 'normal') plain.deleteAttribute(name);
    });
    if (!plain.getAttribute('normal')) plain.computeVertexNormals();
    this.pieces[material].push(plain);
  }

  box(x: number, y: number, z: number, w: number, h: number, d: number,
    material: MaterialName = 'stone', yaw = 0) {
    this.add(new THREE.BoxGeometry(w, h, d), x, y, z, material, [0, yaw, 0]);
  }

  cylinder(x: number, y: number, z: number, rTop: number, rBottom: number,
    height: number, material: MaterialName = 'stone', sides = 24) {
    this.add(new THREE.CylinderGeometry(rTop, rBottom, height, sides), x, y, z, material);
  }

  ring(x: number, y: number, z: number, radius: number, thickness: number,
    material: MaterialName = 'stone') {
    this.add(new THREE.TorusGeometry(radius, thickness, 6, 72), x, y, z,
      material, [Math.PI / 2, 0, 0]);
  }

  column(x: number, z: number, base: number, height: number, radius = 0.46) {
    const s = radius / 0.46;
    const cap = 0.68 * s;
    const foot = 0.55 * s;
    const shaftHeight = height - cap - foot;
    this.box(x, base + 0.12 * s, z, radius * 2.8, 0.24 * s, radius * 2.8);
    this.cylinder(x, base + 0.33 * s, z, radius * 1.19, radius * 1.35, 0.18 * s);
    this.cylinder(x, base + 0.48 * s, z, radius, radius * 1.2, 0.14 * s);

    // Entasis is a change in the actual silhouette, not a texture or overlay.
    const profile = [
      new THREE.Vector2(radius, 0),
      new THREE.Vector2(radius * 1.025, shaftHeight * 0.18),
      new THREE.Vector2(radius * 0.99, shaftHeight * 0.45),
      new THREE.Vector2(radius * 0.90, shaftHeight * 0.86),
      new THREE.Vector2(radius * 0.86, shaftHeight),
    ];
    this.add(new THREE.LatheGeometry(profile, 24), x, base + foot, z);
    const capBase = base + height - cap;
    this.cylinder(x, capBase + 0.08 * s, z, radius * 0.94, radius * 0.88, 0.16 * s);
    this.cylinder(x, capBase + 0.29 * s, z, radius * 1.32, radius * 0.94, 0.26 * s);
    this.box(x, base + height - 0.12 * s, z, radius * 2.85, 0.24 * s, radius * 2.85);
  }

  steps(x: number, z: number, width: number, depth: number, count: number,
    rise = 0.22, tread = 0.38, base = 0) {
    for (let i = 0; i < count; i++) {
      this.box(x, base + rise * (i + 0.5), z - i * tread * 0.32,
        width - i * tread * 1.5, rise, depth - i * tread * 1.5);
    }
  }

  pediment(x: number, z: number, base: number, width: number, height: number,
    depth: number) {
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, 0);
    shape.lineTo(width / 2, 0);
    shape.lineTo(0, height);
    shape.closePath();
    this.add(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }),
      x, base, z - depth / 2);
    // The cornice follows the pitch on both sides, including the rear face.
    const slope = Math.atan2(height, width / 2);
    const length = Math.hypot(width / 2, height);
    for (const faceZ of [z - depth / 2 - 0.12, z + depth / 2 + 0.12]) {
      this.add(new THREE.BoxGeometry(length + 0.18, 0.22, 0.25),
        x - width / 4, base + height / 2 + 0.13, faceZ, 'stone', [0, 0, slope]);
      this.add(new THREE.BoxGeometry(length + 0.18, 0.22, 0.25),
        x + width / 4, base + height / 2 + 0.13, faceZ, 'stone', [0, 0, -slope]);
    }
    this.box(x, base - 0.02, z, width + 0.46, 0.24, depth + 0.45);
  }

  /** One real open arch bay; the empty arch is never represented by a dark plane. */
  arch(x: number, z: number, base: number, bay: number, height: number,
    radius: number, depth: number, yaw = 0, decorated = true) {
    const spring = height - radius - 0.68;
    const pier = (bay - radius * 2) / 2;
    const local = (lx: number, ly: number, lz: number) => ({
      x: x + lx * Math.cos(yaw) + lz * Math.sin(yaw),
      y: base + ly,
      z: z - lx * Math.sin(yaw) + lz * Math.cos(yaw),
    });
    for (const sign of [-1, 1]) {
      const p = local(sign * (radius + pier / 2), spring / 2, 0);
      this.box(p.x, p.y, p.z, pier, spring, depth, 'stone', yaw);
      const foot = local(sign * (radius + pier / 2), 0.16, 0);
      this.box(foot.x, foot.y, foot.z, pier + 0.13, 0.32, depth + 0.16, 'stone', yaw);
      const impost = local(sign * (radius + pier / 2), spring, 0);
      this.box(impost.x, impost.y, impost.z, pier + 0.18, 0.23, depth + 0.22, 'stone', yaw);
    }
    const spandrel = new THREE.Shape();
    spandrel.moveTo(-bay / 2, height);
    spandrel.lineTo(bay / 2, height);
    spandrel.lineTo(bay / 2, spring);
    spandrel.lineTo(radius, spring);
    spandrel.absarc(0, spring, radius, 0, Math.PI, false);
    spandrel.lineTo(-bay / 2, spring);
    spandrel.closePath();
    const geometry = new THREE.ExtrudeGeometry(spandrel,
      { depth, bevelEnabled: false, curveSegments: 20 });
    geometry.translate(0, 0, -depth / 2);
    this.add(geometry, x, base, z, 'stone', [0, yaw, 0]);
    if (decorated) {
      for (const side of [-1, 1]) {
        const ring = new THREE.Shape();
        ring.absarc(0, spring, radius + 0.22, 0, Math.PI, false);
        ring.lineTo(-radius, spring);
        ring.absarc(0, spring, radius, Math.PI, 0, true);
        ring.closePath();
        const rim = new THREE.ExtrudeGeometry(ring,
          { depth: 0.15, bevelEnabled: false, curveSegments: 20 });
        rim.translate(0, 0, side > 0 ? depth / 2 : -depth / 2 - 0.15);
        this.add(rim, x, base, z, 'stone', [0, yaw, 0]);
        const key = local(0, spring + radius + 0.10, side * (depth / 2 + 0.16));
        this.box(key.x, key.y, key.z, 0.33, 0.5, 0.2, 'stone', yaw);
      }
    }
  }

  urn(x: number, z: number, base = 0, size = 1) {
    this.box(x, base + 0.16 * size, z, 0.75 * size, 0.32 * size, 0.75 * size);
    const profile = [
      [0.19, 0], [0.25, 0.12], [0.25, 0.23], [0.40, 0.49],
      [0.45, 0.76], [0.39, 0.98], [0.22, 1.16], [0.32, 1.22],
    ].map(([r, y]) => new THREE.Vector2(r * size, y * size));
    this.add(new THREE.LatheGeometry(profile, 20), x, base + 0.32 * size, z);
    this.cylinder(x, base + 1.53 * size, z, 0.33 * size, 0.33 * size, 0.1 * size);
    this.cylinder(x, base + 1.59 * size, z, 0.24 * size, 0.24 * size, 0.015 * size, 'dark');
  }

  cypress(x: number, z: number, height: number, radius = 0.65) {
    this.cylinder(x, 0.8, z, 0.12, 0.17, 1.6, 'dark', 10);
    const profile = [
      [0, 0], [0.56, 0.08], [0.93, 0.28], [1, 0.42],
      [0.89, 0.63], [0.60, 0.83], [0.13, 0.97], [0, 1],
    ].map(([r, y]) => new THREE.Vector2(r * radius, y * height));
    this.add(new THREE.LatheGeometry(profile, 12), x, 0.55, z, 'dark');
    this.cylinder(x, 0.14, z, 1.0, 1.08, 0.28, 'stone', 20);
  }

  ground() {
    this.add(new THREE.PlaneGeometry(600, 600), 0, 0, -8, 'ground', [-Math.PI / 2, 0, 0]);
    // Broad, sparse joints keep the moving image calm and avoid subpixel moiré.
    for (let z = -25; z <= 12; z += 6) {
      this.box(0, 0.014, z, 40, 0.025, 0.055, 'dark');
    }
    for (let x = -18; x <= 18; x += 6) {
      this.box(x, 0.015, -6, 0.055, 0.026, 39, 'dark');
    }
  }

  finish(materials: RomanMaterials) {
    const group = new THREE.Group();
    group.name = 'Original Roman architecture';
    (Object.keys(this.pieces) as MaterialName[]).forEach((key) => {
      if (!this.pieces[key].length) return;
      const geometry = mergeGeometries(this.pieces[key], false);
      this.pieces[key].forEach((piece) => piece.dispose());
      if (!geometry) throw new Error(`Unable to merge Roman ${key} geometry`);
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, materials[key]);
      mesh.name = `Roman ${key}`;
      mesh.castShadow = key !== 'ground';
      mesh.receiveShadow = true;
      group.add(mesh);
    });
    return group;
  }
}

function buildForum(kit: RomanKit) {
  kit.ground();
  // Two porticoes make the long axis visible from a wide lens and hide it in elevation.
  for (const side of [-1, 1]) {
    kit.steps(side * 11.4, -7, 5.1, 27, 3, 0.19, 0.25);
    for (let i = 0; i < 7; i++) {
      const z = 3.5 - i * 3.6;
      kit.column(side * 9.95, z, 0.57, 6.9, 0.49);
      kit.column(side * 12.85, z, 0.57, 6.9, 0.49);
    }
    kit.box(side * 11.4, 7.60, -7.3, 4.5, 0.35, 25.4);
    kit.box(side * 11.4, 7.96, -7.3, 4.65, 0.38, 25.6);
    kit.box(side * 11.4, 8.27, -7.3, 4.85, 0.18, 25.8);
    kit.box(side * 11.4, 8.45, -7.3, 4.6, 0.18, 25.5);
    // Raised roof rails give the revealed tops a deliberate architectural finish.
    kit.box(side * 9.5, 8.63, -7.3, 0.23, 0.24, 25.4);
    kit.box(side * 13.3, 8.63, -7.3, 0.23, 0.24, 25.4);
  }

  // A triumphal arch is the visual destination, with real openings in all three bays.
  kit.steps(0, -19, 17.3, 6.3, 4, 0.22, 0.29);
  kit.arch(0, -19, 0.88, 7, 10, 2.45, 3.6);
  kit.arch(-5.6, -19, 0.88, 4.2, 7.35, 1.32, 3.6);
  kit.arch(5.6, -19, 0.88, 4.2, 7.35, 1.32, 3.6);
  kit.box(-5.6, 9.555, -19, 4.2, 2.65, 3.6);
  kit.box(5.6, 9.555, -19, 4.2, 2.65, 3.6);
  for (const x of [-7.1, -3.7, 3.7, 7.1]) {
    kit.column(x, -16.75, 0.88, 9.4, 0.49);
  }
  kit.box(0, 10.97, -19, 16, 0.42, 4.1);
  kit.box(0, 12.11, -19, 15.65, 1.88, 3.8);
  kit.box(0, 13.15, -19, 16.15, 0.25, 4.25);
  kit.box(0, 13.40, -19, 16.5, 0.25, 4.55);
  // Recessed attic panel and restrained sculptural relief, rather than tiny text.
  kit.box(0, 12.10, -16.99, 6.1, 0.83, 0.20);
  for (let i = -4; i <= 4; i++) {
    kit.box(i * 0.49, 12.11, -16.86, 0.14, 0.31, 0.12, 'dark');
  }
  for (const side of [-1, 1]) {
    kit.urn(side * 7.5, -11, 0, 1.05);
    kit.cypress(side * 16.4, -13, 6.4, 0.85);
    kit.cypress(side * 16.7, -22, 7.4, 0.9);
  }
  // A simple round altar makes scale and the central vanishing point legible.
  kit.cylinder(0, 0.18, -7, 1.8, 1.95, 0.36);
  kit.cylinder(0, 0.6, -7, 1.35, 1.55, 0.48);
  kit.cylinder(0, 1.05, -7, 1.5, 1.5, 0.18);
  kit.box(0, 1.18, -7, 0.8, 0.14, 0.8, 'accent');
}

function annularWall(inner: number, outer: number, openingAngle: number, height: number) {
  const shape = new THREE.Shape();
  const count = 80;
  for (let i = 0; i <= count; i++) {
    const a = openingAngle + (Math.PI * 2 - openingAngle * 2) * i / count;
    const x = Math.sin(a) * outer;
    const y = -Math.cos(a) * outer;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  for (let i = count; i >= 0; i--) {
    const a = openingAngle + (Math.PI * 2 - openingAngle * 2) * i / count;
    shape.lineTo(Math.sin(a) * inner, -Math.cos(a) * inner);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function buildPantheon(kit: RomanKit) {
  kit.ground();
  const cz = -11.3;
  kit.cylinder(0, 0.20, cz, 8.15, 8.3, 0.4);
  kit.cylinder(0, 0.55, cz, 7.95, 8.15, 0.3);
  kit.add(annularWall(6.62, 7.55, 0.28, 8.65), 0, 0.7, cz);
  // Continuous upper drum bridges the actual open entrance below it.
  kit.cylinder(0, 8.69, cz, 7.65, 7.65, 1.1);
  kit.cylinder(0, 9.37, cz, 7.9, 7.9, 0.25);
  kit.cylinder(0, 9.64, cz, 7.75, 7.75, 0.29);
  kit.ring(0, 3.45, cz, 7.61, 0.09);
  kit.ring(0, 7.52, cz, 7.62, 0.12);
  for (let i = 1; i < 16; i++) {
    const a = i * Math.PI * 2 / 16;
    const x = Math.sin(a) * 7.6;
    const z = cz + Math.cos(a) * 7.6;
    kit.box(x, 4.9, z, 0.48, 7.9, 0.22, 'stone', a);
    kit.box(x, 8.8, z, 0.68, 0.25, 0.40, 'stone', a);
  }
  const dome = new THREE.SphereGeometry(7.47, 64, 24, 0, Math.PI * 2, 0.11, Math.PI / 2 - 0.11);
  dome.scale(1, 0.75, 1);
  kit.add(dome, 0, 9.77, cz);
  for (const theta of [0.29, 0.52, 0.78, 1.04, 1.29]) {
    kit.ring(0, 9.77 + 5.6025 * Math.cos(theta), cz,
      7.47 * Math.sin(theta) + 0.035, 0.075);
  }
  kit.ring(0, 15.35, cz, 0.83, 0.14);
  // Meridional ribs create readable geometry from a moving camera.
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI * 2 / 16;
    const points: THREE.Vector3[] = [];
    for (let j = 0; j <= 16; j++) {
      const t = 0.13 + (Math.PI / 2 - 0.13) * j / 16;
      points.push(new THREE.Vector3(Math.sin(a) * (7.5 * Math.sin(t)),
        9.8 + 5.625 * Math.cos(t), cz + Math.cos(a) * (7.5 * Math.sin(t))));
    }
    kit.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, 0.065, 5, false));
  }

  // Six columns, two rows, a deep portico and a completely modelled gable.
  kit.steps(0, 0.0, 15.0, 9.7, 5, 0.24, 0.35);
  for (const z of [2.65, -1.25]) {
    for (const x of [-5.4, -3.24, -1.08, 1.08, 3.24, 5.4]) {
      kit.column(x, z, 1.2, 7.5, 0.49);
    }
  }
  kit.box(0, 8.86, 0.15, 13.2, 0.32, 6.45);
  kit.box(0, 9.17, 0.15, 13.45, 0.32, 6.55);
  kit.box(0, 9.46, 0.15, 13.9, 0.25, 6.85);
  kit.pediment(0, 0.15, 9.65, 13.6, 2.35, 6.55);
  // Dentils are substantial enough to retain their rhythm at normal view sizes.
  for (let i = 0; i < 27; i++) {
    kit.box(-6.45 + i * 0.496, 9.35, 3.59, 0.23, 0.2, 0.20);
  }
  for (const side of [-1, 1]) {
    kit.cypress(side * 11.8, -8.4, 8.4, 1.03);
    kit.cypress(side * 14.1, -14.5, 6.7, 0.8);
    kit.urn(side * 8.0, 2.7, 0, 1.2);
  }
  kit.steps(0, 7.5, 22, 2, 2, 0.15, 0.3);
}

function buildAqueduct(kit: RomanKit) {
  kit.ground();
  const bay = 4.8;
  const z = -11;
  kit.box(0, 0.26, z, 35.2, 0.52, 4.5);
  for (let i = 0; i < 7; i++) {
    const x = (i - 3) * bay;
    kit.arch(x, z, 0.52, bay, 6.55, 1.72, 2.8);
    kit.arch(x, z, 7.45, bay, 5.65, 1.72, 2.5);
  }
  kit.box(0, 7.15, z, 34.2, 0.35, 3.15);
  kit.box(0, 7.40, z, 34.5, 0.18, 3.45);
  kit.box(0, 13.26, z, 34.1, 0.32, 3.0);
  kit.box(0, 13.55, z, 34.6, 0.25, 3.45);
  kit.box(0, 14.01, z, 34.1, 0.67, 3.0);
  kit.box(0, 14.42, z, 34.7, 0.2, 3.5);
  // A recessed water channel is visible in the high view.
  kit.box(0, 14.58, z - 1.32, 34.3, 0.3, 0.38);
  kit.box(0, 14.58, z + 1.32, 34.3, 0.3, 0.38);
  kit.box(0, 14.53, z, 33.8, 0.02, 2.2, 'accent');
  for (let i = 0; i <= 7; i++) {
    const x = (i - 3.5) * bay;
    kit.box(x, 3.9, z + 1.52, 0.45, 6.2, 0.23);
    kit.box(x, 10.32, z + 1.38, 0.38, 5.2, 0.23);
  }
  // Fallen fragments at the foot give scale without competing with the arches.
  kit.column(-13.2, 1.2, 0, 3.0, 0.7);
  kit.box(-13.2, 3.14, 1.2, 2.2, 0.28, 2.2);
  kit.add(new THREE.CylinderGeometry(0.52, 0.56, 3.3, 20),
    -9.5, 0.59, 3.1, 'stone', [0, 0.4, Math.PI / 2]);
  kit.cypress(15.5, 0.6, 6.6, 0.86);
  kit.cypress(17.8, -3.6, 8.1, 0.96);
  kit.cypress(-18.6, -19.2, 7.5, 0.95);
  kit.urn(10.0, 3.2, 0, 0.9);
  // Low stepped basin catches the shadows of the repetitive arches.
  kit.steps(1.8, 0.5, 9.2, 5.1, 2, 0.18, 0.27);
  kit.box(1.8, 0.45, 0.5, 7.9, 0.18, 4.0);
  kit.box(1.8, 0.56, 0.5, 7.3, 0.04, 3.4, 'accent');
}

export function buildRomanScene(kind: SceneId, materials: RomanMaterials): THREE.Group {
  const kit = new RomanKit();
  if (kind === 'pantheon') buildPantheon(kit);
  else if (kind === 'aqueduct') buildAqueduct(kit);
  else buildForum(kit);
  const result = kit.finish(materials);
  result.userData.sceneId = kind;
  return result;
}

/** Materials belong to the caller and are deliberately retained. */
export function disposeRomanScene(group: THREE.Group) {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) child.geometry.dispose();
  });
  group.removeFromParent();
  group.clear();
}
