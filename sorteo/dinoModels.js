import * as THREE from 'three';

const sharedGeo = {};
function getTeethGeo() {
  if (!sharedGeo.tooth) {
    sharedGeo.tooth = new THREE.ConeGeometry(0.035, 0.13, 5);
    sharedGeo.toothMat = new THREE.MeshStandardMaterial({
      color: 0xf4efe0,
      roughness: 0.35,
      metalness: 0.05
    });
  }
  return { geo: sharedGeo.tooth, mat: sharedGeo.toothMat };
}

function addTeethRow(parent, count, width, zStart, zEnd, yOffset, pointDown = true, scale = 1) {
  const { geo, mat } = getTeethGeo();
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const z = THREE.MathUtils.lerp(zStart, zEnd, t);
    [-1, 1].forEach((side) => {
      const tooth = new THREE.Mesh(geo, mat);
      tooth.scale.setScalar(scale * (0.75 + 0.35 * (1 - t)));
      tooth.position.set(side * width * (1 - t * 0.45), yOffset, z);
      tooth.rotation.x = pointDown ? Math.PI : 0;
      parent.add(tooth);
    });
  }
}

function buildDinoRig({
  scale = 1,
  bodyColor = 0x2f6b4f,
  bellyColor = 0x8aa882,
  accentColor = 0x00e6a8,
  eyeColor = 0xffcc33,
  scaleTex = null,
  hasHorns = false,
  hasCrest = false,
  bulkySkull = false,
  jawTeethCount = 4
}) {
  const root = new THREE.Group();

  const skinMat = new THREE.MeshStandardMaterial({
    color: bodyColor,
    roughness: 0.62,
    metalness: 0.08,
    map: scaleTex ? scaleTex.map : null,
    bumpMap: scaleTex ? scaleTex.bump : null,
    bumpScale: 0.045
  });

  const bellyMat = new THREE.MeshStandardMaterial({
    color: bellyColor,
    roughness: 0.72,
    metalness: 0.04,
    bumpMap: scaleTex ? scaleTex.bump : null,
    bumpScale: 0.025
  });

  const accentMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: 0.35,
    roughness: 0.4,
    metalness: 0.25
  });

  const eyeMat = new THREE.MeshStandardMaterial({
    color: eyeColor,
    emissive: eyeColor,
    emissiveIntensity: 1.5,
    roughness: 0.2
  });

  // Pelvis / cuerpo principal (orientado +Z hacia delante)
  const body = new THREE.Group();
  body.position.set(0, 1.05, 0);
  root.add(body);

  const torsoGeo = new THREE.SphereGeometry(0.46, 16, 14);
  torsoGeo.scale(0.88, 0.92, 1.55);
  const torso = new THREE.Mesh(torsoGeo, skinMat);
  torso.castShadow = true;
  torso.receiveShadow = true;
  body.add(torso);

  // Pecho / vientre
  const bellyGeo = new THREE.SphereGeometry(0.38, 14, 12);
  bellyGeo.scale(0.76, 0.72, 1.38);
  const belly = new THREE.Mesh(bellyGeo, bellyMat);
  belly.position.set(0, -0.1, 0.06);
  body.add(belly);

  // Cresta dorsal (escamas/espinas)
  const spinesCount = 6;
  for (let i = 0; i < spinesCount; i++) {
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 5), accentMat);
    sp.position.set(0, 0.4 - i * 0.02, 0.35 - i * 0.19);
    sp.rotation.x = -0.35;
    sp.castShadow = true;
    body.add(sp);
  }

  // Cola articulada en 3 segmentos (-Z)
  const tail1 = new THREE.Group();
  tail1.position.set(0, 0.08, -0.58);
  body.add(tail1);

  const t1Geo = new THREE.ConeGeometry(0.24, 0.72, 10);
  t1Geo.rotateX(-Math.PI / 2);
  const t1Mesh = new THREE.Mesh(t1Geo, skinMat);
  t1Mesh.position.set(0, 0, -0.32);
  t1Mesh.castShadow = true;
  tail1.add(t1Mesh);

  const tail2 = new THREE.Group();
  tail2.position.set(0, 0.02, -0.62);
  tail1.add(tail2);

  const t2Geo = new THREE.ConeGeometry(0.15, 0.72, 9);
  t2Geo.rotateX(-Math.PI / 2);
  const t2Mesh = new THREE.Mesh(t2Geo, skinMat);
  t2Mesh.position.set(0, 0, -0.32);
  t2Mesh.castShadow = true;
  tail2.add(t2Mesh);

  const tail3 = new THREE.Group();
  tail3.position.set(0, 0, -0.6);
  tail2.add(tail3);

  const t3Geo = new THREE.ConeGeometry(0.08, 0.65, 8);
  t3Geo.rotateX(-Math.PI / 2);
  const t3Mesh = new THREE.Mesh(t3Geo, accentMat);
  t3Mesh.position.set(0, 0, -0.26);
  tail3.add(t3Mesh);

  // Cuello y Cabeza (+Z)
  const neck = new THREE.Group();
  neck.position.set(0, 0.16, 0.56);
  body.add(neck);

  const neckGeo = new THREE.CylinderGeometry(0.17, 0.24, 0.52, 10);
  const neckMesh = new THREE.Mesh(neckGeo, skinMat);
  neckMesh.position.set(0, 0.18, 0.14);
  neckMesh.rotation.x = 0.58;
  neckMesh.castShadow = true;
  neck.add(neckMesh);

  const head = new THREE.Group();
  head.position.set(0, 0.36, 0.34);
  neck.add(head);

  // Cráneo superior
  const skullW = bulkySkull ? 0.27 : 0.19;
  const skullH = bulkySkull ? 0.24 : 0.16;
  const skullL = bulkySkull ? 0.48 : 0.42;

  const craniumGeo = new THREE.BoxGeometry(skullW * 1.45, skullH * 1.35, skullL * 0.75);
  const cranium = new THREE.Mesh(craniumGeo, skinMat);
  cranium.position.set(0, 0.06, 0.12);
  cranium.castShadow = true;
  head.add(cranium);

  // Hocico superior
  const snoutGeo = new THREE.BoxGeometry(skullW * 1.05, skullH * 0.95, skullL * 0.95);
  const snout = new THREE.Mesh(snoutGeo, skinMat);
  snout.position.set(0, 0.03, 0.34);
  snout.castShadow = true;
  head.add(snout);

  // Dientes superiores
  addTeethRow(head, jawTeethCount, skullW * 0.42, 0.22, 0.54, -skullH * 0.46, true, bulkySkull ? 1.15 : 0.7);

  // Ojos brillantes
  const eyeGeo = new THREE.SphereGeometry(bulkySkull ? 0.048 : 0.036, 10, 8);
  [-1, 1].forEach((side) => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(side * (skullW * 0.74), skullH * 0.42, 0.18);
    head.add(eye);
  });

  // Cuernos (Carnotaurus) o crestas (Dilophosaurus)
  if (hasHorns) {
    const hornGeo = new THREE.ConeGeometry(0.055, 0.26, 7);
    [-1, 1].forEach((side) => {
      const horn = new THREE.Mesh(hornGeo, bellyMat);
      horn.position.set(side * 0.16, 0.24, 0.08);
      horn.rotation.z = -side * 0.55;
      horn.rotation.x = 0.25;
      head.add(horn);
    });
  }

  if (hasCrest) {
    const crestGeo = new THREE.BoxGeometry(0.03, 0.16, 0.34);
    [-1, 1].forEach((side) => {
      const crest = new THREE.Mesh(crestGeo, accentMat);
      crest.position.set(side * 0.07, 0.2, 0.24);
      crest.rotation.z = -side * 0.15;
      head.add(crest);
    });
  }

  // Mandíbula inferior articulada
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.05, 0.08);
  head.add(jaw);

  const lowerJawGeo = new THREE.BoxGeometry(skullW * 0.92, skullH * 0.52, skullL * 1.12);
  const lowerJaw = new THREE.Mesh(lowerJawGeo, bellyMat);
  lowerJaw.position.set(0, -0.03, 0.24);
  lowerJaw.castShadow = true;
  jaw.add(lowerJaw);

  addTeethRow(jaw, Math.max(2, jawTeethCount - 1), skullW * 0.36, 0.18, 0.46, 0.03, false, bulkySkull ? 0.95 : 0.55);

  // Brazos delanteros pequeños
  function makeArm(side) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.31, -0.1, 0.42);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.22, 4, 6), skinMat);
    upper.position.set(0, -0.1, 0.08);
    upper.rotation.x = 0.7;
    arm.add(upper);
    return arm;
  }
  const armL = makeArm(1);
  const armR = makeArm(-1);
  body.add(armL, armR);

  // Piernas traseras articuladas (muslo -> pantorrilla -> pie)
  function makeLeg(side) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.32, -0.12, -0.05);

    const thighGeo = new THREE.CapsuleGeometry(0.145, 0.38, 6, 8);
    const thigh = new THREE.Mesh(thighGeo, skinMat);
    thigh.position.set(0, -0.2, 0.03);
    thigh.rotation.x = -0.25;
    thigh.castShadow = true;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.set(0, -0.44, 0.08);
    hip.add(knee);

    const shinGeo = new THREE.CapsuleGeometry(0.085, 0.42, 5, 8);
    const shin = new THREE.Mesh(shinGeo, skinMat);
    shin.position.set(0, -0.22, -0.05);
    shin.rotation.x = 0.22;
    shin.castShadow = true;
    knee.add(shin);

    const footGeo = new THREE.BoxGeometry(0.18, 0.08, 0.3);
    const foot = new THREE.Mesh(footGeo, bellyMat);
    foot.position.set(0, -0.44, 0.03);
    foot.castShadow = true;
    knee.add(foot);

    return { hip, knee };
  }

  const legL = makeLeg(1);
  const legR = makeLeg(-1);
  body.add(legL.hip, legR.hip);

  root.scale.setScalar(scale);

  return {
    root,
    joints: { body, neck, head, jaw, tail1, tail2, tail3, armL, armR, legL, legR },
    skinMat,
    accentMat
  };
}

export function createSmallDino({ colorHex, variant = 'raptor', isVip = false, scaleTex = null }) {
  const baseColor = new THREE.Color(colorHex);
  const belly = baseColor.clone().lerp(new THREE.Color(0xd8e8c8), 0.55);
  const accent = isVip ? 0xe7c85a : baseColor.clone().offsetHSL(0.06, 0.2, 0.2).getHex();

  return buildDinoRig({
    scale: isVip ? 0.94 : 0.84,
    bodyColor: baseColor.getHex(),
    bellyColor: belly.getHex(),
    accentColor: accent,
    eyeColor: isVip ? 0xe7c85a : 0x00e6a8,
    scaleTex,
    hasHorns: false,
    hasCrest: variant === 'dilo',
    bulkySkull: false,
    jawTeethCount: 3
  });
}

export function createPredatorDino(species = 'trex', scaleTex = null) {
  if (species === 'carno') {
    return buildDinoRig({
      scale: 2.55,
      bodyColor: 0x4b2a1c,
      bellyColor: 0x7a5c44,
      accentColor: 0xff5a2c,
      eyeColor: 0xffaa22,
      scaleTex,
      hasHorns: true,
      hasCrest: false,
      bulkySkull: true,
      jawTeethCount: 5
    });
  }
  if (species === 'raptor') {
    return buildDinoRig({
      scale: 1.75,
      bodyColor: 0x16382b,
      bellyColor: 0x4f7560,
      accentColor: 0x00e6a8,
      eyeColor: 0xff3b52,
      scaleTex,
      hasHorns: false,
      hasCrest: true,
      bulkySkull: false,
      jawTeethCount: 4
    });
  }
  // T-REX ALPHA
  return buildDinoRig({
    scale: 3.35,
    bodyColor: 0x3b1216,
    bellyColor: 0x6b4b3e,
    accentColor: 0xff3344,
    eyeColor: 0xffb300,
    scaleTex,
    hasHorns: false,
    hasCrest: false,
    bulkySkull: true,
    jawTeethCount: 6
  });
}

export function animateDinoRig(rig, time, speedRatio = 1, mode = 'run', jawOpenOverride = null) {
  const j = rig.joints;
  if (mode === 'dead') {
    j.body.rotation.z = THREE.MathUtils.lerp(j.body.rotation.z, Math.PI * 0.48, 0.14);
    j.body.position.y = THREE.MathUtils.lerp(j.body.position.y, 0.35, 0.14);
    j.jaw.rotation.x = 0.25;
    return;
  }

  const freq = mode === 'idle' ? 2.4 : 8.5 + speedRatio * 7.5;
  const amp = mode === 'idle' ? 0.08 : 0.65 * Math.min(1.25, 0.4 + speedRatio * 0.7);
  const phase = time * freq;

  // Zancada de piernas
  const swingL = Math.sin(phase) * amp;
  const swingR = Math.sin(phase + Math.PI) * amp;

  j.legL.hip.rotation.x = swingL;
  j.legL.knee.rotation.x = Math.max(-0.15, -swingL * 0.85) + 0.15;
  j.legR.hip.rotation.x = swingR;
  j.legR.knee.rotation.x = Math.max(-0.15, -swingR * 0.85) + 0.15;

  // Rebote vertical del torso e inclinación hacia delante al correr
  j.body.position.y = 1.05 + Math.abs(Math.cos(phase)) * (mode === 'idle' ? 0.02 : 0.09);
  j.body.rotation.z = Math.sin(phase) * (mode === 'idle' ? 0.01 : 0.045);

  const forwardLean = mode === 'lunge' ? 0.38 : mode === 'roar' ? -0.25 : mode === 'run' ? 0.14 : 0.02;
  j.body.rotation.x = THREE.MathUtils.lerp(j.body.rotation.x, forwardLean, 0.18);

  // Contrabalanceo de cola en 3 segmentos
  const tailSwing = Math.sin(phase * 0.5) * (mode === 'idle' ? 0.08 : 0.22);
  j.tail1.rotation.y = tailSwing;
  j.tail2.rotation.y = tailSwing * 1.15;
  j.tail3.rotation.y = tailSwing * 1.3;

  // Cuello y cabeza
  if (mode === 'roar') {
    j.neck.rotation.x = THREE.MathUtils.lerp(j.neck.rotation.x, -0.32, 0.15);
    j.head.rotation.x = THREE.MathUtils.lerp(j.head.rotation.x, -0.3, 0.15);
    j.head.rotation.y = Math.sin(time * 14) * 0.12;
  } else if (mode === 'lunge') {
    j.neck.rotation.x = THREE.MathUtils.lerp(j.neck.rotation.x, 0.35, 0.25);
    j.head.rotation.x = THREE.MathUtils.lerp(j.head.rotation.x, 0.18, 0.25);
    j.head.rotation.y = 0;
  } else {
    j.neck.rotation.x = THREE.MathUtils.lerp(j.neck.rotation.x, Math.sin(phase * 2) * 0.06, 0.15);
    j.head.rotation.x = THREE.MathUtils.lerp(j.head.rotation.x, Math.cos(phase * 2) * 0.05, 0.15);
    j.head.rotation.y = Math.sin(phase * 0.5) * 0.06;
  }

  // Mandíbula
  if (jawOpenOverride !== null) {
    j.jaw.rotation.x = THREE.MathUtils.lerp(j.jaw.rotation.x, jawOpenOverride, 0.35);
  } else if (mode === 'roar') {
    j.jaw.rotation.x = 0.65 + Math.sin(time * 20) * 0.08;
  } else if (mode === 'lunge') {
    j.jaw.rotation.x = 0.78;
  } else {
    j.jaw.rotation.x = 0.06 + Math.abs(Math.sin(phase)) * 0.06;
  }
}
