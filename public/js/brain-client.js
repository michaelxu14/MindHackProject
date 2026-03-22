import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ═══════════════════════════════════════════════════════════════════════════
// Setup
// ═══════════════════════════════════════════════════════════════════════════

const container = document.getElementById('brain-canvas');
const loadingEl = document.getElementById('loading');
const loadStatus = document.getElementById('load-status');
const statsEl = document.getElementById('stats');
const tooltipEl = document.getElementById('region-tooltip');
const regionPopupEl = document.getElementById('region-popup');
const regionListEl = document.getElementById('region-list');
const popupCloseBtn = regionPopupEl?.querySelector('.popup-close');
const popupColorDotEl = regionPopupEl?.querySelector('.color-dot');
const popupTitleEl = regionPopupEl?.querySelector('.popup-title');
const popupDescriptionEl = regionPopupEl?.querySelector('.popup-description');

// ─── Scene ─────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();

const brainGroup = new THREE.Group();
// Rotate -90 degrees around X to fix Z-up to Y-up so the brain is upright.
brainGroup.rotation.x = -Math.PI / 2;
// Adjust position slightly if needed, but centering will happen based on its new upright position.
scene.add(brainGroup);

// ─── Camera ────────────────────────────────────────────────────────────────
const width = container.clientWidth || 800;
const height = container.clientHeight || 600;
const camera = new THREE.PerspectiveCamera(
  50, width / height, 0.1, 2000
);
camera.position.set(0, 40, 180);

// ─── Renderer ──────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true, // transparent background for integration
  stencil: true,
  powerPreference: 'high-performance',
});
renderer.setSize(width, height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.localClippingEnabled = true;   // Enable for cross-section
container.appendChild(renderer.domElement);

// ─── Controls ──────────────────────────────────────────────────────────────
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.rotateSpeed = 0.7;
controls.zoomSpeed = 0.9;
controls.minDistance = 30;
controls.maxDistance = 500;
controls.target.set(0, 0, 0);

// ═══════════════════════════════════════════════════════════════════════════
// Lighting
// ═══════════════════════════════════════════════════════════════════════════

const ambient = new THREE.AmbientLight(0x4444aa, 0.4);
scene.add(ambient);

const hemi = new THREE.HemisphereLight(0x8888cc, 0x443344, 0.5);
hemi.position.set(0, 100, 0);
scene.add(hemi);

const keyLight = new THREE.DirectionalLight(0xfff0e6, 1.0);
keyLight.position.set(80, 120, 100);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xb8c4ff, 0.5);
fillLight.position.set(-60, 40, -50);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xc4b5fd, 0.3);
rimLight.position.set(0, -30, -100);
scene.add(rimLight);

const pointA = new THREE.PointLight(0x6366f1, 0.4, 300);
pointA.position.set(50, 80, 50);
scene.add(pointA);

const pointB = new THREE.PointLight(0xa78bfa, 0.3, 300);
pointB.position.set(-50, -30, 80);
scene.add(pointB);

// Subtle grid
const gridHelper = new THREE.GridHelper(400, 40, 0x1a1a2e, 0x1a1a2e);
gridHelper.position.y = -80;
gridHelper.material.transparent = true;
gridHelper.material.opacity = 0.1; // lower opacity for integration
scene.add(gridHelper);

// ═══════════════════════════════════════════════════════════════════════════
// Clipping Plane
// ═══════════════════════════════════════════════════════════════════════════

const clipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
let clippingEnabled = false;
let clipAxis = 'x';
const CLIP_DEFAULT_PERCENT = 50;
const CLIP_MIN = -100;
const CLIP_MAX = 100;
const capLookAtTarget = new THREE.Vector3();
const stencilGroups = [];
const capMeshes = [];
let clipRenderOrderCursor = 1;

// Clip plane visual helper
const clipPlaneHelper = new THREE.PlaneHelper(clipPlane, 200, 0x6366f1);
clipPlaneHelper.visible = false;
scene.add(clipPlaneHelper);

const capGeometry = new THREE.PlaneGeometry(500, 500);
function createPlaneStencilGroup(geometry, plane, renderOrder) {
  const group = new THREE.Group();
  const baseMat = new THREE.MeshBasicMaterial({
    depthWrite: false,
    depthTest: false,
    colorWrite: false,
    stencilWrite: true,
    stencilFunc: THREE.AlwaysStencilFunc,
  });

  const backFaceMat = baseMat.clone();
  backFaceMat.side = THREE.BackSide;
  backFaceMat.clippingPlanes = [plane];
  backFaceMat.stencilFail = THREE.IncrementWrapStencilOp;
  backFaceMat.stencilZFail = THREE.IncrementWrapStencilOp;
  backFaceMat.stencilZPass = THREE.IncrementWrapStencilOp;
  const backFaceMesh = new THREE.Mesh(geometry, backFaceMat);
  backFaceMesh.renderOrder = renderOrder;
  group.add(backFaceMesh);

  const frontFaceMat = baseMat.clone();
  frontFaceMat.side = THREE.FrontSide;
  frontFaceMat.clippingPlanes = [plane];
  frontFaceMat.stencilFail = THREE.DecrementWrapStencilOp;
  frontFaceMat.stencilZFail = THREE.DecrementWrapStencilOp;
  frontFaceMat.stencilZPass = THREE.DecrementWrapStencilOp;
  const frontFaceMesh = new THREE.Mesh(geometry, frontFaceMat);
  frontFaceMesh.renderOrder = renderOrder;
  group.add(frontFaceMesh);

  return group;
}

function createClipCapMesh(color, renderOrder) {
  const capMaterial = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.72,
    metalness: 0.05,
    clearcoat: 0.1,
    side: THREE.DoubleSide,
    clippingPlanes: [],
    stencilWrite: true,
    stencilRef: 0,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilFail: THREE.ReplaceStencilOp,
    stencilZFail: THREE.ReplaceStencilOp,
    stencilZPass: THREE.ReplaceStencilOp,
  });

  const capMesh = new THREE.Mesh(capGeometry, capMaterial);
  capMesh.visible = false;
  capMesh.renderOrder = renderOrder;
  capMesh.onAfterRender = (rendererInstance) => {
    rendererInstance.clearStencil();
  };
  scene.add(capMesh);
  capMeshes.push(capMesh);
  return capMesh;
}

function updateClipCapTransform() {
  capMeshes.forEach((capMesh) => {
    clipPlane.coplanarPoint(capMesh.position);
    capLookAtTarget.copy(capMesh.position).sub(clipPlane.normal);
    capMesh.lookAt(capLookAtTarget);
  });
}

function updateClipAxis(axis) {
  clipAxis = axis;
  const normal = new THREE.Vector3(
    axis === 'x' ? -1 : 0,
    axis === 'y' ? -1 : 0,
    axis === 'z' ? -1 : 0,
  );
  clipPlane.normal.copy(normal);
  updateClipCapTransform();
}

function updateClipOffset(value) {
  clipPlane.constant = parseFloat(value);
  updateClipCapTransform();
}

function percentToClipOffset(percent) {
  return CLIP_MIN + ((CLIP_MAX - CLIP_MIN) * (percent / 100));
}

// ═══════════════════════════════════════════════════════════════════════════
// Region State
// ═══════════════════════════════════════════════════════════════════════════

const regionMeshes = [];      // { mesh, data, material, originalColor }
let hoveredRegion = null;
let selectedRegions = new Set();
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let regionsReady = false;
let pendingPresetAction = null;
let pulseTargetRegions = [];
const presetPulseColor = new THREE.Color(0xf59e0b);
const pulseTargetIndices = new Set();
let staticGlowTargets = [];
const staticGlowIndices = new Set();
const CANNABIS_AFFECTED_REGIONS = [
  'Thalamus',
  'Basal Ganglia',
  'Cerebellum',
  'Brain Stem',
  'Right parietal lobe',
  'Left parietal lobe',
  'Hippocampus',
];
const regionFunctionDescriptions = {
  'pituitary gland': 'Releases hormones that help control growth, stress response, reproduction, and other endocrine glands.',
  'right temporal lobe': 'Helps process sounds, language meaning, memory, and recognition of faces and objects.',
  'left temporal lobe': 'Supports language understanding, verbal memory, and processing of speech-related information.',
  'right parietal lobe': 'Integrates touch and spatial information, supporting attention and awareness of body position.',
  'left parietal lobe': 'Supports spatial reasoning, sensory integration, and aspects of reading, writing, and math.',
  midbrain: 'Relays visual and auditory signals and helps regulate alertness, eye movement, and motor responses.',
  'brain stem': 'Controls automatic life functions such as breathing, heart rate, blood pressure, and sleep-wake cycles.',
  'right occipital lobe': 'Processes visual input, including shape, color, and motion from what you see.',
  'left occipital lobe': 'Processes visual information and helps interpret visual patterns and symbols.',
  'right frontal lobe': 'Supports planning, impulse control, decision-making, and voluntary movement.',
  'left frontal lobe': 'Supports planning, speech production, working memory, and goal-directed behavior.',
  'corpus callosum': 'Connects the left and right hemispheres so they can share information quickly.',
  cerebellum: 'Coordinates balance, precision, posture, and fine-tuning of movement.',
  thalamus: 'Acts as a relay hub that routes sensory and motor signals to the cerebral cortex.',
  hippocampus: 'Critical for forming new memories and supporting learning and spatial navigation.',
  'basal ganglia': 'Helps initiate and regulate movement, habits, reward processing, and action selection.',
  'left medial temporal lobe': 'Supports memory formation and emotional processing, especially for verbal information.',
};
const presetImpactDescriptions = {
  doomscrolling: {
    title: 'Doomscrolling and the Brain',
    color: '#60a5fa',
    description: 'Constant negative-news exposure can keep stress circuits active, especially in the amygdala and salience network. Over time this may increase anxiety, reduce mental flexibility, and make it harder for prefrontal control systems to disengage from threat-focused attention.',
  },
  cannabis: {
    title: 'Cannabis and the Brain',
    color: '#34d399',
    description: 'Affected regions pulse using the same visual style as the Shopping preset. Region mappings use the closest available anatomical regions in this 3D model (for example, neocortex is represented with cortical lobes).',
  },
  gambling: {
    title: 'Gambling and the Brain',
    color: '#f97316',
    description: 'Gambling strongly engages reward prediction pathways (including dopamine signaling), which can reinforce risk-taking and near-miss behavior. Repetition can bias decision-making systems toward short-term reward and weaken top-down impulse control.',
  },
  shopping: {
    title: 'Shopping and the Brain',
    color: '#f59e0b',
    description: 'Reward and valuation circuits can become highly active during browsing and purchasing, especially with novelty, urgency cues, or social comparison. In high-arousal states, prefrontal regulation may be reduced, making impulsive spending more likely.',
  },
  exercise: {
    title: 'Exercise and the Brain',
    color: '#22c55e',
    description: 'Regular exercise supports blood flow, neuroplasticity, and stress regulation. It is linked to stronger executive function, better mood, and improved hippocampal health through mechanisms like increased BDNF and more efficient network connectivity.',
  },
};

// Preset overlay visuals (e.g., arrows between regions)
const presetOverlayGroup = new THREE.Group();
scene.add(presetOverlayGroup);

function disposeObject3D(object3D) {
  object3D.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((mat) => mat.dispose());
      } else {
        child.material.dispose();
      }
    }
  });
}

function clearPresetOverlays() {
  while (presetOverlayGroup.children.length > 0) {
    const child = presetOverlayGroup.children[0];
    disposeObject3D(child);
    presetOverlayGroup.remove(child);
  }
}

function clearPresetPulse() {
  pulseTargetRegions.forEach((regionMesh) => {
    if (!regionMesh?.material) return;
    regionMesh.material.emissive.setHex(0x000000);
    regionMesh.material.emissiveIntensity = 1;
  });
  pulseTargetRegions = [];
  pulseTargetIndices.clear();
}

function setPresetPulseTargets(regionNames) {
  clearPresetPulse();
  pulseTargetRegions = regionNames.map((name) => findRegionByName(name)).filter(Boolean);
  pulseTargetRegions.forEach((regionMesh) => {
    const idx = regionMeshes.indexOf(regionMesh);
    if (idx >= 0) pulseTargetIndices.add(idx);
  });
}

function updatePresetPulse() {
  if (pulseTargetRegions.length === 0) return;
  const t = performance.now() * 0.001;
  const wave = (Math.sin(t * 4.2) + 1) * 0.5;
  const intensity = 0.1 + (wave * 0.35);

  pulseTargetRegions.forEach((regionMesh) => {
    if (!regionMesh?.material) return;
    regionMesh.material.emissive.copy(presetPulseColor);
    regionMesh.material.emissiveIntensity = intensity;
  });
}

function clearStaticPresetGlow() {
  staticGlowTargets.forEach(({ regionMesh }) => {
    if (!regionMesh?.material) return;
    regionMesh.material.emissive.setHex(0x000000);
    regionMesh.material.emissiveIntensity = 1;
  });
  staticGlowTargets = [];
  staticGlowIndices.clear();
}

function setStaticPresetGlowTargets(targets) {
  clearStaticPresetGlow();
  const nextTargets = [];

  targets.forEach(({
    regionName,
    color,
    intensity,
    pulseAmplitude = 0.14,
    pulseSpeed = 3.2,
    pulsePhase = 0,
  }) => {
    const regionMesh = findRegionByName(regionName);
    if (!regionMesh) return;
    const colorObj = color instanceof THREE.Color ? color.clone() : new THREE.Color(color);
    nextTargets.push({
      regionMesh,
      color: colorObj,
      intensity,
      pulseAmplitude,
      pulseSpeed,
      pulsePhase,
    });

    const idx = regionMeshes.indexOf(regionMesh);
    if (idx >= 0) staticGlowIndices.add(idx);
  });

  staticGlowTargets = nextTargets;
}

function updateStaticPresetGlow() {
  const t = performance.now() * 0.001;
  staticGlowTargets.forEach(({
    regionMesh,
    color,
    intensity,
    pulseAmplitude,
    pulseSpeed,
    pulsePhase,
  }) => {
    if (!regionMesh?.material) return;
    const wave = (Math.sin((t * pulseSpeed) + pulsePhase) + 1) * 0.5;
    const pulsedIntensity = intensity + (wave * pulseAmplitude);
    regionMesh.material.emissive.copy(color);
    regionMesh.material.emissiveIntensity = pulsedIntensity;
  });
}

function isPresetHighlightedRegion(index) {
  return pulseTargetIndices.has(index) || staticGlowIndices.has(index);
}

function findRegionByName(name) {
  const target = name.toLowerCase();
  return regionMeshes.find((rm) => rm?.data?.name?.toLowerCase() === target) || null;
}

function getRegionFunctionDescription(regionName) {
  return regionFunctionDescriptions[regionName.toLowerCase()]
    || 'This region contributes to sensory processing, communication between networks, and coordinated brain function.';
}

function hideRegionPopup() {
  if (regionPopupEl) {
    regionPopupEl.style.display = 'none';
    regionPopupEl.classList.remove('preset-popup');
  }
}

function showRegionPopup(regionData, event) {
  if (!regionPopupEl || !popupTitleEl || !popupDescriptionEl || !popupColorDotEl) return;

  regionPopupEl.classList.remove('preset-popup');
  popupColorDotEl.style.background = regionData.color;
  popupTitleEl.textContent = regionData.name;
  popupDescriptionEl.textContent = getRegionFunctionDescription(regionData.name);
  regionPopupEl.style.display = 'block';
  positionPopupNearEvent(event);
}

function positionPopupNearEvent(event) {
  if (!regionPopupEl) return;

  const popupRect = regionPopupEl.getBoundingClientRect();
  const offsetX = 16;
  const offsetY = 16;
  const minMargin = 8;
  const maxLeft = window.innerWidth - popupRect.width - minMargin;
  const maxTop = window.innerHeight - popupRect.height - minMargin;

  const fallbackX = window.innerWidth * 0.5;
  const fallbackY = window.innerHeight * 0.5;
  const anchorX = event?.clientX ?? fallbackX;
  const anchorY = event?.clientY ?? fallbackY;
  const desiredLeft = anchorX + offsetX;
  const desiredTop = anchorY + offsetY;
  const left = Math.max(minMargin, Math.min(desiredLeft, maxLeft));
  const top = Math.max(minMargin, Math.min(desiredTop, maxTop));

  regionPopupEl.style.left = `${left}px`;
  regionPopupEl.style.top = `${top}px`;
}

function centerPopupOnScreen() {
  if (!regionPopupEl) return;
  regionPopupEl.style.left = '50%';
  regionPopupEl.style.top = '50%';
}

function showPresetPopup(presetName, event) {
  if (!regionPopupEl || !popupTitleEl || !popupDescriptionEl || !popupColorDotEl) return;
  const normalized = presetName.trim().toLowerCase();
  const details = presetImpactDescriptions[normalized];
  if (!details) {
    hideRegionPopup();
    return;
  }

  regionPopupEl.classList.add('preset-popup');
  popupColorDotEl.style.background = details.color;
  popupTitleEl.textContent = details.title;
  popupDescriptionEl.textContent = details.description;
  regionPopupEl.style.display = 'block';
  centerPopupOnScreen();
}

function getRegionCenterWorld(regionMesh) {
  const bounds = new THREE.Box3().setFromObject(regionMesh.object);
  return bounds.getCenter(new THREE.Vector3());
}

function createCurvedArrow(startPoint, endPoint, brainCenter, brainSize, color, lateralOffset) {
  const travelDir = endPoint.clone().sub(startPoint);
  const distance = travelDir.length();
  if (distance < 0.001) return;
  travelDir.normalize();

  const midPoint = startPoint.clone().add(endPoint).multiplyScalar(0.5);
  const outwardDir = midPoint.clone().sub(brainCenter);
  if (outwardDir.lengthSq() < 0.0001) {
    outwardDir.set(0, 1, 0);
  } else {
    outwardDir.normalize();
  }

  const sideDir = new THREE.Vector3().crossVectors(travelDir, outwardDir);
  if (sideDir.lengthSq() < 0.0001) {
    sideDir.set(0, 0, 1);
  } else {
    sideDir.normalize();
  }

  const lift = Math.max(10, brainSize.length() * 0.045);
  const startLifted = startPoint.clone().add(outwardDir.clone().multiplyScalar(lift * 0.72)).add(sideDir.clone().multiplyScalar(lateralOffset));
  const endLifted = endPoint.clone().add(outwardDir.clone().multiplyScalar(lift * 0.72)).add(sideDir.clone().multiplyScalar(lateralOffset));

  const controlA = startLifted.clone()
    .add(outwardDir.clone().multiplyScalar(lift * 0.58))
    .add(travelDir.clone().multiplyScalar(distance * 0.28));
  const controlB = endLifted.clone()
    .add(outwardDir.clone().multiplyScalar(lift * 0.58))
    .add(travelDir.clone().multiplyScalar(-distance * 0.22));

  const curve = new THREE.CatmullRomCurve3(
    [startLifted, controlA, controlB, endLifted],
    false,
    'catmullrom',
    0.5
  );

  const tubeGeometry = new THREE.TubeGeometry(curve, 64, 0.9, 10, false);
  const tubeMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.96,
    depthTest: false,
    depthWrite: false,
  });
  const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
  tube.renderOrder = 9999;
  presetOverlayGroup.add(tube);

  const coneHeight = Math.max(5, distance * 0.12);
  const coneRadius = Math.max(1.8, coneHeight * 0.34);
  const coneGeometry = new THREE.ConeGeometry(coneRadius, coneHeight, 20);
  const coneMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.98,
    depthTest: false,
    depthWrite: false,
  });
  const cone = new THREE.Mesh(coneGeometry, coneMaterial);
  const tipPoint = curve.getPoint(0.995);
  const tangent = curve.getTangent(0.995).normalize();
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
  cone.position.copy(tipPoint).add(tangent.clone().multiplyScalar(-coneHeight * 0.42));
  cone.renderOrder = 10000;
  presetOverlayGroup.add(cone);
}

function drawArrowBetweenRegions(startRegionName, endRegionName) {
  clearPresetOverlays();

  const startRegion = findRegionByName(startRegionName);
  const endRegion = findRegionByName(endRegionName);
  if (!startRegion || !endRegion) {
    console.warn('Unable to draw arrow: missing region(s)', {
      startRegionName,
      endRegionName,
    });
    return;
  }

  const startPoint = getRegionCenterWorld(startRegion);
  const endPoint = getRegionCenterWorld(endRegion);
  const brainBounds = new THREE.Box3().setFromObject(brainGroup);
  const brainCenter = brainBounds.getCenter(new THREE.Vector3());
  const brainSize = brainBounds.getSize(new THREE.Vector3());

  // Draw a pair of curved arrows hugging the outer brain contour.
  createCurvedArrow(startPoint, endPoint, brainCenter, brainSize, 0xf59e0b, -2.2);
  createCurvedArrow(startPoint, endPoint, brainCenter, brainSize, 0xfbbf24, 2.2);
}

function triggerPresetAction(presetName, event) {
  const normalized = presetName.trim().toLowerCase();
  showPresetPopup(normalized, event);
  clearPresetOverlays();
  clearPresetPulse();
  clearStaticPresetGlow();

  if (!regionsReady) {
    pendingPresetAction = normalized;
    return;
  }

  if (normalized === 'shopping') {
    setPresetPulseTargets(['Right parietal lobe', 'Right frontal lobe']);
    drawArrowBetweenRegions('Right parietal lobe', 'Right frontal lobe');
    return;
  }

  if (normalized === 'cannabis') {
    setPresetPulseTargets(CANNABIS_AFFECTED_REGIONS);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Load Regions
// ═══════════════════════════════════════════════════════════════════════════

if (loadStatus) loadStatus.textContent = 'Fetching region data…';

async function loadRegions() {
  // 1. Fetch metadata
  const res = await fetch('/models/regions.json');
  if (!res.ok) throw new Error(`Failed to load regions.json: ${res.status}`);
  const meta = await res.json();

  const regions = meta.regions;
  const total = regions.length;
  let loaded = 0;
  let totalVerts = 0;
  let totalFaces = 0;

  if (loadStatus) loadStatus.textContent = `Loading 0/${total} regions…`;

  // 2. Load each region OBJ
  const loader = new OBJLoader();

  const loadPromises = regions.map((region, regionIndex) => {
    return new Promise((resolve, reject) => {
      loader.load(
        `/models/${region.file}`,
        (obj) => {
          const color = new THREE.Color(region.color);

          const material = new THREE.MeshPhysicalMaterial({
            color: color,
            roughness: 0.55,
            metalness: 0.05,
            clearcoat: 0.15,
            clearcoatRoughness: 0.4,
            side: THREE.DoubleSide,
            flatShading: false,
            transparent: true,
            opacity: 1.0,
            depthWrite: true,
            depthTest: true,
            clippingPlanes: [clipPlane],
            clipShadows: true,
          });

          // Disable clipping initially
          material.clippingPlanes = clippingEnabled ? [clipPlane] : [];

          const meshChildren = [];
          obj.traverse((child) => {
            if (child.isMesh) meshChildren.push(child);
          });
          brainGroup.add(obj);

          meshChildren.forEach((child) => {
            child.material = material;
            child.geometry.computeVertexNormals();
            child.userData.interactiveRegionMesh = true;
            child.userData.regionIndex = regionIndex;

            const stencilRenderOrder = clipRenderOrderCursor;
            const capRenderOrder = clipRenderOrderCursor + 0.5;
            const meshRenderOrder = clipRenderOrderCursor + 1;
            clipRenderOrderCursor += 2;

            child.renderOrder = meshRenderOrder;

            const stencilGroup = createPlaneStencilGroup(child.geometry, clipPlane, stencilRenderOrder);
            stencilGroup.position.copy(child.position);
            stencilGroup.quaternion.copy(child.quaternion);
            stencilGroup.scale.copy(child.scale);
            stencilGroup.visible = clippingEnabled;
            obj.add(stencilGroup);
            stencilGroups.push(stencilGroup);

            const capMesh = createClipCapMesh(color, capRenderOrder);
            capMesh.visible = clippingEnabled;
            capMesh.userData.regionColor = color.clone();
            capMesh.userData.parentObject = obj;

            const geo = child.geometry;
            if (geo.attributes.position) totalVerts += geo.attributes.position.count;
            if (geo.index) totalFaces += geo.index.count / 3;
          });

          regionMeshes[regionIndex] = {
            object: obj,
            data: region,
            material: material,
            originalColor: color.clone(),
            capMeshes: capMeshes.filter((capMesh) => capMesh.userData.parentObject === obj),
          };

          loaded++;
          if (loadStatus) loadStatus.textContent = `Loading ${loaded}/${total} regions…`;
          resolve();
        },
        undefined,
        (err) => {
          console.warn(`Failed to load ${region.file}:`, err);
          loaded++;
          if (loadStatus) loadStatus.textContent = `Loading ${loaded}/${total} regions…`;
          resolve(); // Don't reject — skip failed regions
        }
      );
    });
  });

  await Promise.all(loadPromises);

  // 3. Update stats
  if (statsEl) {
    statsEl.innerHTML = `${totalVerts.toLocaleString()} vertices<br>${totalFaces.toLocaleString()} faces<br>${total} regions`;
  }

  // 4. Build region list in sidebar
  buildRegionList(regions);

  regionsReady = true;
  if (pendingPresetAction) {
    const action = pendingPresetAction;
    pendingPresetAction = null;
    triggerPresetAction(action);
  }

  // 5. Hide loading
  if (loadingEl) {
    loadingEl.classList.add('hidden');
    setTimeout(() => { loadingEl.style.display = 'none'; }, 700);
  }

  console.log(`Brain loaded: ${total} regions, ${totalVerts.toLocaleString()} vertices`);
}

loadRegions().catch((err) => {
  console.error('Error loading brain regions:', err);
  if (loadStatus) {
    loadStatus.textContent = 'Error loading regions — see console';
    loadStatus.style.color = '#f87171';
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Region List Sidebar
// ═══════════════════════════════════════════════════════════════════════════

function buildRegionList(regions) {
  if (!regionListEl) return;
  regionListEl.innerHTML = '';

  // "Show All" button
  const showAll = document.createElement('div');
  showAll.className = 'region-item';
  showAll.innerHTML = `
    <div class="region-color" style="background: linear-gradient(135deg, #818cf8, #6366f1);"></div>
    <div class="region-name" style="font-weight: 600; color: #818cf8;">Show All</div>
  `;
  showAll.addEventListener('click', () => {
    selectedRegions.clear();
    updateRegionHighlight();
  });
  regionListEl.appendChild(showAll);

  // Individual regions
  regions.forEach((region, idx) => {
    const item = document.createElement('div');
    item.className = 'region-item';
    item.dataset.regionIndex = idx;
    item.innerHTML = `
      <div class="region-color" style="background: ${region.color};"></div>
      <div class="region-name">${region.name+" "+region.id}</div>
    `;
    item.addEventListener('click', () => {
      if (selectedRegions.has(idx)) {
        selectedRegions.delete(idx);
      } else {
        selectedRegions.add(idx);
      }
      updateRegionHighlight();
    });
    regionListEl.appendChild(item);
  });
}

function updateRegionHighlight() {
  const hasSelection = selectedRegions.size > 0;

  regionMeshes.forEach((rm, idx) => {
    if (!rm) return;
    if (!hasSelection || selectedRegions.has(idx)) {
      rm.material.opacity = 1.0;
      rm.material.color.copy(rm.originalColor);
      rm.object.visible = true;
    } else {
      rm.material.opacity = 0.15;
      rm.material.color.setHex(0x333333);
      rm.object.visible = true;
    }

    if (rm.capMeshes) {
      rm.capMeshes.forEach((capMesh) => {
        capMesh.material.color.copy(rm.material.color);
      });
    }
  });

  if (!regionListEl) return;
  const items = regionListEl.querySelectorAll('.region-item');
  items.forEach((item, i) => {
    if (i === 0) {
      item.classList.toggle('active', !hasSelection);
      return;
    }
    const dataIdx = i - 1;
    if (hasSelection) {
      if (selectedRegions.has(dataIdx)) {
        item.classList.add('active');
        item.classList.remove('dimmed');
      } else {
        item.classList.remove('active');
        item.classList.add('dimmed');
      }
    } else {
      item.classList.remove('active', 'dimmed');
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Raycasting (Hover + Click)
// ═══════════════════════════════════════════════════════════════════════════

function getRegionHitIndex(event) {
  const rect = renderer.domElement.getBoundingClientRect();

  // Calculate mouse position relative to the canvas
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // Collect all meshes
  const meshes = [];
  regionMeshes.forEach((rm) => {
    if (!rm?.object) return;
    rm.object.traverse((child) => {
      if (child.isMesh && child.userData?.interactiveRegionMesh) meshes.push(child);
    });
  });

  const intersects = raycaster.intersectObjects(meshes, false);
  if (intersects.length === 0) return null;
  const hitMesh = intersects[0].object;
  const directIdx = hitMesh.userData.regionIndex;
  if (Number.isInteger(directIdx)) return directIdx;

  // Fallback in case the region index was not attached.
  for (let i = 0; i < regionMeshes.length; i++) {
    const candidate = regionMeshes[i];
    if (!candidate?.object) continue;
    let found = false;
    candidate.object.traverse((child) => {
      if (child === hitMesh) found = true;
    });
    if (found) return i;
  }

  return null;
}

function onMouseMove(event) {
  const hitIdx = getRegionHitIndex(event);

  if (hitIdx !== null) {
    if (hitIdx !== hoveredRegion) {
      // Un-hover previous
      if (hoveredRegion !== null && !selectedRegions.has(hoveredRegion) && !isPresetHighlightedRegion(hoveredRegion)) {
        const prev = regionMeshes[hoveredRegion];
        if (prev) {
          prev.material.emissive.setHex(0x000000);
        }
      }

      // Hover new
      hoveredRegion = hitIdx;
      const rm = regionMeshes[hitIdx];
      if (!isPresetHighlightedRegion(hitIdx)) {
        rm.material.emissive.set(0x222244);
      }

      // Show tooltip
      if (tooltipEl) {
        const region = rm.data;
        tooltipEl.querySelector('.color-dot').style.background = region.color;
        tooltipEl.querySelector('.tooltip-text').textContent = region.name;
        tooltipEl.style.display = 'block';
      }
    }

    // Position tooltip near cursor
    if (tooltipEl) {
      tooltipEl.style.left = (event.clientX + 16) + 'px';
      tooltipEl.style.top = (event.clientY - 10) + 'px';
    }
  } else {
    // No hit
    if (hoveredRegion !== null) {
      const prev = regionMeshes[hoveredRegion];
      if (prev && !isPresetHighlightedRegion(hoveredRegion)) prev.material.emissive.set(0x000000);
      hoveredRegion = null;
    }
    if (tooltipEl) tooltipEl.style.display = 'none';
  }
}

function onCanvasClick(event) {
  const hitIdx = getRegionHitIndex(event);
  if (hitIdx === null) {
    hideRegionPopup();
    return;
  }

  const region = regionMeshes[hitIdx]?.data;
  if (!region) return;
  showRegionPopup(region, event);
}

renderer.domElement.addEventListener('mousemove', onMouseMove);
renderer.domElement.addEventListener('click', onCanvasClick);

if (popupCloseBtn) {
  popupCloseBtn.addEventListener('click', hideRegionPopup);
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') hideRegionPopup();
});

// ═══════════════════════════════════════════════════════════════════════════
// Cross-Section Controls
// ═══════════════════════════════════════════════════════════════════════════

const clipToggle = document.getElementById('clip-toggle');
const axisBtns = document.querySelectorAll('.axis-btn');

if (clipToggle) {
  clipToggle.addEventListener('change', (e) => {
    clippingEnabled = e.target.checked;

    // Reset clipping plane to midpoint whenever clipping is enabled.
    if (clippingEnabled) {
      updateClipOffset(percentToClipOffset(CLIP_DEFAULT_PERCENT));
    }

    clipPlaneHelper.visible = clippingEnabled;
    capMeshes.forEach((capMesh) => { capMesh.visible = clippingEnabled; });
    stencilGroups.forEach((group) => { group.visible = clippingEnabled; });

    regionMeshes.forEach((rm) => {
      rm.material.clippingPlanes = clippingEnabled ? [clipPlane] : [];
    });
  });
}

axisBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    axisBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    updateClipAxis(btn.dataset.axis);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Sidebar Toggle
// ═══════════════════════════════════════════════════════════════════════════

const sidebar = document.getElementById('sidebar');
const sidebarClose = document.getElementById('sidebar-close');
const sidebarOpen = document.getElementById('sidebar-open-btn');
const presetButtons = document.querySelectorAll('.option-btn');
const presetList = document.querySelector('.option-list');

if (sidebarClose && sidebar && sidebarOpen) {
  sidebarClose.addEventListener('click', () => {
    sidebar.classList.add('collapsed');
    sidebarOpen.classList.add('visible');
  });

  sidebarOpen.addEventListener('click', () => {
    sidebar.classList.remove('collapsed');
    sidebarOpen.classList.remove('visible');
  });
}

presetButtons.forEach((button) => {
  button.addEventListener('click', (event) => {
    triggerPresetAction(button.textContent || '', event);
  });
});

if (presetList) {
  presetList.addEventListener('click', (event) => {
    const targetButton = event.target.closest('.option-btn');
    if (!targetButton) return;
    triggerPresetAction(targetButton.textContent || '', event);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Animation Loop
// ═══════════════════════════════════════════════════════════════════════════

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  updateStaticPresetGlow();
  updatePresetPulse();
  if (clippingEnabled) updateClipCapTransform();
  renderer.render(scene, camera);
}
animate();

// ─── Resize ─────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  const newWidth = container.clientWidth || 800;
  const newHeight = container.clientHeight || 600;
  camera.aspect = newWidth / newHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(newWidth, newHeight);
});
