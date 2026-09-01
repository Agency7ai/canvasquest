import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { layout3D } from './layout-3d';
import type { TreeNode, NodeKind } from '../types';

const PALETTE: Record<NodeKind, THREE.Color> = {
  root: new THREE.Color('#a5b4fc'),
  concept: new THREE.Color('#5eead4'),
  resource: new THREE.Color('#fcd34d'),
  skill: new THREE.Color('#c4b5fd'),
  gap: new THREE.Color('#fb7185'),
};

export interface HoverInfo {
  id: string;
  label: string;
  kind: NodeKind;
  x: number;
  y: number;
}

export interface AetherHandlers {
  onHover: (info: HoverInfo | null) => void;
  onSelect: (id: string) => void;
}

/** Soft radial falloff, generated rather than shipped as an asset. */
function createGlowTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.22)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const FILAMENT_VERTEX = /* glsl */ `
  attribute float aT;
  attribute float aSeed;
  varying float vT;
  varying float vSeed;
  void main() {
    vT = aT;
    vSeed = aSeed;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FILAMENT_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uBase;
  uniform vec3 uHot;
  varying float vT;
  varying float vSeed;
  void main() {
    // A charge travels the filament, so the structure reads as conducting
    // something rather than as static wire.
    float head = fract(uTime * 0.18 + vSeed);
    float dist = abs(fract(vT - head + 0.5) - 0.5);
    float charge = smoothstep(0.14, 0.0, dist);
    float body = 0.13 + 0.05 * sin(uTime * 0.9 + vSeed * 6.2831);
    gl_FragColor = vec4(mix(uBase, uHot, charge), body + charge * 0.8);
  }
`;

interface NodeVisual {
  id: string;
  kind: NodeKind;
  label: string;
  halo: THREE.Sprite;
  core: THREE.Mesh;
  home: THREE.Vector3;
  phase: number;
  maturity: number;
}

export function createAetherScene(
  container: HTMLElement,
  handlers: AetherHandlers
) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#05060f');
  scene.fog = new THREE.FogExp2('#05060f', 0.021);

  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 400);
  camera.position.set(0, 9, 34);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.rotateSpeed = 0.55;
  controls.minDistance = 8;
  controls.maxDistance = 120;
  controls.target.set(0, 7, 0);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 1.15, 0.72, 0.12);
  composer.addPass(bloom);

  const glowTexture = createGlowTexture();
  const organism = new THREE.Group();
  scene.add(organism);

  // Atmosphere: slow motes so the volume never reads as empty space.
  const moteCount = 700;
  const motePositions = new Float32Array(moteCount * 3);
  for (let index = 0; index < moteCount; index += 1) {
    motePositions[index * 3] = (Math.random() - 0.5) * 90;
    motePositions[index * 3 + 1] = Math.random() * 60 - 12;
    motePositions[index * 3 + 2] = (Math.random() - 0.5) * 90;
  }
  const moteGeometry = new THREE.BufferGeometry();
  moteGeometry.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
  const motes = new THREE.Points(
    moteGeometry,
    new THREE.PointsMaterial({
      size: 0.42,
      map: glowTexture,
      color: new THREE.Color('#7dd3fc'),
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  scene.add(motes);

  const filamentUniforms = {
    uTime: { value: 0 },
    uBase: { value: new THREE.Color('#1e3a8a') },
    uHot: { value: new THREE.Color('#a5f3fc') },
  };
  const filamentMaterial = new THREE.ShaderMaterial({
    uniforms: filamentUniforms,
    vertexShader: FILAMENT_VERTEX,
    fragmentShader: FILAMENT_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const coreGeometry = new THREE.IcosahedronGeometry(0.34, 1);
  const selectionRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.25, 0.045, 10, 64),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#f8fafc'),
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  selectionRing.visible = false;
  scene.add(selectionRing);

  let visuals: NodeVisual[] = [];
  let filaments: THREE.LineSegments | null = null;
  let selectedId = '';
  let hoveredId: string | null = null;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerInside = false;

  function clearOrganism() {
    for (const visual of visuals) {
      visual.halo.material.dispose();
      organism.remove(visual.halo);
      organism.remove(visual.core);
      (visual.core.material as THREE.Material).dispose();
    }
    visuals = [];

    if (filaments) {
      organism.remove(filaments);
      filaments.geometry.dispose();
      filaments = null;
    }
  }

  function setData(nodes: TreeNode[]) {
    clearOrganism();
    if (nodes.length === 0) return;

    const placements = layout3D(nodes);

    nodes.forEach((node, index) => {
      const placement = placements.get(node.id);
      if (!placement) return;

      const color = PALETTE[node.kind];
      const scale = 2.5 - placement.maturity * 0.9 + (node.kind === 'root' ? 1.5 : 0);

      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture,
          color,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      halo.position.copy(placement.position);
      halo.scale.setScalar(scale);
      halo.userData.nodeId = node.id;
      organism.add(halo);

      const core = new THREE.Mesh(
        coreGeometry,
        new THREE.MeshBasicMaterial({ color: color.clone().offsetHSL(0, 0, 0.28) })
      );
      core.position.copy(placement.position);
      core.scale.setScalar(node.kind === 'root' ? 1.6 : 1 - placement.maturity * 0.3);
      organism.add(core);

      visuals.push({
        id: node.id,
        kind: node.kind,
        label: node.label,
        halo,
        core,
        home: placement.position.clone(),
        phase: index * 0.37,
        maturity: placement.maturity,
      });
    });

    // Filaments: curved, sagging slightly, so connections feel grown not routed.
    const positions: number[] = [];
    const ts: number[] = [];
    const seeds: number[] = [];
    const SAMPLES = 22;

    for (const node of nodes) {
      if (!node.parentId) continue;
      const from = placements.get(node.parentId)?.position;
      const to = placements.get(node.id)?.position;
      if (!from || !to) continue;

      const mid = from.clone().lerp(to, 0.5);
      mid.y -= from.distanceTo(to) * 0.16;
      const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
      const points = curve.getPoints(SAMPLES);
      const seed = Math.random();

      for (let index = 0; index < points.length - 1; index += 1) {
        positions.push(points[index].x, points[index].y, points[index].z);
        positions.push(points[index + 1].x, points[index + 1].y, points[index + 1].z);
        ts.push(index / SAMPLES, (index + 1) / SAMPLES);
        seeds.push(seed, seed);
      }
    }

    if (positions.length > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('aT', new THREE.Float32BufferAttribute(ts, 1));
      geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
      filaments = new THREE.LineSegments(geometry, filamentMaterial);
      organism.add(filaments);
    }

    frameCamera();
  }

  function frameCamera() {
    if (visuals.length === 0) return;
    const box = new THREE.Box3();
    visuals.forEach(visual => box.expandByPoint(visual.home));

    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getSize(new THREE.Vector3()).length(), 12);

    controls.target.copy(center);
    camera.position.set(center.x + radius * 0.15, center.y + radius * 0.28, center.z + radius * 1.05);
    controls.update();
  }

  function setSelected(id: string) {
    selectedId = id;
  }

  function handlePointerMove(event: PointerEvent) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    pointerInside = true;
  }

  function handlePointerLeave() {
    pointerInside = false;
    hoveredId = null;
    handlers.onHover(null);
  }

  function handleClick() {
    if (hoveredId) handlers.onSelect(hoveredId);
  }

  renderer.domElement.addEventListener('pointermove', handlePointerMove);
  renderer.domElement.addEventListener('pointerleave', handlePointerLeave);
  renderer.domElement.addEventListener('click', handleClick);

  function resize() {
    const { clientWidth, clientHeight } = container;
    if (clientWidth === 0 || clientHeight === 0) return;
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(clientWidth, clientHeight);
    composer.setSize(clientWidth, clientHeight);
    bloom.setSize(clientWidth, clientHeight);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  const clock = new THREE.Clock();
  let frame = 0;

  function animate() {
    frame = requestAnimationFrame(animate);
    const elapsed = clock.getElapsedTime();
    filamentUniforms.uTime.value = elapsed;

    organism.rotation.y = Math.sin(elapsed * 0.045) * 0.22;
    motes.rotation.y = elapsed * 0.012;

    for (const visual of visuals) {
      // Breath: one slow cycle, phase-shifted per node, so the whole form
      // ripples instead of pulsing in lockstep.
      const breath = Math.sin(elapsed * 0.7 + visual.phase);
      const isGap = visual.kind === 'gap';

      // Unresolved gaps are unstable: faster, jittering, never settling.
      const flicker = isGap
        ? 0.72 + Math.abs(Math.sin(elapsed * 6.3 + visual.phase * 3)) * 0.5
        : 1;

      const base = 2.5 - visual.maturity * 0.9 + (visual.kind === 'root' ? 1.5 : 0);
      const scale = base * (1 + breath * 0.07) * flicker;
      visual.halo.scale.setScalar(scale);
      visual.halo.material.opacity = (0.62 + breath * 0.16) * (isGap ? flicker : 1);

      const drift = new THREE.Vector3(
        Math.sin(elapsed * 0.31 + visual.phase) * 0.22,
        Math.cos(elapsed * 0.26 + visual.phase * 1.4) * 0.26,
        Math.cos(elapsed * 0.35 + visual.phase * 0.8) * 0.22
      );
      const drifted = visual.home.clone().add(drift);
      visual.halo.position.copy(drifted);
      visual.core.position.copy(drifted);
      visual.core.rotation.x = elapsed * 0.25 + visual.phase;
      visual.core.rotation.y = elapsed * 0.32 + visual.phase;
    }

    if (pointerInside && visuals.length > 0) {
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(visuals.map(visual => visual.halo), false);
      const hitId = (hits[0]?.object.userData.nodeId as string) ?? null;

      if (hitId !== hoveredId) {
        hoveredId = hitId;
        const visual = visuals.find(item => item.id === hitId);
        if (visual) {
          const projected = visual.halo.position.clone().project(camera);
          const rect = renderer.domElement.getBoundingClientRect();
          handlers.onHover({
            id: visual.id,
            label: visual.label,
            kind: visual.kind,
            x: ((projected.x + 1) / 2) * rect.width,
            y: ((-projected.y + 1) / 2) * rect.height,
          });
        } else {
          handlers.onHover(null);
        }
      }
      renderer.domElement.style.cursor = hitId ? 'pointer' : 'grab';
    }

    const selected = visuals.find(visual => visual.id === selectedId);
    if (selected) {
      selectionRing.visible = true;
      selectionRing.position.copy(selected.halo.position);
      selectionRing.lookAt(camera.position);
      const ringPulse = 1 + Math.sin(elapsed * 2.4) * 0.08;
      selectionRing.scale.setScalar(ringPulse);
    } else {
      selectionRing.visible = false;
    }

    controls.update();
    composer.render();
  }

  animate();

  return {
    setData,
    setSelected,
    dispose() {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
      renderer.domElement.removeEventListener('click', handleClick);

      clearOrganism();
      coreGeometry.dispose();
      filamentMaterial.dispose();
      glowTexture.dispose();
      moteGeometry.dispose();
      (motes.material as THREE.Material).dispose();
      selectionRing.geometry.dispose();
      (selectionRing.material as THREE.Material).dispose();
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
