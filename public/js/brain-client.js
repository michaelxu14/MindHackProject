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
const regionListEl = document.getElementById('region-list');

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

// Clip plane visual helper
const clipPlaneHelper = new THREE.PlaneHelper(clipPlane, 200, 0x6366f1);
clipPlaneHelper.visible = false;
scene.add(clipPlaneHelper);

function updateClipAxis(axis) {
  clipAxis = axis;
  const normal = new THREE.Vector3(
    axis === 'x' ? -1 : 0,
    axis === 'y' ? -1 : 0,
    axis === 'z' ? -1 : 0,
  );
  clipPlane.normal.copy(normal);
}

function updateClipOffset(value) {
  clipPlane.constant = parseFloat(value);
}

// ═══════════════════════════════════════════════════════════════════════════
// Region State
// ═══════════════════════════════════════════════════════════════════════════

const regionMeshes = [];      // { mesh, data, material, originalColor }
let hoveredRegion = null;
let selectedRegions = new Set();
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

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

  const loadPromises = regions.map((region) => {
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
            clippingPlanes: [clipPlane],
            clipShadows: true,
          });

          // Disable clipping initially
          material.clippingPlanes = clippingEnabled ? [clipPlane] : [];

          obj.traverse((child) => {
            if (child.isMesh) {
              child.material = material;
              child.geometry.computeVertexNormals();

              const geo = child.geometry;
              if (geo.attributes.position) totalVerts += geo.attributes.position.count;
              if (geo.index) totalFaces += geo.index.count / 3;
            }
          });

          brainGroup.add(obj);

          regionMeshes.push({
            object: obj,
            data: region,
            material: material,
            originalColor: color.clone(),
          });

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
      <div class="region-name">${region.name}</div>
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
    if (!hasSelection || selectedRegions.has(idx)) {
      rm.material.opacity = 1.0;
      rm.material.color.copy(rm.originalColor);
      rm.object.visible = true;
    } else {
      rm.material.opacity = 0.15;
      rm.material.color.setHex(0x333333);
      rm.object.visible = true;
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

function onMouseMove(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  
  // Calculate mouse position relative to the canvas
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // Collect all meshes
  const meshes = [];
  regionMeshes.forEach((rm) => {
    rm.object.traverse((child) => {
      if (child.isMesh) meshes.push(child);
    });
  });

  const intersects = raycaster.intersectObjects(meshes, false);

  if (intersects.length > 0) {
    const hitMesh = intersects[0].object;

    // Find which region this belongs to
    let hitIdx = -1;
    for (let i = 0; i < regionMeshes.length; i++) {
      let found = false;
      regionMeshes[i].object.traverse((child) => {
        if (child === hitMesh) found = true;
      });
      if (found) { hitIdx = i; break; }
    }

    if (hitIdx >= 0 && hitIdx !== hoveredRegion) {
      // Un-hover previous
      if (hoveredRegion !== null && !selectedRegions.has(hoveredRegion)) {
        const prev = regionMeshes[hoveredRegion];
        if (prev) {
          prev.material.emissive.setHex(0x000000);
        }
      }

      // Hover new
      hoveredRegion = hitIdx;
      const rm = regionMeshes[hitIdx];
      rm.material.emissive.set(0x222244);

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
      if (prev) prev.material.emissive.set(0x000000);
      hoveredRegion = null;
    }
    if (tooltipEl) tooltipEl.style.display = 'none';
  }
}

renderer.domElement.addEventListener('mousemove', onMouseMove);

// ═══════════════════════════════════════════════════════════════════════════
// Cross-Section Controls
// ═══════════════════════════════════════════════════════════════════════════

const clipToggle = document.getElementById('clip-toggle');
const clipSlider = document.getElementById('clip-slider');
const clipSliderRow = document.getElementById('clip-slider-row');
const axisBtns = document.querySelectorAll('.axis-btn');

if (clipToggle) {
  clipToggle.addEventListener('change', (e) => {
    clippingEnabled = e.target.checked;
    if (clipSliderRow) {
      clipSliderRow.style.opacity = clippingEnabled ? '1' : '0.3';
      clipSliderRow.style.pointerEvents = clippingEnabled ? 'auto' : 'none';
    }
    clipPlaneHelper.visible = clippingEnabled;

    regionMeshes.forEach((rm) => {
      rm.material.clippingPlanes = clippingEnabled ? [clipPlane] : [];
    });
  });
}

if (clipSlider) {
  clipSlider.addEventListener('input', (e) => {
    updateClipOffset(e.target.value);
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

// ═══════════════════════════════════════════════════════════════════════════
// Animation Loop
// ═══════════════════════════════════════════════════════════════════════════

function animate() {
  requestAnimationFrame(animate);
  controls.update();
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
