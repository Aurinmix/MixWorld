import * as THREE from 'three';
import { createBarkTexture, createRockTexture, createTerrainTextures } from './textures.js';

export const RACE_START_Z = 14;
export const OBELISK_Z = -305;

export function getValleyCenterX(z) {
  // Curva orgánica tipo cañón selvático que acaba centrada en el Obelisco
  const fadeEnd = THREE.MathUtils.smoothstep(z, -315, -240);
  const fadeStart = THREE.MathUtils.smoothstep(z, 25, -20);
  const curve = Math.sin(z * 0.024) * 9.5 + Math.cos(z * 0.012) * 4.5;
  return curve * fadeEnd * fadeStart;
}

export function getTerrainHeight(x, z) {
  const cx = getValleyCenterX(z);
  const dx = Math.abs(x - cx);

  // Ondulación natural del suelo
  let h =
    Math.sin(x * 0.08 + z * 0.05) * 0.55 +
    Math.cos(x * 0.16 - z * 0.09) * 0.28;

  // Depresión suave del río (z entre -112 y -138)
  const riverDist = Math.abs(z - (-125));
  if (riverDist < 16) {
    const t = 1 - riverDist / 16;
    h -= Math.sin(t * Math.PI * 0.5) * 1.45;
  }

  // Subida épica hacia la plataforma del Obelisco (z < -265)
  if (z < -260) {
    const climb = THREE.MathUtils.smoothstep(-z, 260, 305);
    h += climb * 4.2;
  }

  // Paredes del cañón a los lados
  const wallStart = 17.5;
  if (dx > wallStart) {
    const w = dx - wallStart;
    h += Math.pow(w, 1.38) * 0.65 + Math.sin(z * 0.15 + x * 0.2) * 1.1;
  }

  // Aplanar ligeramente justo en la plataforma del Obelisco
  const obDist = Math.hypot(x - getValleyCenterX(OBELISK_Z), z - OBELISK_Z);
  if (obDist < 13) {
    const flat = 1 - THREE.MathUtils.smoothstep(obDist, 5, 13);
    h = THREE.MathUtils.lerp(h, 4.1, flat);
  }

  return h;
}

export function buildSurvivalWorld(scene) {
  const terrainTex = createTerrainTextures();
  const rockTex = createRockTexture();
  const barkTex = createBarkTexture();

  // Atmósfera & Niebla realista
  scene.background = new THREE.Color(0x0b1615);
  scene.fog = new THREE.FogExp2(0x11221f, 0.0092);

  // Cúpula del cielo con gradiente atardecer selvático + toque Tek
  const skyGeo = new THREE.SphereGeometry(520, 32, 20);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x071217) },
      midColor: { value: new THREE.Color(0x183834) },
      horizonColor: { value: new THREE.Color(0xd9924c) }
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 horizonColor;
      varying vec3 vWorldPos;
      void main() {
        float h = normalize(vWorldPos).y;
        vec3 col = mix(horizonColor, midColor, smoothstep(-0.04, 0.24, h));
        col = mix(col, topColor, smoothstep(0.24, 0.78, h));
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // Luces cinematográficas (iluminación equilibrada para distinguir relieves y escamas)
  const hemiLight = new THREE.HemisphereLight(0x9cebd8, 0x3b3528, 1.25);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xffdca8, 3.15);
  sunLight.position.set(42, 86, -45);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 260;
  const shadowSpan = 65;
  sunLight.shadow.camera.left = -shadowSpan;
  sunLight.shadow.camera.right = shadowSpan;
  sunLight.shadow.camera.top = shadowSpan;
  sunLight.shadow.camera.bottom = -shadowSpan;
  sunLight.shadow.bias = -0.0005;
  scene.add(sunLight);
  scene.add(sunLight.target);

  // Luz de relleno fría para resaltar escamas y relieves
  const rimLight = new THREE.DirectionalLight(0x00e6a8, 0.78);
  rimLight.position.set(-45, 36, 35);
  scene.add(rimLight);

  // Terreno del cañón
  const width = 120;
  const length = 410;
  const segW = 96;
  const segL = 220;
  const terrainGeo = new THREE.PlaneGeometry(width, length, segW, segL);
  terrainGeo.rotateX(-Math.PI / 2);

  // Desplazar para cubrir z desde +55 hasta -355
  const zCenter = -150;
  terrainGeo.translate(0, 0, zCenter);

  const pos = terrainGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cFloor = new THREE.Color(0x45583a);
  const cPath = new THREE.Color(0x635542);
  const cCliff = new THREE.Color(0x4a4f4b);
  const cRiver = new THREE.Color(0x2d3f39);

  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vz = pos.getZ(i);
    const vy = getTerrainHeight(vx, vz);
    pos.setY(i, vy);

    const distFromCenter = Math.abs(vx - getValleyCenterX(vz));
    const col = cFloor.clone();
    if (distFromCenter < 7.5) {
      col.lerp(cPath, 1 - distFromCenter / 7.5);
    } else if (distFromCenter > 17) {
      col.lerp(cCliff, Math.min(1, (distFromCenter - 17) / 14));
    }
    if (Math.abs(vz + 125) < 14) {
      col.lerp(cRiver, 0.6);
    }
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    map: terrainTex.map,
    bumpMap: terrainTex.bump,
    bumpScale: 0.4,
    vertexColors: true,
    roughness: 0.86,
    metalness: 0.04
  });
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  scene.add(terrainMesh);

  // Agua del río en z = -125
  const waterGeo = new THREE.PlaneGeometry(58, 26, 24, 12);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x136662,
    emissive: 0x052e2b,
    roughness: 0.12,
    metalness: 0.78,
    transparent: true,
    opacity: 0.86
  });
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.set(getValleyCenterX(-125), -0.65, -125);
  waterMesh.receiveShadow = true;
  scene.add(waterMesh);

  // Obstáculos físicos dentro del valle + vegetación instanciada
  const obstacles = [];
  const rockMat = new THREE.MeshStandardMaterial({
    map: rockTex,
    roughness: 0.84,
    metalness: 0.08,
    color: 0x767a73
  });

  // Rocas navegables dentro del valle
  const rockGeo = new THREE.DodecahedronGeometry(1, 1);
  for (let i = 0; i < 42; i++) {
    const z = -10 - Math.random() * 265;
    const cx = getValleyCenterX(z);
    const side = Math.random() > 0.5 ? 1 : -1;
    const offset = (2.8 + Math.random() * 11.5) * side;
    const x = cx + offset;
    const r = 1.05 + Math.random() * 1.45;
    const y = getTerrainHeight(x, z);

    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.position.set(x, y + r * 0.45, z);
    rock.scale.set(r * 1.15, r * 0.82, r);
    rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);

    obstacles.push({ x, z, radius: r * 1.15 });
  }

  // Árboles selváticos con copas orgánicas multicapa (sin aspecto de cono simple)
  const treeCount = 240;
  const trunkGeo = new THREE.CylinderGeometry(0.26, 0.55, 8.8, 7);
  trunkGeo.translate(0, 4.4, 0);
  const trunkMat = new THREE.MeshStandardMaterial({
    map: barkTex,
    roughness: 0.9,
    color: 0x614a39
  });
  const trunksInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  trunksInst.castShadow = true;
  trunksInst.receiveShadow = true;

  const crownMainGeo = new THREE.IcosahedronGeometry(3.1, 1);
  crownMainGeo.scale(1.15, 0.72, 1.15);
  crownMainGeo.translate(0, 8.9, 0);

  const crownTopGeo = new THREE.IcosahedronGeometry(2.2, 1);
  crownTopGeo.scale(1.1, 0.7, 1.1);
  crownTopGeo.translate(0.6, 10.6, -0.4);

  const crownMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.84,
    metalness: 0.03
  });
  const crownsMainInst = new THREE.InstancedMesh(crownMainGeo, crownMat, treeCount);
  const crownsTopInst = new THREE.InstancedMesh(crownTopGeo, crownMat, treeCount);
  crownsMainInst.castShadow = true;
  crownsMainInst.receiveShadow = true;
  crownsTopInst.castShadow = true;

  const dummy = new THREE.Object3D();
  const cTint = new THREE.Color();
  for (let i = 0; i < treeCount; i++) {
    const z = 35 - Math.random() * 370;
    const cx = getValleyCenterX(z);
    const side = Math.random() > 0.5 ? 1 : -1;
    const dist = (i % 5 === 0 ? 12.2 : 15.8) + Math.random() * 24;
    const x = cx + side * dist;
    const y = getTerrainHeight(x, z);
    const s = 0.85 + Math.random() * 0.95;

    dummy.position.set(x, y - 0.3, z);
    dummy.rotation.set((Math.random() - 0.5) * 0.08, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.08);
    dummy.scale.set(s, s * (0.9 + Math.random() * 0.45), s);
    dummy.updateMatrix();
    trunksInst.setMatrixAt(i, dummy.matrix);
    crownsMainInst.setMatrixAt(i, dummy.matrix);
    crownsTopInst.setMatrixAt(i, dummy.matrix);

    cTint.setHSL(0.35 + (Math.random() - 0.5) * 0.05, 0.42, 0.22 + Math.random() * 0.09);
    crownsMainInst.setColorAt(i, cTint);
    crownsTopInst.setColorAt(i, cTint.clone().offsetHSL(0, 0, 0.04));

    if (dist < 16) {
      obstacles.push({ x, z, radius: 0.85 * s });
    }
  }
  scene.add(trunksInst, crownsMainInst, crownsTopInst);

  // Helechos / matas de hierba selvática en los bordes (3 hojas cruzadas hacia arriba)
  const fernCount = 260;
  const fernGeo = new THREE.ConeGeometry(0.45, 1.35, 4);
  fernGeo.translate(0, 0.65, 0);
  const fernMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.85
  });
  const fernsInst = new THREE.InstancedMesh(fernGeo, fernMat, fernCount * 3);
  fernsInst.receiveShadow = true;
  fernsInst.castShadow = true;
  const fColor = new THREE.Color();
  for (let i = 0; i < fernCount; i++) {
    const z = 25 - Math.random() * 340;
    const cx = getValleyCenterX(z);
    const side = Math.random() > 0.5 ? 1 : -1;
    const x = cx + side * (5.5 + Math.random() * 11.5);
    const y = getTerrainHeight(x, z);
    const s = 0.65 + Math.random() * 0.75;
    const baseYaw = Math.random() * Math.PI * 2;
    fColor.setHSL(0.34 + (Math.random() - 0.5) * 0.05, 0.48, 0.22 + Math.random() * 0.1);

    for (let b = 0; b < 3; b++) {
      const idx = i * 3 + b;
      dummy.position.set(x, y - 0.08, z);
      dummy.rotation.set(0.38, baseYaw + (b * Math.PI * 2) / 3, 0.25);
      dummy.scale.set(s, s * 0.85, s * 0.45);
      dummy.updateMatrix();
      fernsInst.setMatrixAt(idx, dummy.matrix);
      fernsInst.setColorAt(idx, fColor);
    }
  }
  scene.add(fernsInst);

  // Balizas Tek en el punto de salida y bordeando el tramo final
  const pillarGeo = new THREE.BoxGeometry(0.65, 5.2, 0.65);
  const pillarMat = new THREE.MeshStandardMaterial({
    color: 0x121918,
    metalness: 0.78,
    roughness: 0.28
  });
  const stripGeo = new THREE.BoxGeometry(0.72, 4.4, 0.16);
  const tekGlowMat = new THREE.MeshStandardMaterial({
    color: 0x00e6a8,
    emissive: 0x00e6a8,
    emissiveIntensity: 2.2,
    roughness: 0.2
  });
  const goldGlowMat = new THREE.MeshStandardMaterial({
    color: 0xe7c85a,
    emissive: 0xe7c85a,
    emissiveIntensity: 2.0,
    roughness: 0.2
  });

  // Pilares de salida
  const startCX = getValleyCenterX(RACE_START_Z);
  [-11, 11].forEach((offsetX) => {
    const px = startCX + offsetX;
    const py = getTerrainHeight(px, RACE_START_Z);
    const p = new THREE.Mesh(pillarGeo, pillarMat);
    p.position.set(px, py + 2.5, RACE_START_Z);
    p.castShadow = true;
    const s = new THREE.Mesh(stripGeo, tekGlowMat);
    p.add(s);
    scene.add(p);
  });

  // Pilares Tek hacia el Obelisco
  for (let z = -250; z >= -295; z -= 15) {
    const cx = getValleyCenterX(z);
    [-10.5, 10.5].forEach((ox) => {
      const px = cx + ox;
      const py = getTerrainHeight(px, z);
      const p = new THREE.Mesh(pillarGeo, pillarMat);
      p.position.set(px, py + 2.4, z);
      p.castShadow = true;
      p.add(new THREE.Mesh(stripGeo, tekGlowMat));
      scene.add(p);
    });
  }

  // OBELISCO TEK MIXWORLDS (Meta)
  const obX = getValleyCenterX(OBELISK_Z);
  const obY = getTerrainHeight(obX, OBELISK_Z);
  const obeliskGroup = new THREE.Group();
  obeliskGroup.position.set(obX, obY, OBELISK_Z);
  scene.add(obeliskGroup);

  // Plataforma hexagonal de extracción
  const padGeo = new THREE.CylinderGeometry(11.5, 13, 0.8, 6);
  const padMesh = new THREE.Mesh(padGeo, pillarMat);
  padMesh.position.y = 0.2;
  padMesh.receiveShadow = true;
  obeliskGroup.add(padMesh);

  const padRingGeo = new THREE.TorusGeometry(9.6, 0.24, 8, 6);
  padRingGeo.rotateX(Math.PI / 2);
  const padRing = new THREE.Mesh(padRingGeo, tekGlowMat);
  padRing.position.y = 0.65;
  obeliskGroup.add(padRing);

  // Estructura flotante del Obelisco
  const spireGroup = new THREE.Group();
  spireGroup.position.y = 14;
  obeliskGroup.add(spireGroup);

  const spireGeo = new THREE.ConeGeometry(3.2, 22, 4);
  const spireMesh = new THREE.Mesh(spireGeo, pillarMat);
  spireMesh.position.y = 6;
  spireMesh.castShadow = true;
  spireGroup.add(spireMesh);

  const lowerConeGeo = new THREE.ConeGeometry(3.2, 7.5, 4);
  lowerConeGeo.rotateX(Math.PI);
  const lowerCone = new THREE.Mesh(lowerConeGeo, pillarMat);
  lowerCone.position.y = -8.5;
  spireGroup.add(lowerCone);

  const coreGeo = new THREE.OctahedronGeometry(2.1, 0);
  const coreMesh = new THREE.Mesh(coreGeo, tekGlowMat);
  coreMesh.position.y = -1.5;
  spireGroup.add(coreMesh);

  // Anillos giroscópicos dorados
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.18, 10, 48), goldGlowMat);
  ring1.position.y = -1.5;
  spireGroup.add(ring1);

  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(7.2, 0.14, 10, 48), tekGlowMat);
  ring2.position.y = -1.5;
  spireGroup.add(ring2);

  // Haz de luz hacia el cielo
  const beamGeo = new THREE.CylinderGeometry(2.4, 4.6, 150, 20, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x00e6a8,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const beamMesh = new THREE.Mesh(beamGeo, beamMat);
  beamMesh.position.y = 75;
  obeliskGroup.add(beamMesh);

  const obLight = new THREE.PointLight(0x00e6a8, 45, 75, 1.5);
  obLight.position.set(0, 8, 0);
  obeliskGroup.add(obLight);

  // Partículas / Esporas flotantes de supervivencia
  const sporeCount = 650;
  const sporePos = new Float32Array(sporeCount * 3);
  const sporeColors = new Float32Array(sporeCount * 3);
  const cEm = new THREE.Color(0x00e6a8);
  const cGo = new THREE.Color(0xe7c85a);

  for (let i = 0; i < sporeCount; i++) {
    const z = 25 - Math.random() * 345;
    const x = getValleyCenterX(z) + (Math.random() - 0.5) * 40;
    const y = getTerrainHeight(x, z) + 0.6 + Math.random() * 12;
    sporePos[i * 3] = x;
    sporePos[i * 3 + 1] = y;
    sporePos[i * 3 + 2] = z;

    const c = Math.random() > 0.3 ? cEm : cGo;
    sporeColors[i * 3] = c.r;
    sporeColors[i * 3 + 1] = c.g;
    sporeColors[i * 3 + 2] = c.b;
  }

  const sporeGeo = new THREE.BufferGeometry();
  sporeGeo.setAttribute('position', new THREE.BufferAttribute(sporePos, 3));
  sporeGeo.setAttribute('color', new THREE.BufferAttribute(sporeColors, 3));
  const sporeMat = new THREE.PointsMaterial({
    size: 0.28,
    vertexColors: true,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const spores = new THREE.Points(sporeGeo, sporeMat);
  scene.add(spores);

  function updateWorld(time, focusZ, victoryMode = false) {
    // Seguir el foco de cámara con la luz direccional para sombras nítidas en toda la pista
    const clampedZ = THREE.MathUtils.clamp(focusZ, OBELISK_Z, RACE_START_Z);
    const fx = getValleyCenterX(clampedZ);
    sunLight.target.position.set(fx, 0, clampedZ - 12);
    sunLight.position.set(fx + 48, 72, clampedZ + 32);

    // Animar Obelisco
    spireGroup.position.y = 14.5 + Math.sin(time * 1.4) * 0.85;
    spireGroup.rotation.y = time * 0.22;
    ring1.rotation.x = time * 0.85;
    ring1.rotation.y = time * 0.5;
    ring2.rotation.x = -time * 0.6;
    ring2.rotation.z = time * 0.7;

    if (victoryMode) {
      beamMat.color.setHex(0xe7c85a);
      beamMat.opacity = 0.34 + Math.sin(time * 8) * 0.08;
      obLight.color.setHex(0xe7c85a);
    } else {
      beamMat.color.setHex(0x00e6a8);
      beamMat.opacity = 0.16 + Math.sin(time * 2.2) * 0.03;
      obLight.color.setHex(0x00e6a8);
    }

    // Ondular agua suavemente
    waterMesh.position.y = -0.65 + Math.sin(time * 1.8) * 0.04;
    spores.position.y = Math.sin(time * 0.6) * 0.35;
  }

  return {
    obstacles,
    obeliskPosition: new THREE.Vector3(obX, obY, OBELISK_Z),
    updateWorld
  };
}
