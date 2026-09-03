import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildForest, pointOnLimb } from './forest-layout';
import type { Board, Forest, ForestTree, Limb, LimbKind } from './forest-layout';

/**
 * The living forest: every board is a tree that grows limb by limb, sways in
 * the wind and carries foliage coloured by node kind. Gaps are bare limbs with
 * pale buds. Finished boards stand around the clearing; the board being played
 * grows in the middle.
 *
 * Ported from the cursor/gap-first-workspace-3cdc branch. Everything here is
 * plain three.js behind a small handle, so React only mounts and feeds it.
 */

export interface HoverInfo {
  nodeId: string;
  treeId: string;
  label: string;
  kind: LimbKind;
  /** Pointer position relative to the container, for placing a tooltip. */
  x: number;
  y: number;
}

export interface EnteredTree {
  id: string;
  question: string;
  isActive: boolean;
  nodeCount: number;
  gapCount: number;
}

export interface ForestHandlers {
  onHover: (info: HoverInfo | null) => void;
  /** A limb was clicked. Selection only means something on the active board. */
  onSelect: (nodeId: string, treeId: string) => void;
  /** The viewer stepped into a tree (or back out with null). */
  onEnterTree: (tree: EnteredTree | null) => void;
}

export interface ForestScene {
  setData: (boards: Board[]) => void;
  setSelected: (nodeId: string | null) => void;
  focusTree: (treeId: string | null) => void;
  dispose: () => void;
}

const BACKGROUND = '#0d1b1e';
const GROUND = '#1d2f27';
const CLEARING = '#24392d';
const BARK = '#6b4f3a';
const BARK_BARE = '#8a8377';
const FOLIAGE: Record<LimbKind, string> = {
  root: '#3f8f5c',
  concept: '#4ea86b',
  resource: '#d9a441',
  skill: '#7fb069',
  gap: '#b6b09c',
};
const SELECTION = '#fff1bd';
const FADED = new THREE.Color('#12262a');

/** Tube resolution per limb: enough to curve, cheap enough for a full grove. */
const TUBULAR = 10;
const RADIAL = 7;
/** Growth speed in limbs per second; each limb takes GROWTH_SPAN / this to unfold. */
const GROWTH_PER_SECOND = 2.6;
/** A limb keeps growing over this many growth units, so neighbours overlap. */
const GROWTH_SPAN = 2;
/** How far along its growth a limb must be before it can be hovered or clicked. */
const HOVER_GROWN = 0.4;
const FLIGHT_SECONDS = 1.4;
/** Seconds without interaction before the camera drifts around the forest again. */
const IDLE_ROTATE_DELAY = 6;
const POLLEN_COUNT = 420;
const POLLEN_HEIGHT = 14;
/** Frames longer than this (a background tab waking up) are clamped so nothing jumps. */
const MAX_DELTA = 0.05;
const CLICK_SLOP_PX = 6;

const GROWTH_VERTEX = /* glsl */ `
  float grown = clamp((uGrowth - aOrder) / ${GROWTH_SPAN.toFixed(1)}, 0.0, 1.0);
  float reach = aT < 0.0001 ? 1.0 : min(aT, grown) / aT;
  reach *= step(0.0001, grown);
  transformed = mix(aStart, transformed, reach);
  float sway = transformed.y * 0.02;
  transformed.x += sin(uTime * 0.8 + transformed.y * 0.35 + aStart.z * 0.1) * sway;
  transformed.z += cos(uTime * 0.6 + transformed.y * 0.3 + aStart.x * 0.1) * sway;
`;

interface TreeUniforms {
  uGrowth: THREE.IUniform<number>;
  uTime: THREE.IUniform<number>;
  uFade: THREE.IUniform<number>;
}

interface TreeRuntime {
  tree: ForestTree;
  bark: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  uniforms: TreeUniforms;
  growth: number;
  maxGrowth: number;
  fade: number;
  fadeTarget: number;
}

interface FoliageItem {
  treeIndex: number;
  anchor: THREE.Vector3;
  size: number;
  order: number;
  kind: LimbKind;
  phase: number;
  color: THREE.Color;
}

interface PickData {
  nodeId: string;
  treeId: string;
  treeIndex: number;
  order: number;
  label: string;
  kind: LimbKind;
  anchor: THREE.Vector3;
}

interface Flight {
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  start: number;
  duration: number;
}

function hash01(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
  return (hash % 10000) / 10000;
}

function jitterVector(id: string, index: number, amount: number): THREE.Vector3 {
  return new THREE.Vector3(
    (hash01(`${id}:x${index}`) - 0.5) * 2 * amount,
    (hash01(`${id}:y${index}`) - 0.5) * 2 * amount,
    (hash01(`${id}:z${index}`) - 0.5) * 2 * amount,
  );
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * A tapered tube along the limb's curve. Besides positions it carries what the
 * growth shader needs per vertex: how far along the limb it sits, the limb's
 * growth order and the point it collapses to while ungrown.
 */
function createLimbGeometry(limb: Limb): THREE.BufferGeometry {
  const curve = new THREE.QuadraticBezierCurve3(limb.start, limb.control, limb.end);
  const geometry = new THREE.TubeGeometry(curve, TUBULAR, 1, RADIAL, false);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const count = position.count;
  const along = new Float32Array(count);
  const order = new Float32Array(count);
  const start = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  const bark = new THREE.Color(limb.kind === 'gap' ? BARK_BARE : BARK);
  const centre = new THREE.Vector3();
  const vertex = new THREE.Vector3();

  for (let ring = 0; ring <= TUBULAR; ring++) {
    const t = ring / TUBULAR;
    const radius = THREE.MathUtils.lerp(limb.startRadius, limb.endRadius, t);
    curve.getPointAt(t, centre);
    for (let spoke = 0; spoke <= RADIAL; spoke++) {
      const index = ring * (RADIAL + 1) + spoke;
      vertex.fromBufferAttribute(position, index).sub(centre).multiplyScalar(radius).add(centre);
      position.setXYZ(index, vertex.x, vertex.y, vertex.z);
      along[index] = t;
      order[index] = limb.order;
      start[index * 3] = limb.start.x;
      start[index * 3 + 1] = limb.start.y;
      start[index * 3 + 2] = limb.start.z;
      color[index * 3] = bark.r;
      color[index * 3 + 1] = bark.g;
      color[index * 3 + 2] = bark.b;
    }
  }

  geometry.setAttribute('aT', new THREE.BufferAttribute(along, 1));
  geometry.setAttribute('aOrder', new THREE.BufferAttribute(order, 1));
  geometry.setAttribute('aStart', new THREE.BufferAttribute(start, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function makeBarkMaterial(uniforms: TreeUniforms): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aT;\nattribute float aOrder;\nattribute vec3 aStart;\nuniform float uGrowth;\nuniform float uTime;',
      )
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${GROWTH_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uFade;')
      .replace(
        '#include <dithering_fragment>',
        '#include <dithering_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.05, 0.1, 0.11), uFade);',
      );
  };
  // Every tree shares one program; the key stops three compiling it per material.
  material.customProgramCacheKey = () => 'canvasquest-bark';
  return material;
}

/** Leaf clusters near the end of a limb; gaps get a few pale buds instead. */
function foliageFor(limb: Limb, treeIndex: number): FoliageItem[] {
  const color = new THREE.Color(FOLIAGE[limb.kind]);
  if (limb.kind === 'gap') {
    return [0, 1, 2].map(i => ({
      treeIndex,
      anchor: pointOnLimb(limb, 0.7 + i * 0.15).add(jitterVector(limb.id, i, 0.12)),
      size: 0.16 + 0.04 * i,
      order: limb.order,
      kind: 'gap' as const,
      phase: hash01(`${limb.id}:phase${i}`) * Math.PI * 2,
      color,
    }));
  }
  const base = Math.max(0.35, 1.35 * Math.pow(0.8, limb.depth));
  const stops = limb.isTip ? [0.72, 0.86, 1] : [0.86, 1];
  return stops.map((t, i) => ({
    treeIndex,
    anchor: pointOnLimb(limb, t).add(jitterVector(limb.id, i, base * 0.35)),
    size: base * (t === 1 ? 1 : 0.7),
    order: limb.order,
    kind: limb.kind,
    phase: hash01(`${limb.id}:phase${i}`) * Math.PI * 2,
    color,
  }));
}

function makeSeed(): { group: THREE.Group; halo: THREE.Mesh; sprout: THREE.Group } {
  const group = new THREE.Group();
  const sprout = new THREE.Group();
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.09, 1.1, 6),
    new THREE.MeshStandardMaterial({ color: '#5fae6a', roughness: 0.8 }),
  );
  stem.position.y = 0.55;
  const leafGeometry = new THREE.SphereGeometry(0.3, 10, 8);
  const leafMaterial = new THREE.MeshStandardMaterial({ color: '#8fd48f', roughness: 0.7 });
  const left = new THREE.Mesh(leafGeometry, leafMaterial);
  left.scale.set(1, 0.4, 0.7);
  left.position.set(-0.32, 1.05, 0);
  left.rotation.z = 0.5;
  const right = new THREE.Mesh(leafGeometry, leafMaterial);
  right.scale.set(1, 0.4, 0.7);
  right.position.set(0.32, 1.05, 0);
  right.rotation.z = -0.5;
  sprout.add(stem, left, right);
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(1.4, 2, 48),
    new THREE.MeshBasicMaterial({
      color: '#9fd8a8',
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.02;
  group.add(sprout, halo);
  return { group, halo, sprout };
}

export function createForestScene(container: HTMLElement, handlers: ForestHandlers): ForestScene {
  const reducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const canvas = renderer.domElement;
  Object.assign(canvas.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    display: 'block',
    touchAction: 'none',
    cursor: 'grab',
  });
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);
  scene.fog = new THREE.Fog(BACKGROUND, 45, 170);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  camera.position.set(0, 16, 44);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 5;
  controls.maxDistance = 160;
  controls.screenSpacePanning = false;
  controls.target.set(0, 6, 0);
  controls.autoRotateSpeed = 0.35;

  scene.add(new THREE.HemisphereLight('#bcd7d2', '#243a2c', 0.9));
  const sun = new THREE.DirectionalLight('#ffe3b3', 1.5);
  sun.position.set(18, 30, 12);
  scene.add(sun);
  const rim = new THREE.DirectionalLight('#6aa0b8', 0.35);
  rim.position.set(-20, 12, -16);
  scene.add(rim);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(150, 72),
    new THREE.MeshStandardMaterial({ color: GROUND, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const clearing = new THREE.Mesh(
    new THREE.CircleGeometry(9, 48),
    new THREE.MeshStandardMaterial({ color: CLEARING, roughness: 1 }),
  );
  clearing.rotation.x = -Math.PI / 2;
  clearing.position.y = 0.01;
  scene.add(clearing);

  const seed = makeSeed();
  scene.add(seed.group);

  const pollenPositions = new Float32Array(POLLEN_COUNT * 3);
  const pollenPhase = new Float32Array(POLLEN_COUNT);
  for (let i = 0; i < POLLEN_COUNT; i++) {
    pollenPositions[i * 3] = (Math.random() - 0.5) * 70;
    pollenPositions[i * 3 + 1] = Math.random() * POLLEN_HEIGHT;
    pollenPositions[i * 3 + 2] = (Math.random() - 0.5) * 70;
    pollenPhase[i] = Math.random() * Math.PI * 2;
  }
  const pollenGeometry = new THREE.BufferGeometry();
  const pollenAttribute = new THREE.BufferAttribute(pollenPositions, 3);
  pollenGeometry.setAttribute('position', pollenAttribute);
  const pollen = new THREE.Points(
    pollenGeometry,
    new THREE.PointsMaterial({
      color: '#f5e7b4',
      size: 0.16,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
  scene.add(pollen);

  const selectionRing = new THREE.Mesh(
    new THREE.RingGeometry(0.75, 0.95, 40),
    new THREE.MeshBasicMaterial({
      color: SELECTION,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthTest: false,
    }),
  );
  selectionRing.renderOrder = 3;
  selectionRing.visible = false;
  scene.add(selectionRing);

  const leafGeometry = new THREE.IcosahedronGeometry(1, 1);
  const leafMaterial = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, flatShading: true });
  const pickGeometry = new THREE.SphereGeometry(1, 8, 6);
  const pickMaterial = new THREE.MeshBasicMaterial();
  const pickGroup = new THREE.Group();
  pickGroup.visible = false;
  scene.add(pickGroup);

  const timer = new THREE.Timer();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const matrix = new THREE.Matrix4();
  const instancePosition = new THREE.Vector3();
  const instanceScale = new THREE.Vector3();
  const identity = new THREE.Quaternion();

  let forest: Forest = { trees: [], radius: 8 };
  let runtimes: TreeRuntime[] = [];
  let foliage: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null = null;
  let foliageItems: FoliageItem[] = [];
  let picks: PickData[] = [];
  let activeTreeId: string | null = null;
  let focusedTreeId: string | null = null;
  let selectedNodeId: string | null = null;
  let selectionAnchor: THREE.Vector3 | null = null;
  let flight: Flight | null = null;
  let framed = false;
  let lastInteraction = -Infinity;
  let pointerInside = false;
  let pointerDirty = false;
  let pointerClient = { x: 0, y: 0 };
  let hovered: PickData | null = null;
  let pressedAt: { x: number; y: number } | null = null;
  let disposed = false;
  /** Growth carries over between rebuilds, so adding a node grows one limb, not the whole tree. */
  const growthMemory = new Map<string, number>();
  const knownNodes = new Map<string, Set<string>>();

  function resize() {
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  function viewpoint(target: THREE.Vector3, distance: number, elevation: number): THREE.Vector3 {
    // Keep the current azimuth so re-framing never spins the world around.
    const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
    offset.y = 0;
    if (offset.lengthSq() < 1e-6) offset.set(0, 0, 1);
    else offset.normalize();
    return target
      .clone()
      .addScaledVector(offset, distance * Math.cos(elevation))
      .add(new THREE.Vector3(0, distance * Math.sin(elevation), 0));
  }

  function flyTo(position: THREE.Vector3, target: THREE.Vector3) {
    if (reducedMotion) {
      camera.position.copy(position);
      controls.target.copy(target);
      flight = null;
      controls.enabled = true;
      return;
    }
    flight = {
      fromPosition: camera.position.clone(),
      toPosition: position.clone(),
      fromTarget: controls.target.clone(),
      toTarget: target.clone(),
      start: timer.getElapsed(),
      duration: FLIGHT_SECONDS,
    };
    controls.enabled = false;
  }

  function frameForest(animate: boolean) {
    const radius = forest.radius;
    const distance = (radius / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) * 0.95 + 6;
    const target = new THREE.Vector3(0, Math.min(6, radius * 0.45), 0);
    const position = viewpoint(target, distance, THREE.MathUtils.degToRad(22));
    if (animate) flyTo(position, target);
    else {
      camera.position.copy(position);
      controls.target.copy(target);
    }
    framed = true;
  }

  function focusOn(tree: ForestTree) {
    const target = tree.ground.clone().add(new THREE.Vector3(0, tree.height * 0.45, 0));
    const distance = tree.height * 1.7 + 6;
    flyTo(viewpoint(target, distance, THREE.MathUtils.degToRad(16)), target);
  }

  function applyFade() {
    for (const runtime of runtimes) {
      runtime.fadeTarget = focusedTreeId !== null && runtime.tree.id !== focusedTreeId ? 0.6 : 0;
    }
    if (!foliage) return;
    const color = new THREE.Color();
    foliageItems.forEach((item, index) => {
      const fade = runtimes[item.treeIndex]?.fadeTarget ?? 0;
      color.copy(item.color).lerp(FADED, fade * 0.85);
      foliage?.setColorAt(index, color);
    });
    if (foliage.instanceColor) foliage.instanceColor.needsUpdate = true;
  }

  function updateSelectionAnchor() {
    const pick =
      selectedNodeId && activeTreeId
        ? picks.find(p => p.treeId === activeTreeId && p.nodeId === selectedNodeId)
        : undefined;
    selectionAnchor = pick ? pick.anchor : null;
    selectionRing.visible = selectionAnchor !== null;
  }

  function clearForest() {
    for (const runtime of runtimes) {
      scene.remove(runtime.bark);
      runtime.bark.geometry.dispose();
      runtime.bark.material.dispose();
    }
    runtimes = [];
    if (foliage) {
      scene.remove(foliage);
      foliage.dispose();
      foliage = null;
    }
    foliageItems = [];
    pickGroup.clear();
    picks = [];
  }

  function rebuild(boards: Board[]) {
    const previousCount = forest.trees.length;
    clearForest();
    forest = buildForest(boards);
    activeTreeId = forest.trees.find(tree => tree.isActive)?.id ?? null;

    const items: FoliageItem[] = [];
    forest.trees.forEach((tree, index) => {
      const known = knownNodes.get(tree.id);
      const fresh = tree.limbs.filter(limb => !known?.has(limb.id));
      const maxOrder = tree.limbs.reduce((max, limb) => Math.max(max, limb.order), 0);
      const maxGrowth = maxOrder + GROWTH_SPAN;
      let growth = growthMemory.get(tree.id) ?? 0;
      // New limbs start from nothing, even if growth had already run past their order.
      if (known && fresh.length > 0) {
        growth = Math.min(growth, ...fresh.map(limb => limb.order));
      }
      growth = reducedMotion ? maxGrowth : Math.min(growth, maxGrowth);
      knownNodes.set(tree.id, new Set(tree.limbs.map(limb => limb.id)));
      growthMemory.set(tree.id, growth);

      const parts = tree.limbs.map(createLimbGeometry);
      const merged = mergeGeometries(parts, false) ?? new THREE.BufferGeometry();
      parts.forEach(part => part.dispose());
      const uniforms: TreeUniforms = {
        uGrowth: { value: growth },
        uTime: { value: 0 },
        uFade: { value: 0 },
      };
      const bark = new THREE.Mesh(merged, makeBarkMaterial(uniforms));
      scene.add(bark);
      runtimes.push({ tree, bark, uniforms, growth, maxGrowth, fade: 0, fadeTarget: 0 });

      for (const limb of tree.limbs) {
        items.push(...foliageFor(limb, index));
        // The trunk is picked at its middle so the whole trunk reads as the root.
        const anchor = limb.depth === 0 ? pointOnLimb(limb, 0.5) : limb.end.clone();
        const pick = new THREE.Mesh(pickGeometry, pickMaterial);
        pick.position.copy(anchor);
        pick.scale.setScalar(limb.depth === 0 ? Math.max(1.1, limb.startRadius * 2.5) : Math.max(0.45, limb.endRadius * 3 + 0.2));
        const data: PickData = {
          nodeId: limb.id,
          treeId: tree.id,
          treeIndex: index,
          order: limb.order,
          label: limb.label,
          kind: limb.kind,
          anchor,
        };
        pick.userData = data;
        pickGroup.add(pick);
        picks.push(data);
      }
    });

    for (const id of Array.from(growthMemory.keys())) {
      if (!forest.trees.some(tree => tree.id === id)) {
        growthMemory.delete(id);
        knownNodes.delete(id);
      }
    }

    foliageItems = items;
    if (items.length > 0) {
      foliage = new THREE.InstancedMesh(leafGeometry, leafMaterial, items.length);
      foliage.frustumCulled = false;
      scene.add(foliage);
    }

    seed.group.visible = activeTreeId === null;
    if (focusedTreeId !== null && !forest.trees.some(tree => tree.id === focusedTreeId)) {
      focusedTreeId = null;
      handlers.onEnterTree(null);
    }
    applyFade();
    updateSelectionAnchor();
    if (!framed) frameForest(false);
    else if (forest.trees.length !== previousCount && focusedTreeId === null) frameForest(true);
  }

  function updateFoliage(elapsed: number) {
    if (!foliage) return;
    foliageItems.forEach((item, index) => {
      const runtime = runtimes[item.treeIndex];
      const grown = THREE.MathUtils.clamp((runtime.growth - item.order) / GROWTH_SPAN, 0, 1);
      const open = THREE.MathUtils.smoothstep((grown - 0.55) / 0.45, 0, 1);
      let scale = item.size * open;
      if (item.kind === 'gap') scale *= 0.85 + 0.25 * Math.sin(elapsed * 3 + item.phase);
      const sway = item.anchor.y * 0.02 * open;
      instancePosition.set(
        item.anchor.x + Math.sin(elapsed * 0.8 + item.anchor.y * 0.35) * sway,
        item.anchor.y,
        item.anchor.z + Math.cos(elapsed * 0.6 + item.anchor.y * 0.3) * sway,
      );
      instanceScale.set(scale, scale * 0.85, scale);
      matrix.compose(instancePosition, identity, instanceScale);
      foliage?.setMatrixAt(index, matrix);
    });
    foliage.instanceMatrix.needsUpdate = true;
  }

  function updatePollen(delta: number, elapsed: number) {
    for (let i = 0; i < POLLEN_COUNT; i++) {
      const phase = pollenPhase[i];
      let y = pollenPositions[i * 3 + 1] + delta * (0.25 + 0.2 * Math.sin(phase));
      if (y > POLLEN_HEIGHT) y = 0.3;
      pollenPositions[i * 3 + 1] = y;
      pollenPositions[i * 3] += Math.sin(elapsed * 0.3 + phase) * delta * 0.4;
    }
    pollenAttribute.needsUpdate = true;
  }

  function updateSeed(elapsed: number) {
    if (!seed.group.visible) return;
    seed.sprout.position.y = Math.sin(elapsed * 1.4) * 0.05;
    seed.sprout.rotation.z = Math.sin(elapsed * 0.9) * 0.08;
    const haloScale = 1 + Math.sin(elapsed * 1.6) * 0.08;
    seed.halo.scale.set(haloScale, haloScale, 1);
  }

  function updateFlight(elapsed: number) {
    if (!flight) return;
    const k = easeInOutCubic(Math.min(1, (elapsed - flight.start) / flight.duration));
    camera.position.lerpVectors(flight.fromPosition, flight.toPosition, k);
    controls.target.lerpVectors(flight.fromTarget, flight.toTarget, k);
    if (k >= 1) {
      flight = null;
      controls.enabled = true;
    }
  }

  function updateSelectionRing(elapsed: number) {
    if (!selectionAnchor) return;
    selectionRing.position.copy(selectionAnchor);
    selectionRing.lookAt(camera.position);
    const pulse = 1 + Math.sin(elapsed * 4) * 0.08;
    selectionRing.scale.set(pulse, pulse, 1);
  }

  function pick(): PickData | null {
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickGroup.children, false);
    for (const hit of hits) {
      const data = hit.object.userData as PickData;
      const runtime = runtimes[data.treeIndex];
      if (runtime && runtime.growth >= data.order + GROWTH_SPAN * HOVER_GROWN) return data;
    }
    return null;
  }

  function updateHover() {
    const data = pointerInside ? pick() : null;
    const changed = data?.nodeId !== hovered?.nodeId || data?.treeId !== hovered?.treeId;
    hovered = data;
    canvas.style.cursor = data ? 'pointer' : 'grab';
    if (!data && !changed) return;
    handlers.onHover(
      data
        ? {
            nodeId: data.nodeId,
            treeId: data.treeId,
            label: data.label,
            kind: data.kind,
            x: pointerClient.x,
            y: pointerClient.y,
          }
        : null,
    );
  }

  function readPointer(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    pointerClient = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    pointer.set(
      (pointerClient.x / Math.max(1, rect.width)) * 2 - 1,
      -(pointerClient.y / Math.max(1, rect.height)) * 2 + 1,
    );
  }

  const onPointerMove = (event: PointerEvent) => {
    readPointer(event);
    pointerInside = true;
    pointerDirty = true;
  };
  const onPointerLeave = () => {
    pointerInside = false;
    pointerDirty = true;
  };
  const onPointerDown = (event: PointerEvent) => {
    pressedAt = { x: event.clientX, y: event.clientY };
    lastInteraction = timer.getElapsed();
  };
  const onPointerUp = (event: PointerEvent) => {
    const pressed = pressedAt;
    pressedAt = null;
    if (!pressed) return;
    if (Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > CLICK_SLOP_PX) return;
    readPointer(event);
    pointerInside = true;
    const data = pick();
    if (!data) return;
    handlers.onSelect(data.nodeId, data.treeId);
    const tree = forest.trees[data.treeIndex];
    if (tree && focusedTreeId !== tree.id) {
      handlers.onEnterTree({
        id: tree.id,
        question: tree.question,
        isActive: tree.isActive,
        nodeCount: tree.nodeCount,
        gapCount: tree.gapCount,
      });
    }
  };
  const onDoubleClick = () => {
    if (focusedTreeId !== null) handlers.onEnterTree(null);
  };
  const onInteractionStart = () => {
    lastInteraction = timer.getElapsed();
  };
  const onInteractionEnd = () => {
    lastInteraction = timer.getElapsed();
  };

  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('dblclick', onDoubleClick);
  controls.addEventListener('start', onInteractionStart);
  controls.addEventListener('end', onInteractionEnd);

  renderer.setAnimationLoop(time => {
    if (disposed) return;
    timer.update(time);
    const delta = Math.min(timer.getDelta(), MAX_DELTA);
    const elapsed = timer.getElapsed();

    for (const runtime of runtimes) {
      if (runtime.growth < runtime.maxGrowth) {
        runtime.growth = Math.min(runtime.maxGrowth, runtime.growth + delta * GROWTH_PER_SECOND);
        growthMemory.set(runtime.tree.id, runtime.growth);
        runtime.uniforms.uGrowth.value = runtime.growth;
      }
      runtime.uniforms.uTime.value = elapsed;
      if (runtime.fade !== runtime.fadeTarget) {
        runtime.fade = THREE.MathUtils.damp(runtime.fade, runtime.fadeTarget, 4, delta);
        if (Math.abs(runtime.fade - runtime.fadeTarget) < 0.005) runtime.fade = runtime.fadeTarget;
        runtime.uniforms.uFade.value = runtime.fade;
      }
    }

    updateFoliage(elapsed);
    updatePollen(delta, elapsed);
    updateSeed(elapsed);
    updateFlight(elapsed);
    updateSelectionRing(elapsed);
    if (pointerDirty) {
      pointerDirty = false;
      updateHover();
    }

    controls.autoRotate =
      !reducedMotion && flight === null && pressedAt === null && elapsed - lastInteraction > IDLE_ROTATE_DELAY;
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    setData(boards) {
      if (disposed) return;
      rebuild(boards);
    },
    setSelected(nodeId) {
      selectedNodeId = nodeId;
      updateSelectionAnchor();
    },
    focusTree(treeId) {
      if (disposed) return;
      const tree = treeId ? (forest.trees.find(t => t.id === treeId) ?? null) : null;
      const resolved = tree ? tree.id : null;
      if (resolved === focusedTreeId) return;
      focusedTreeId = resolved;
      applyFade();
      if (tree) focusOn(tree);
      else frameForest(true);
    },
    dispose() {
      disposed = true;
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('dblclick', onDoubleClick);
      controls.removeEventListener('start', onInteractionStart);
      controls.removeEventListener('end', onInteractionEnd);
      controls.dispose();
      clearForest();
      scene.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
          object.geometry.dispose();
          const material: THREE.Material | THREE.Material[] = object.material;
          if (Array.isArray(material)) material.forEach(m => m.dispose());
          else material.dispose();
        }
      });
      leafGeometry.dispose();
      leafMaterial.dispose();
      pickGeometry.dispose();
      pickMaterial.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
