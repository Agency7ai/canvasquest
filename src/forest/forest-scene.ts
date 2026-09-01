import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { buildForest } from './forest-layout';
import type { Forest, ForestTree, Limb } from './forest-layout';
import type { NodeKind, TreeNode } from '../types';

export interface HoverInfo {
  id: string;
  label: string;
  kind: NodeKind;
  x: number;
  y: number;
}

export interface ForestHandlers {
  onHover: (info: HoverInfo | null) => void;
  onSelect: (id: string) => void;
  onEnterTree: (treeId: string | null, label: string | null) => void;
}

const BARK = new THREE.Color('#6b4f3a');
const BARK_BARE = new THREE.Color('#8a8377');
const FOLIAGE: Record<string, THREE.Color> = {
  concept: new THREE.Color('#4ea86b'),
  resource: new THREE.Color('#d9a441'),
  skill: new THREE.Color('#7fb069'),
  root: new THREE.Color('#3f8f5c'),
  gap: new THREE.Color('#b6b09c'),
};

const TUBULAR = 10;
const RADIAL = 7;
const GROWTH_PER_SECOND = 4.5;

/** A tapered, curved limb. TubeGeometry gives a constant radius, so each ring
 *  is pulled toward the spine to thin the limb along its length. */
function createLimbGeometry(limb: Limb): THREE.BufferGeometry {
  const curve = new THREE.QuadraticBezierCurve3(limb.start, limb.control, limb.end);
  const geometry = new THREE.TubeGeometry(curve, TUBULAR, 1, RADIAL, false);
  const position = geometry.attributes.position as THREE.BufferAttribute;

  const count = position.count;
  const aT = new Float32Array(count);
  const aOrder = new Float32Array(count);
  const aStart = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  // Unresolved gaps are bare, greyed wood: grown, but nothing has opened on it.
  const bark = limb.kind === 'gap' ? BARK_BARE : BARK;

  const vertex = new THREE.Vector3();
  for (let ring = 0; ring <= TUBULAR; ring += 1) {
    const t = ring / TUBULAR;
    const spine = curve.getPoint(t);
    const radius = THREE.MathUtils.lerp(limb.startRadius, limb.endRadius, t);

    for (let segment = 0; segment <= RADIAL; segment += 1) {
      const index = ring * (RADIAL + 1) + segment;
      vertex.fromBufferAttribute(position, index).sub(spine).multiplyScalar(radius).add(spine);
      position.setXYZ(index, vertex.x, vertex.y, vertex.z);

      aT[index] = t;
      aOrder[index] = limb.order;
      aStart[index * 3] = limb.start.x;
      aStart[index * 3 + 1] = limb.start.y;
      aStart[index * 3 + 2] = limb.start.z;
      colors[index * 3] = bark.r;
      colors[index * 3 + 1] = bark.g;
      colors[index * 3 + 2] = bark.b;
    }
  }

  geometry.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
  geometry.setAttribute('aOrder', new THREE.BufferAttribute(aOrder, 1));
  geometry.setAttribute('aStart', new THREE.BufferAttribute(aStart, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

interface TreeVisual {
  id: string;
  label: string;
  tree: ForestTree;
  bark: THREE.Mesh;
  foliage: THREE.InstancedMesh;
  foliageLimbs: Limb[];
  buds: THREE.InstancedMesh;
  gapLimbs: Limb[];
  growth: number;
  target: number;
  uniforms: { uTime: { value: number }; uGrowth: { value: number }; uFade: { value: number } };
}

export function createForestScene(container: HTMLElement, handlers: ForestHandlers) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0d1b1e');
  scene.fog = new THREE.Fog('#12262a', 34, 130);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  camera.position.set(0, 16, 44);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = false;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 5;
  controls.maxDistance = 160;
  controls.target.set(0, 6, 0);

  scene.add(new THREE.HemisphereLight('#cfe8ff', '#2b3a1f', 1.15));
  const sun = new THREE.DirectionalLight('#ffe6bd', 1.5);
  sun.position.set(26, 38, 18);
  scene.add(sun);
  scene.add(new THREE.AmbientLight('#4b6b57', 0.45));

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(150, 72),
    new THREE.MeshStandardMaterial({ color: '#24402c', roughness: 1, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  scene.add(ground);

  // Pollen catching the light, so the air is not empty.
  const pollenCount = 420;
  const pollenPositions = new Float32Array(pollenCount * 3);
  for (let index = 0; index < pollenCount; index += 1) {
    pollenPositions[index * 3] = (Math.random() - 0.5) * 120;
    pollenPositions[index * 3 + 1] = Math.random() * 30;
    pollenPositions[index * 3 + 2] = (Math.random() - 0.5) * 120;
  }
  const pollenGeometry = new THREE.BufferGeometry();
  pollenGeometry.setAttribute('position', new THREE.BufferAttribute(pollenPositions, 3));
  const pollen = new THREE.Points(
    pollenGeometry,
    new THREE.PointsMaterial({
      color: '#ffeab6',
      size: 0.16,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  scene.add(pollen);

  const forestGroup = new THREE.Group();
  scene.add(forestGroup);

  // The board's root: a sprout in the middle of the clearing that everything
  // else grew from.
  const seedGroup = new THREE.Group();
  const seedStem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.09, 0.9, 6),
    new THREE.MeshStandardMaterial({ color: '#5d7f43', roughness: 0.9 })
  );
  seedStem.position.y = 0.45;
  const seedBud = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 16, 14),
    new THREE.MeshStandardMaterial({ color: '#9fd67f', emissive: '#2f5d33', roughness: 0.6 })
  );
  seedBud.position.y = 1.02;
  seedBud.scale.y = 1.45;
  seedGroup.add(seedStem, seedBud);
  scene.add(seedGroup);

  const foliageGeometry = new THREE.IcosahedronGeometry(1, 0);
  const budGeometry = new THREE.SphereGeometry(1, 10, 8);

  let visuals: TreeVisual[] = [];
  let pickTargets: THREE.Mesh[] = [];
  const pickMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const pickGeometry = new THREE.SphereGeometry(1, 8, 6);

  const selectionRing = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.05, 8, 40),
    new THREE.MeshBasicMaterial({ color: '#fdf6b2', transparent: true, opacity: 0.95 })
  );
  selectionRing.visible = false;
  scene.add(selectionRing);

  let selectedId = '';
  let focusedTreeId: string | null = null;
  let hoveredId: string | null = null;
  const growthMemory = new Map<string, number>();

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerInside = false;

  let cameraFlight: { from: THREE.Vector3; to: THREE.Vector3; look: THREE.Vector3; t: number } | null =
    null;

  function disposeForest() {
    for (const visual of visuals) {
      forestGroup.remove(visual.bark);
      visual.bark.geometry.dispose();
      (visual.bark.material as THREE.Material).dispose();
      forestGroup.remove(visual.foliage);
      (visual.foliage.material as THREE.Material).dispose();
      forestGroup.remove(visual.buds);
      (visual.buds.material as THREE.Material).dispose();
    }
    visuals = [];

    for (const target of pickTargets) {
      scene.remove(target);
    }
    pickTargets = [];
  }

  function makeBarkMaterial(uniforms: TreeVisual['uniforms']) {
    const material = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      vertexColors: true,
      roughness: 0.92,
      metalness: 0,
      transparent: true,
    });

    material.onBeforeCompile = shader => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.uniforms.uGrowth = uniforms.uGrowth;
      shader.uniforms.uFade = uniforms.uFade;

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           attribute float aT;
           attribute float aOrder;
           attribute vec3 aStart;
           uniform float uTime;
           uniform float uGrowth;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           // Limbs extend from their origin instead of appearing whole.
           float grown = clamp(uGrowth - aOrder, 0.0, 1.0);
           float reach = aT > 0.0001 ? min(aT, grown) / aT : 1.0;
           transformed = mix(aStart, transformed, reach);
           // Wind: higher wood moves more, each limb slightly out of step.
           float h = max(transformed.y, 0.0);
           float sway = sin(uTime * 0.85 + h * 0.22 + aOrder * 0.55) * 0.016 * h;
           transformed.x += sway;
           transformed.z += sway * 0.55;`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform float uFade;`)
        .replace(
          '#include <dithering_fragment>',
          `#include <dithering_fragment>\ngl_FragColor.a *= uFade;`
        );
    };

    return material;
  }

  function setData(nodes: TreeNode[]) {
    disposeForest();
    const forest: Forest = buildForest(nodes);

    seedGroup.visible = Boolean(forest.seed);
    if (forest.seed) seedGroup.position.copy(forest.seed.position);

    for (const tree of forest.trees) {
      const uniforms = {
        uTime: { value: 0 },
        uGrowth: { value: growthMemory.get(tree.id) ?? 0 },
        uFade: { value: 1 },
      };

      const geometries = tree.limbs.map(createLimbGeometry);
      const merged = BufferGeometryUtils.mergeGeometries(geometries, false);
      geometries.forEach(geometry => geometry.dispose());

      const bark = new THREE.Mesh(merged, makeBarkMaterial(uniforms));
      bark.frustumCulled = false;
      forestGroup.add(bark);

      // Foliage sits on limbs that are not bare. Gaps stay unbloomed.
      const foliageLimbs = tree.limbs.filter(limb => limb.kind !== 'gap' && limb.depth > 0);
      const foliage = new THREE.InstancedMesh(
        foliageGeometry,
        new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true, transparent: true }),
        Math.max(foliageLimbs.length * 3, 1)
      );
      foliage.frustumCulled = false;
      foliage.count = foliageLimbs.length * 3;
      forestGroup.add(foliage);

      const colour = new THREE.Color();
      foliageLimbs.forEach((limb, index) => {
        const base = FOLIAGE[limb.kind] ?? FOLIAGE.concept;
        for (let cluster = 0; cluster < 3; cluster += 1) {
          colour.copy(base).offsetHSL(0, 0, (Math.random() - 0.5) * 0.14);
          foliage.setColorAt(index * 3 + cluster, colour);
        }
      });
      if (foliage.instanceColor) foliage.instanceColor.needsUpdate = true;

      // A gap gets a bud that never opens, and quietly pulses until it does.
      const gapLimbs = tree.limbs.filter(limb => limb.kind === 'gap');
      const buds = new THREE.InstancedMesh(
        budGeometry,
        new THREE.MeshStandardMaterial({
          color: '#e6d9a8',
          emissive: '#7c6f3a',
          emissiveIntensity: 0.5,
          roughness: 0.7,
          transparent: true,
        }),
        Math.max(gapLimbs.length, 1)
      );
      buds.count = gapLimbs.length;
      buds.frustumCulled = false;
      forestGroup.add(buds);

      visuals.push({
        id: tree.id,
        label: tree.label,
        tree,
        bark,
        foliage,
        foliageLimbs,
        buds,
        gapLimbs,
        growth: growthMemory.get(tree.id) ?? 0,
        target: tree.limbs.length,
        uniforms,
      });

      // Invisible pick spheres: cheap, reliable per-node hit testing against
      // merged tree geometry.
      for (const limb of tree.limbs) {
        const target = new THREE.Mesh(pickGeometry, pickMaterial);
        target.position.copy(limb.end);
        target.scale.setScalar(Math.max(limb.startRadius * 3.2, 0.62));
        target.userData = { nodeId: limb.id, treeId: tree.id, limbOrder: limb.order };
        scene.add(target);
        pickTargets.push(target);
      }
    }

    if (forest.seed) {
      const target = new THREE.Mesh(pickGeometry, pickMaterial);
      target.position.copy(forest.seed.position).add(new THREE.Vector3(0, 1, 0));
      target.scale.setScalar(0.8);
      target.userData = { nodeId: forest.seed.id, treeId: null, limbOrder: 0 };
      scene.add(target);
      pickTargets.push(target);
    }

    if (!focusedTreeId) frameForest(forest);
  }

  function frameForest(forest: Forest) {
    const distance = Math.max(forest.radius * 2.6, 34);
    cameraFlight = {
      from: camera.position.clone(),
      to: new THREE.Vector3(distance * 0.32, distance * 0.42, distance),
      look: new THREE.Vector3(0, 5, 0),
      t: 0,
    };
  }

  function focusTree(treeId: string | null) {
    focusedTreeId = treeId;

    if (!treeId) {
      const radius = visuals.reduce((max, visual) => Math.max(max, visual.tree.ground.length()), 10);
      cameraFlight = {
        from: camera.position.clone(),
        to: new THREE.Vector3(radius * 0.9, radius * 1.2, radius * 2.8),
        look: new THREE.Vector3(0, 5, 0),
        t: 0,
      };
      handlers.onEnterTree(null, null);
      return;
    }

    const visual = visuals.find(item => item.id === treeId);
    if (!visual) return;

    const { ground, height } = visual.tree;
    const outward = ground.clone().setY(0);
    if (outward.lengthSq() < 0.001) outward.set(1, 0, 0);
    outward.normalize();

    cameraFlight = {
      from: camera.position.clone(),
      to: ground.clone().add(outward.multiplyScalar(height * 1.5)).setY(height * 0.85),
      look: ground.clone().setY(height * 0.55),
      t: 0,
    };
    handlers.onEnterTree(treeId, visual.label);
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
    if (!hoveredId) return;
    handlers.onSelect(hoveredId);

    // Clicking into a tree you are not already inside enters it.
    const target = pickTargets.find(item => item.userData.nodeId === hoveredId);
    const treeId = target?.userData.treeId as string | null | undefined;
    if (treeId && treeId !== focusedTreeId) focusTree(treeId);
  }

  function handleDoubleClick() {
    focusTree(null);
  }

  renderer.domElement.addEventListener('pointermove', handlePointerMove);
  renderer.domElement.addEventListener('pointerleave', handlePointerLeave);
  renderer.domElement.addEventListener('click', handleClick);
  renderer.domElement.addEventListener('dblclick', handleDoubleClick);

  function resize() {
    const { clientWidth, clientHeight } = container;
    if (clientWidth === 0 || clientHeight === 0) return;
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(clientWidth, clientHeight);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  const clock = new THREE.Clock();
  const dummy = new THREE.Object3D();
  let frame = 0;

  function animate() {
    frame = requestAnimationFrame(animate);
    const elapsed = clock.getElapsedTime();
    const delta = Math.min(clock.getDelta(), 0.05);

    seedGroup.scale.setScalar(1 + Math.sin(elapsed * 1.3) * 0.05);
    seedGroup.rotation.y = elapsed * 0.15;
    pollen.rotation.y = elapsed * 0.008;

    for (const visual of visuals) {
      // Growth creeps outward from the trunk rather than snapping in.
      if (visual.growth < visual.target) {
        visual.growth = Math.min(visual.target, visual.growth + delta * GROWTH_PER_SECOND);
        growthMemory.set(visual.id, visual.growth);
      }
      visual.uniforms.uTime.value = elapsed;
      visual.uniforms.uGrowth.value = visual.growth;

      const dimmed = focusedTreeId !== null && focusedTreeId !== visual.id;
      const targetFade = dimmed ? 0.22 : 1;
      visual.uniforms.uFade.value += (targetFade - visual.uniforms.uFade.value) * 0.08;
      (visual.foliage.material as THREE.MeshStandardMaterial).opacity =
        visual.uniforms.uFade.value;

      visual.foliageLimbs.forEach((limb, index) => {
        const grown = THREE.MathUtils.clamp(visual.growth - limb.order, 0, 1);
        // Leaves open only once their limb has finished extending.
        const open = THREE.MathUtils.clamp((grown - 0.55) / 0.45, 0, 1);
        const sway = Math.sin(elapsed * 0.85 + limb.end.y * 0.22 + limb.order * 0.55) * 0.016 * limb.end.y;

        for (let cluster = 0; cluster < 3; cluster += 1) {
          const angle = (cluster / 3) * Math.PI * 2 + limb.order;
          const spread = limb.isTip ? 0.42 : 0.3;

          dummy.position.copy(limb.end);
          dummy.position.x += Math.cos(angle) * spread + sway;
          dummy.position.z += Math.sin(angle) * spread + sway * 0.55;
          dummy.position.y += Math.sin(angle * 1.7) * 0.22;

          const size = open * (limb.isTip ? 0.52 : 0.36) * (0.85 + Math.sin(elapsed + limb.order + cluster) * 0.08);
          dummy.scale.setScalar(Math.max(size, 0.0001));
          dummy.rotation.set(limb.order + cluster, elapsed * 0.1 + cluster, 0);
          dummy.updateMatrix();
          visual.foliage.setMatrixAt(index * 3 + cluster, dummy.matrix);
        }
      });
      visual.foliage.instanceMatrix.needsUpdate = true;

      (visual.buds.material as THREE.MeshStandardMaterial).opacity = visual.uniforms.uFade.value;
      visual.gapLimbs.forEach((limb, index) => {
        const grown = THREE.MathUtils.clamp(visual.growth - limb.order, 0, 1);
        const sway = Math.sin(elapsed * 0.85 + limb.end.y * 0.22 + limb.order * 0.55) * 0.016 * limb.end.y;
        // Held breath: the bud swells and eases back without ever opening.
        const swell = 0.16 + Math.sin(elapsed * 1.9 + limb.order) * 0.03;

        dummy.position.copy(limb.end);
        dummy.position.x += sway;
        dummy.position.z += sway * 0.55;
        dummy.scale.setScalar(Math.max(grown * swell, 0.0001));
        dummy.scale.y *= 1.5;
        dummy.rotation.set(0, elapsed * 0.4 + limb.order, 0);
        dummy.updateMatrix();
        visual.buds.setMatrixAt(index, dummy.matrix);
      });
      visual.buds.instanceMatrix.needsUpdate = true;
    }

    if (cameraFlight) {
      cameraFlight.t = Math.min(1, cameraFlight.t + delta * 0.9);
      const eased = 1 - Math.pow(1 - cameraFlight.t, 3);
      camera.position.lerpVectors(cameraFlight.from, cameraFlight.to, eased);
      controls.target.lerp(cameraFlight.look, eased * 0.35);
      if (cameraFlight.t >= 1) cameraFlight = null;
    }

    if (pointerInside && pickTargets.length > 0) {
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pickTargets, false);
      const hit = hits.find(item => {
        const order = item.object.userData.limbOrder as number;
        const treeId = item.object.userData.treeId as string | null;
        if (treeId === null) return true;
        const visual = visuals.find(candidate => candidate.id === treeId);
        // Do not offer a limb that has not grown yet.
        return visual ? visual.growth > order + 0.4 : false;
      });

      const hitId = (hit?.object.userData.nodeId as string) ?? null;
      if (hitId !== hoveredId) {
        hoveredId = hitId;
        if (hit) {
          const projected = hit.object.position.clone().project(camera);
          const rect = renderer.domElement.getBoundingClientRect();
          const limb = visuals
            .flatMap(visual => visual.tree.limbs)
            .find(item => item.id === hitId);
          handlers.onHover({
            id: hitId!,
            label: limb?.label ?? 'root',
            kind: limb?.kind ?? 'root',
            x: ((projected.x + 1) / 2) * rect.width,
            y: ((-projected.y + 1) / 2) * rect.height,
          });
        } else {
          handlers.onHover(null);
        }
      }
      renderer.domElement.style.cursor = hitId ? 'pointer' : 'grab';
    }

    const selectedTarget = pickTargets.find(target => target.userData.nodeId === selectedId);
    if (selectedTarget) {
      selectionRing.visible = true;
      selectionRing.position.copy(selectedTarget.position);
      selectionRing.lookAt(camera.position);
      selectionRing.scale.setScalar(selectedTarget.scale.x * 1.5 * (1 + Math.sin(elapsed * 2.6) * 0.07));
    } else {
      selectionRing.visible = false;
    }

    controls.update();
    renderer.render(scene, camera);
  }

  animate();

  return {
    setData,
    setSelected,
    focusTree,
    dispose() {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
      renderer.domElement.removeEventListener('click', handleClick);
      renderer.domElement.removeEventListener('dblclick', handleDoubleClick);

      disposeForest();
      foliageGeometry.dispose();
      budGeometry.dispose();
      pickGeometry.dispose();
      pickMaterial.dispose();
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      pollenGeometry.dispose();
      (pollen.material as THREE.Material).dispose();
      seedStem.geometry.dispose();
      (seedStem.material as THREE.Material).dispose();
      seedBud.geometry.dispose();
      (seedBud.material as THREE.Material).dispose();
      selectionRing.geometry.dispose();
      (selectionRing.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
