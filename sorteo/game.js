import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { soundEngine } from './audio.js';
import { createScaleTextures } from './textures.js';
import { animateDinoRig, createPredatorDino, createSmallDino } from './dinoModels.js';
import { buildSurvivalWorld, getTerrainHeight, getValleyCenterX, OBELISK_Z, RACE_START_Z } from './world.js';
import { StreamerbotConnector } from './streamerbot.js';

const DINO_PALETTE = [
  0x00e6a8, 0x2ec4b6, 0xe7c85a, 0xff7b54,
  0x57cc99, 0x38b6ff, 0xf4a261, 0x8ac926,
  0xff5964, 0x4cc9f0, 0xb5e48c, 0xffbe0b
];

const DEMO_NAMES = [
  'Kaelen_ARK', 'RaptorLover', 'RexSlayer99', 'NoraSurvival', 'TekBuilder',
  'Valkiria_MW', 'DodoKing', 'GigaHunter', 'AurinFan01', 'ShadowMask',
  'PalMaster', 'SkyNomad', 'SpinoTamer', 'BloodMoonVR', 'ObsidianFox',
  'ZackSurvival', 'LumenRunner', 'AlphaCompy', 'MegalodonX', 'CanyonWolf',
  'EmeraldRex', 'KibbleChef', 'ObeliskGuard', 'CryoPod'
];

const STORAGE_KEY = 'mixworlds-sorteo-state-v1';

class DinoExtractionGame {
  constructor() {
    this.canvas = document.getElementById('sceneCanvas');
    this.labelsLayer = document.getElementById('labelsLayer');
    this.killFeedEl = document.getElementById('killFeed');
    this.killCamBannerEl = document.getElementById('killCamBanner');
    this.killCamTextEl = document.getElementById('killCamText');
    this.countdownOverlay = document.getElementById('countdownOverlay');
    this.countdownText = document.getElementById('countdownText');
    this.winnerOverlay = document.getElementById('winnerOverlay');
    this.winnerNameEl = document.getElementById('winnerName');
    this.winnerStatsEl = document.getElementById('winnerStats');
    this.toastContainer = document.getElementById('ticketToastContainer');

    // Estado de participantes & ajustes
    this.participants = [];
    this.settings = {
      wsUrl: 'ws://127.0.0.1:8080/',
      wsPassword: '',
      rewardName: 'ticket sorteo',
      allowDuplicates: false,
      predatorIntensity: 'normal',
      killCamEnabled: true,
      cameraMode: 'auto' // 'auto' | 'wide'
    };

    // Estado de simulación
    this.phase = 'idle'; // 'idle' | 'countdown' | 'running' | 'victory'
    this.simTime = 0;
    this.raceElapsed = 0;
    this.timeScale = 1;
    this.runners = [];
    this.predators = [];
    this.burstParticles = [];
    this.winner = null;
    this.eliminatedCount = 0;

    // Director de cámara
    this.camState = {
      mode: 'FOLLOW_PACK', // 'FOLLOW_PACK' | 'KILL_CAM' | 'VICTORY'
      targetPos: new THREE.Vector3(0, 6, RACE_START_Z + 18),
      lookAtPos: new THREE.Vector3(0, 1.5, RACE_START_Z - 12),
      shake: 0,
      killCamTimer: 0,
      killCamCooldown: 0,
      killCamPredator: null,
      killCamVictim: null,
      killCamSide: 1,
      victoryOrbitAngle: 0
    };

    this.loadState();
    this.initThree();
    this.initStreamerbot();
    this.bindUI();
    this.checkUrlParams();

    // Si no hay participantes guardados, cargar unos pocos de ejemplo para que el valle no esté vacío
    if (this.participants.length === 0) {
      this.participants = DEMO_NAMES.slice(0, 12).map((name, i) => ({
        id: `demo-${i}`,
        name,
        vip: i % 5 === 0
      }));
    }

    this.renderParticipantsList();
    this.spawnEntities();

    this.lastFrame = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.participants)) {
        this.participants = parsed.participants;
      }
      if (parsed.settings) {
        this.settings = { ...this.settings, ...parsed.settings };
      }
    } catch (_) {}
  }

  saveState() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          participants: this.participants,
          settings: this.settings
        })
      );
    } catch (_) {}
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      52,
      window.innerWidth / window.innerHeight,
      0.2,
      650
    );
    this.camera.position.set(0, 9, RACE_START_Z + 20);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    // Post-procesado estilo cinematográfico (Bloom sutil para Obelisco y ojos)
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.42, // intensidad
      0.55, // radio
      0.78  // umbral alto para que solo brille la energía Tek y ojos
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    this.scaleTex = createScaleTextures();
    this.world = buildSurvivalWorld(this.scene);

    // Grupo contenedor de entidades dinámicas
    this.entitiesGroup = new THREE.Group();
    this.scene.add(this.entitiesGroup);

    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.composer.setSize(w, h);
      this.bloomPass.setSize(w, h);
    });
  }

  initStreamerbot() {
    this.sb = new StreamerbotConnector({
      onStatusChange: (status) => {
        const badge = document.getElementById('sbStatusBadge');
        const text = document.getElementById('sbStatusText');
        const btn = document.getElementById('btnConnectSb');
        badge.classList.remove('connected', 'connecting');
        if (status === 'connected') {
          badge.classList.add('connected');
          text.textContent = 'Streamer.bot: Conectado';
          btn.innerHTML = '<i class="fa-solid fa-plug-circle-xmark"></i> Desconectar';
        } else if (status === 'connecting') {
          badge.classList.add('connecting');
          text.textContent = 'Streamer.bot: Conectando...';
          btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Conectando';
        } else {
          text.textContent = 'Streamer.bot: Desconectado';
          btn.innerHTML = '<i class="fa-solid fa-plug"></i> Conectar';
        }
      },
      onParticipantAdded: ({ name, vip }) => {
        const added = this.addParticipant(name, vip, true);
        if (added) {
          this.showTicketToast(name);
        }
      },
      onParticipantsSync: (list, fromBroadcast) => {
        this.participants = list.map((item, idx) => ({
          id: `p-${Date.now()}-${idx}`,
          name: item.name,
          vip: !!item.vip
        }));
        this.saveState();
        this.renderParticipantsList();
        if (this.phase === 'idle') this.spawnEntities();
        if (!fromBroadcast) this.sb.broadcastList(this.participants);
      },
      onClearRequested: () => {
        this.clearParticipants();
      },
      onStartRequested: () => {
        if (this.phase === 'idle' || this.phase === 'victory') {
          this.startRace();
        }
      },
      onLog: (msg) => {
        const logEl = document.getElementById('sbLogText');
        if (logEl) logEl.textContent = msg;
      }
    });

    this.sb.setConfig({
      url: this.settings.wsUrl,
      password: this.settings.wsPassword,
      rewardName: this.settings.rewardName,
      allowDuplicates: this.settings.allowDuplicates
    });
  }

  checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('obs') === '1') {
      document.body.classList.add('obs-clean');
      document.getElementById('controlDrawer').classList.add('closed');
    }
    if (params.get('autoconnect') === '1' || params.get('obs') === '1') {
      this.sb.connect();
    }
  }

  bindUI() {
    const drawer = document.getElementById('controlDrawer');
    const toggleBtn = document.getElementById('btnToggleDrawer');
    const closeBtn = document.getElementById('btnCloseDrawer');

    const toggleDrawer = () => drawer.classList.toggle('closed');
    toggleBtn.addEventListener('click', toggleDrawer);
    closeBtn.addEventListener('click', () => drawer.classList.add('closed'));

    // Tecla Tab para ocultar/mostrar panel rápido
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        toggleDrawer();
      }
    });

    // Sonido
    const muteBtn = document.getElementById('btnMute');
    muteBtn.addEventListener('click', () => {
      soundEngine.setMuted(!soundEngine.muted);
      muteBtn.innerHTML = soundEngine.muted
        ? '<i class="fa-solid fa-volume-xmark"></i> Silencio'
        : '<i class="fa-solid fa-volume-high"></i> Sonido';
    });

    // Modo cámara
    const camBtn = document.getElementById('btnCamMode');
    camBtn.addEventListener('click', () => {
      this.settings.cameraMode = this.settings.cameraMode === 'auto' ? 'wide' : 'auto';
      camBtn.innerHTML =
        this.settings.cameraMode === 'auto'
          ? '<i class="fa-solid fa-video"></i> Director'
          : '<i class="fa-solid fa-panorama"></i> Panorámica';
      this.saveState();
    });

    // Inputs de configuración Streamer.bot
    const wsUrlInput = document.getElementById('inputWsUrl');
    const wsPassInput = document.getElementById('inputWsPass');
    const rewardInput = document.getElementById('inputRewardName');
    const dupCheck = document.getElementById('checkDuplicates');
    const intensitySelect = document.getElementById('selectIntensity');
    const killCamCheck = document.getElementById('checkKillCam');

    wsUrlInput.value = this.settings.wsUrl;
    wsPassInput.value = this.settings.wsPassword;
    rewardInput.value = this.settings.rewardName;
    dupCheck.checked = this.settings.allowDuplicates;
    intensitySelect.value = this.settings.predatorIntensity;
    killCamCheck.checked = this.settings.killCamEnabled;

    const syncSettings = () => {
      this.settings.wsUrl = wsUrlInput.value.trim() || 'ws://127.0.0.1:8080/';
      this.settings.wsPassword = wsPassInput.value;
      this.settings.rewardName = rewardInput.value.trim() || 'ticket sorteo';
      this.settings.allowDuplicates = dupCheck.checked;
      this.settings.predatorIntensity = intensitySelect.value;
      this.settings.killCamEnabled = killCamCheck.checked;
      this.sb.setConfig({
        url: this.settings.wsUrl,
        password: this.settings.wsPassword,
        rewardName: this.settings.rewardName,
        allowDuplicates: this.settings.allowDuplicates
      });
      this.saveState();
    };

    [wsUrlInput, wsPassInput, rewardInput, dupCheck, intensitySelect, killCamCheck].forEach((el) => {
      el.addEventListener('change', syncSettings);
    });

    document.getElementById('btnConnectSb').addEventListener('click', () => {
      syncSettings();
      if (this.sb.status === 'connected' || this.sb.status === 'connecting') {
        this.sb.disconnect();
      } else {
        this.sb.connect();
      }
    });

    document.getElementById('btnLoadGlobal').addEventListener('click', () => {
      this.sb.requestGlobalList('sorteo_participantes');
    });

    // Añadir participante manual
    const manualInput = document.getElementById('inputManualUser');
    const addManual = () => {
      const val = manualInput.value.trim();
      if (!val) return;
      this.addParticipant(val, false, true);
      manualInput.value = '';
    };
    document.getElementById('btnAddManual').addEventListener('click', addManual);
    manualInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addManual();
    });

    // Importar lista masiva
    document.getElementById('btnImportBulk').addEventListener('click', () => {
      const ta = document.getElementById('textareaBulk');
      const names = this.sb.parseRawNames(ta.value);
      if (!names.length) return;
      names.forEach((n) => this.addParticipant(n, false, false));
      ta.value = '';
      this.saveState();
      this.renderParticipantsList();
      this.sb.broadcastList(this.participants);
      if (this.phase === 'idle') this.spawnEntities();
    });

    // Simular 24 participantes
    document.getElementById('btnDemo').addEventListener('click', () => {
      this.participants = DEMO_NAMES.map((name, idx) => ({
        id: `demo-${Date.now()}-${idx}`,
        name,
        vip: idx % 4 === 0
      }));
      this.saveState();
      this.renderParticipantsList();
      this.sb.broadcastList(this.participants);
      this.resetToIdle();
    });

    // Limpiar lista
    document.getElementById('btnClearList').addEventListener('click', () => {
      this.clearParticipants();
    });

    // Botones de lanzar carrera
    document.getElementById('btnStartRace').addEventListener('click', () => {
      soundEngine.unlock();
      this.sb.broadcastStart({});
      this.startRace();
    });
    document.getElementById('btnTopStart').addEventListener('click', () => {
      soundEngine.unlock();
      this.sb.broadcastStart({});
      this.startRace();
    });
    document.getElementById('btnResetRace').addEventListener('click', () => {
      this.resetToIdle();
    });

    // Botones de pantalla de ganador
    document.getElementById('btnWinnerReplay').addEventListener('click', () => {
      soundEngine.unlock();
      this.startRace();
    });
    document.getElementById('btnWinnerReroll').addEventListener('click', () => {
      if (this.winner) {
        const winName = this.winner.name.toLowerCase();
        this.participants = this.participants.filter((p) => p.name.toLowerCase() !== winName);
        this.saveState();
        this.renderParticipantsList();
      }
      soundEngine.unlock();
      this.startRace();
    });
    document.getElementById('btnWinnerOpenPanel').addEventListener('click', () => {
      this.winnerOverlay.classList.remove('visible');
      drawer.classList.remove('closed');
      this.resetToIdle();
    });
  }

  addParticipant(name, vip = false, refreshScene = true) {
    const clean = String(name).trim();
    if (!clean) return false;
    if (!this.settings.allowDuplicates) {
      const exists = this.participants.some((p) => p.name.toLowerCase() === clean.toLowerCase());
      if (exists) return false;
    }
    this.participants.push({
      id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: clean,
      vip: !!vip
    });
    this.saveState();
    this.renderParticipantsList();
    this.sb.broadcastList(this.participants);
    if (refreshScene && this.phase === 'idle') {
      this.spawnEntities();
    }
    return true;
  }

  clearParticipants() {
    this.participants = [];
    this.saveState();
    this.renderParticipantsList();
    this.sb.broadcastList(this.participants);
    this.resetToIdle();
  }

  renderParticipantsList() {
    const container = document.getElementById('participantsChips');
    const countBadge = document.getElementById('panelParticipantCount');
    countBadge.textContent = `${this.participants.length}`;
    container.innerHTML = '';

    this.participants.forEach((p, idx) => {
      const chip = document.createElement('span');
      chip.className = 'p-chip';
      chip.innerHTML = `<span>${p.vip ? '⭐ ' : ''}${this.escapeHtml(p.name)}</span>`;
      const del = document.createElement('button');
      del.type = 'button';
      del.title = 'Quitar';
      del.textContent = '×';
      del.onclick = () => {
        this.participants.splice(idx, 1);
        this.saveState();
        this.renderParticipantsList();
        this.sb.broadcastList(this.participants);
        if (this.phase === 'idle') this.spawnEntities();
      };
      chip.appendChild(del);
      container.appendChild(chip);
    });

    this.updateHUD();
  }

  escapeHtml(str) {
    return str.replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  showTicketToast(userName) {
    const el = document.createElement('div');
    el.className = 'ticket-toast';
    el.innerHTML = `🎟️ Ticket recibido: <b>${this.escapeHtml(userName)}</b> se une al valle`;
    this.toastContainer.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.35s ease';
      setTimeout(() => el.remove(), 380);
    }, 3600);
  }

  clearEntities() {
    while (this.entitiesGroup.children.length > 0) {
      this.entitiesGroup.remove(this.entitiesGroup.children[0]);
    }
    this.labelsLayer.innerHTML = '';
    this.runners = [];
    this.predators = [];
    this.burstParticles = [];
  }

  spawnEntities() {
    this.clearEntities();
    this.winner = null;
    this.eliminatedCount = 0;
    this.killFeedEl.innerHTML = '';
    this.winnerOverlay.classList.remove('visible');
    document.body.classList.remove('killcam-active');
    this.killCamBannerEl.classList.remove('visible');

    // 1. Spawnear participantes como pequeños dinos en la línea de salida
    const total = this.participants.length;
    const cols = Math.min(8, Math.max(3, Math.ceil(Math.sqrt(total * 1.4))));
    const startCX = getValleyCenterX(RACE_START_Z);

    this.participants.forEach((p, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const xOffset = (col - (cols - 1) / 2) * 2.25 + (Math.random() - 0.5) * 0.6;
      const z = RACE_START_Z + row * 2.35 + (Math.random() - 0.5) * 0.5;
      const x = startCX + xOffset;
      const y = getTerrainHeight(x, z);

      const colorHex = DINO_PALETTE[idx % DINO_PALETTE.length];
      const variant = idx % 3 === 0 ? 'dilo' : 'raptor';
      const rig = createSmallDino({
        colorHex,
        variant,
        isVip: p.vip,
        scaleTex: this.scaleTex
      });

      rig.root.position.set(x, y, z);
      rig.root.rotation.y = Math.PI; // mirando hacia -Z (hacia el Obelisco)
      this.entitiesGroup.add(rig.root);

      // Etiqueta HTML proyectada
      const labelEl = document.createElement('div');
      labelEl.className = 'dino-label';
      const dotHex = '#' + colorHex.toString(16).padStart(6, '0');
      labelEl.innerHTML = `<span class="dot" style="background:${dotHex}"></span><span>${this.escapeHtml(p.name)}</span>`;
      this.labelsLayer.appendChild(labelEl);

      this.runners.push({
        id: p.id,
        name: p.name,
        vip: p.vip,
        colorHex,
        rig,
        labelEl,
        pos: rig.root.position,
        vel: new THREE.Vector3(0, 0, -1),
        yaw: Math.PI,
        baseSpeed: 8.6 + Math.random() * 1.45,
        laneOffset: (Math.random() - 0.5) * 14,
        lanePhase: Math.random() * Math.PI * 2,
        stridePhase: Math.random() * 10,
        alive: true,
        targetedBy: null
      });
    });

    // 2. Spawnear depredadores gigantes por zonas del valle
    const zonePresets = {
      suave: [
        { z: -48, species: 'raptor', side: -1 },
        { z: -125, species: 'carno', side: 1 },
        { z: -205, species: 'trex', side: -1 },
        { z: -258, species: 'raptor', side: 1 }
      ],
      normal: [
        { z: -38, species: 'raptor', side: -1 },
        { z: -84, species: 'carno', side: 1 },
        { z: -124, species: 'trex', side: -1 },
        { z: -176, species: 'raptor', side: 1 },
        { z: -220, species: 'carno', side: -1 },
        { z: -262, species: 'trex', side: 1 }
      ],
      carniceria: [
        { z: -32, species: 'raptor', side: -1 },
        { z: -64, species: 'carno', side: 1 },
        { z: -96, species: 'raptor', side: 1 },
        { z: -124, species: 'trex', side: -1 },
        { z: -158, species: 'carno', side: 1 },
        { z: -195, species: 'raptor', side: -1 },
        { z: -232, species: 'trex', side: 1 },
        { z: -266, species: 'carno', side: -1 }
      ]
    };

    const chosen = zonePresets[this.settings.predatorIntensity] || zonePresets.normal;
    chosen.forEach((cfg, idx) => {
      const rig = createPredatorDino(cfg.species, this.scaleTex);
      const cx = getValleyCenterX(cfg.z);
      const homeX = cx + cfg.side * (8 + Math.random() * 4.5);
      const homeY = getTerrainHeight(homeX, cfg.z);

      rig.root.position.set(homeX, homeY, cfg.z);
      rig.root.rotation.y = cfg.side > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
      this.entitiesGroup.add(rig.root);

      const labelMap = {
        trex: 'T-REX ALPHA',
        carno: 'CARNOTAURUS',
        raptor: 'RAPTOR ALPHA'
      };

      this.predators.push({
        id: `pred-${idx}`,
        species: cfg.species,
        displayName: labelMap[cfg.species] || 'DEPREDADOR',
        rig,
        pos: rig.root.position,
        homePos: new THREE.Vector3(homeX, homeY, cfg.z),
        yaw: rig.root.rotation.y,
        state: 'PATROL', // 'PATROL' | 'CHARGE' | 'LUNGE' | 'DIGEST'
        target: null,
        stateTimer: 0,
        patrolPhase: idx * 1.7,
        aggroRadius: cfg.species === 'trex' ? 30 : cfg.species === 'carno' ? 28 : 26,
        chargeSpeed: cfg.species === 'trex' ? 12.6 : cfg.species === 'carno' ? 13.8 : 14.8,
        biteRange: cfg.species === 'trex' ? 4.8 : cfg.species === 'carno' ? 4.0 : 3.2,
        jawVal: 0.08
      });
    });

    // Posicionar cámara en la salida
    this.camState.mode = 'FOLLOW_PACK';
    this.camState.targetPos.set(startCX + 5, 7.5, RACE_START_Z + 18);
    this.camState.lookAtPos.set(startCX, 1.5, RACE_START_Z - 12);
    this.camera.position.copy(this.camState.targetPos);
    this.camera.lookAt(this.camState.lookAtPos);

    this.updateHUD();
  }

  resetToIdle() {
    this.phase = 'idle';
    this.timeScale = 1;
    this.raceElapsed = 0;
    this.countdownOverlay.classList.remove('visible');
    this.spawnEntities();
  }

  startRace() {
    if (this.participants.length === 0) {
      document.getElementById('controlDrawer').classList.remove('closed');
      return;
    }

    // Cerrar panel y overlay al iniciar carrera
    document.getElementById('controlDrawer').classList.add('closed');
    this.winnerOverlay.classList.remove('visible');

    this.spawnEntities();
    this.phase = 'countdown';
    this.timeScale = 1;
    this.raceElapsed = 0;
    this.camState.killCamCooldown = 0;

    this.countdownOverlay.classList.add('visible');
    const steps = ['3', '2', '1', '¡CORRED!'];
    let stepIdx = 0;

    const tick = () => {
      if (this.phase !== 'countdown') return;
      const text = steps[stepIdx];
      this.countdownText.textContent = text;
      const isFinal = stepIdx === steps.length - 1;
      soundEngine.playCountdownTick(isFinal);

      if (isFinal) {
        soundEngine.playRoar(true);
        this.phase = 'running';
        setTimeout(() => {
          this.countdownOverlay.classList.remove('visible');
        }, 700);
      } else {
        stepIdx++;
        setTimeout(tick, 800);
      }
    };
    tick();
  }

  addKillFeedItem(predatorName, victimName) {
    const item = document.createElement('div');
    item.className = 'kill-item';
    item.innerHTML = `
      <span>🦖</span>
      <div>
        <div class="predator">${this.escapeHtml(predatorName)}</div>
        <div>Devoró a <span class="victim">${this.escapeHtml(victimName)}</span></div>
      </div>
    `;
    this.killFeedEl.prepend(item);
    while (this.killFeedEl.children.length > 5) {
      this.killFeedEl.lastElementChild.remove();
    }
    setTimeout(() => {
      item.classList.add('fade-out');
      setTimeout(() => item.remove(), 400);
    }, 6000);
  }

  spawnBurstParticles(pos, colorHex = 0xff4d5a, count = 26) {
    for (let i = 0; i < count; i++) {
      const geo = new THREE.SphereGeometry(0.12 + Math.random() * 0.14, 5, 5);
      const mat = new THREE.MeshBasicMaterial({
        color: i % 3 === 0 ? 0xe7c85a : colorHex,
        transparent: true,
        opacity: 0.95
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos).add(new THREE.Vector3(0, 0.9, 0));
      this.entitiesGroup.add(mesh);

      this.burstParticles.push({
        mesh,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 9,
          2.5 + Math.random() * 6.5,
          (Math.random() - 0.5) * 9
        ),
        life: 0.8 + Math.random() * 0.5
      });
    }
  }

  triggerKillCam(predator, victim) {
    if (!this.settings.killCamEnabled || this.camState.killCamCooldown > 0) {
      return;
    }
    this.camState.mode = 'KILL_CAM';
    this.camState.killCamPredator = predator;
    this.camState.killCamVictim = victim;
    this.camState.killCamTimer = 1.65; // en tiempo real
    this.camState.killCamCooldown = 4.2;
    this.camState.killCamSide = Math.random() > 0.5 ? 1 : -1;
    this.timeScale = 0.28;

    document.body.classList.add('killcam-active');
    this.killCamTextEl.textContent = `${predator.displayName} ATACA A ${victim.name.toUpperCase()}`;
    this.killCamBannerEl.classList.add('visible');
    soundEngine.playRoar(predator.species === 'trex');
  }

  executeEat(predator, victim) {
    if (!victim.alive) return;
    victim.alive = false;
    victim.targetedBy = null;
    victim.labelEl.style.display = 'none';
    this.eliminatedCount++;

    soundEngine.playBiteImpact();
    this.camState.shake = 0.55;
    this.spawnBurstParticles(victim.pos, 0xff3b4e, 28);
    this.addKillFeedItem(predator.displayName, victim.name);

    // Si estaba activa la Kill-Cam sobre esta víctima, actualizar texto al instante de la mordida
    if (this.camState.mode === 'KILL_CAM' && this.camState.killCamVictim === victim) {
      this.killCamTextEl.textContent = `☠️ ${victim.name.toUpperCase()} ELIMINADO`;
    }

    // Revisar si queda 1 solo superviviente tras eliminaciones (y había más de 1 al principio)
    const aliveList = this.runners.filter((r) => r.alive);
    if (aliveList.length === 1 && this.runners.length > 1) {
      // Le damos sprint dorado hacia el Obelisco o victoria directa si ya está cerca
      const last = aliveList[0];
      last.baseSpeed = Math.max(last.baseSpeed, 11.8);
    }

    this.updateHUD();
  }

  triggerVictory(winnerRunner) {
    if (this.phase === 'victory') return;
    this.phase = 'victory';
    this.winner = winnerRunner;
    this.timeScale = 1;
    this.camState.mode = 'VICTORY';
    document.body.classList.remove('killcam-active');
    this.killCamBannerEl.classList.remove('visible');

    soundEngine.playVictory();
    this.spawnBurstParticles(winnerRunner.pos, 0xe7c85a, 45);

    this.winnerNameEl.textContent = winnerRunner.name;
    this.winnerStatsEl.innerHTML = `
      ¡Ha alcanzado el <b>Obelisco MixWorlds</b> en <b>${this.raceElapsed.toFixed(1)} s</b>!<br>
      Supervivientes: <b>${this.runners.filter((r) => r.alive).length}</b> de <b>${this.runners.length}</b> · Devorados: <b>${this.eliminatedCount}</b>
    `;
    this.winnerOverlay.classList.add('visible');
  }

  updateHUD() {
    const alive = this.runners.filter((r) => r.alive);
    const total = this.runners.length;
    document.getElementById('hudAlive').textContent = `${alive.length} / ${total}`;
    document.getElementById('hudDead').textContent = `${this.eliminatedCount}`;

    let bestZ = RACE_START_Z;
    alive.forEach((r) => {
      if (r.pos.z < bestZ) bestZ = r.pos.z;
    });
    const pct = THREE.MathUtils.clamp(
      ((RACE_START_Z - bestZ) / (RACE_START_Z - OBELISK_Z)) * 100,
      0,
      100
    );
    document.getElementById('hudProgressPct').textContent = `${Math.round(pct)}%`;
    document.getElementById('hudProgressFill').style.width = `${pct.toFixed(1)}%`;
  }

  updateRunners(simDt) {
    const aliveList = this.runners.filter((r) => r.alive);
    // Ordenar para marcar al líder
    const sorted = [...aliveList].sort((a, b) => a.pos.z - b.pos.z);
    const leader = sorted[0] || null;

    for (const r of this.runners) {
      if (!r.alive) {
        animateDinoRig(r.rig, this.simTime, 0, 'dead');
        // Hundir lentamente cuerpo eliminado
        r.pos.y -= simDt * 0.35;
        continue;
      }

      if (this.phase === 'idle' || this.phase === 'countdown') {
        animateDinoRig(r.rig, this.simTime + r.stridePhase, 0.2, 'idle');
        r.labelEl.classList.toggle('leader', false);
        r.labelEl.classList.toggle('targeted', false);
        continue;
      }

      if (this.phase === 'victory') {
        animateDinoRig(r.rig, this.simTime + r.stridePhase, 0.3, r === this.winner ? 'roar' : 'idle');
        continue;
      }

      // Carrera activa
      r.lanePhase += simDt * 0.9;
      const targetZ = Math.max(OBELISK_Z, r.pos.z - 12);
      const centerLineX = getValleyCenterX(targetZ);
      const desiredLane =
        r.pos.z < -265
          ? 0 // converger al Obelisco al final
          : r.laneOffset + Math.sin(r.lanePhase) * 2.2;

      const targetX = centerLineX + desiredLane;
      const steer = new THREE.Vector2(targetX - r.pos.x, targetZ - r.pos.z).normalize();

      // Esquivar obstáculos (rocas y troncos)
      for (const obs of this.world.obstacles) {
        const dx = r.pos.x - obs.x;
        const dz = r.pos.z - obs.z;
        const dSq = dx * dx + dz * dz;
        const avoidR = obs.radius + 1.55;
        if (dSq < avoidR * avoidR && dSq > 0.001) {
          const d = Math.sqrt(dSq);
          const push = ((avoidR - d) / avoidR) * 2.6;
          steer.x += (dx / d) * push;
          steer.y += (dz / d) * push;
        }
      }

      // Separación suave entre corredores
      for (const other of aliveList) {
        if (other === r) continue;
        const dx = r.pos.x - other.pos.x;
        const dz = r.pos.z - other.pos.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < 2.2 && dSq > 0.001) {
          const d = Math.sqrt(dSq);
          steer.x += (dx / d) * 0.65;
          steer.y += (dz / d) * 0.65;
        }
      }

      // Evasión de depredadores cercanos en carga
      let panicBoost = 1;
      for (const pred of this.predators) {
        if (pred.state === 'CHARGE' || pred.state === 'LUNGE') {
          const dx = r.pos.x - pred.pos.x;
          const dz = r.pos.z - pred.pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 13 && dist > 0.01) {
            steer.x += (dx / dist) * 1.4;
            steer.y += (dz / dist) * 0.8; // seguir huyendo hacia delante sobre todo
            panicBoost = 1.14;
          }
        }
      }

      steer.normalize();
      const speed = r.baseSpeed * panicBoost;
      r.pos.x += steer.x * speed * simDt;
      r.pos.z += steer.y * speed * simDt;

      // Mantener dentro de los muros del cañón
      const curCenterX = getValleyCenterX(r.pos.z);
      r.pos.x = THREE.MathUtils.clamp(r.pos.x, curCenterX - 15.5, curCenterX + 15.5);
      r.pos.y = getTerrainHeight(r.pos.x, r.pos.z);

      // Rotación suave hacia dirección de movimiento
      const targetYaw = Math.atan2(steer.x, steer.y);
      let diff = targetYaw - r.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      r.yaw += diff * Math.min(1, simDt * 10);
      r.rig.root.rotation.y = r.yaw;

      animateDinoRig(r.rig, this.simTime + r.stridePhase, speed / 9, 'run');

      r.labelEl.classList.toggle('leader', r === leader);
      r.labelEl.classList.toggle('targeted', Boolean(r.targetedBy));

      // Comprobar meta en el Obelisco
      const distOb = Math.hypot(
        r.pos.x - this.world.obeliskPosition.x,
        r.pos.z - this.world.obeliskPosition.z
      );
      if (distOb < 6.8 || r.pos.z <= OBELISK_Z + 1.5) {
        this.triggerVictory(r);
        break;
      }
    }
  }

  updatePredators(simDt) {
    const aliveList = this.runners.filter((r) => r.alive);

    for (const pred of this.predators) {
      if (this.phase !== 'running') {
        pred.patrolPhase += simDt * 0.7;
        const px = pred.homePos.x + Math.sin(pred.patrolPhase) * 2.5;
        const pz = pred.homePos.z + Math.cos(pred.patrolPhase * 0.7) * 2.0;
        pred.pos.set(px, getTerrainHeight(px, pz), pz);
        animateDinoRig(pred.rig, this.simTime + pred.patrolPhase, 0.2, 'idle');
        continue;
      }

      // Nunca eliminar si solo queda 1 superviviente
      if (aliveList.length <= 1 && pred.state !== 'DIGEST') {
        pred.state = 'DIGEST';
        pred.stateTimer = 10;
        if (pred.target) {
          pred.target.targetedBy = null;
          pred.target = null;
        }
      }

      if (pred.state === 'DIGEST') {
        pred.stateTimer -= simDt;
        animateDinoRig(pred.rig, this.simTime, 0.1, 'roar');
        if (pred.stateTimer <= 0 && aliveList.length > 1) {
          pred.state = 'PATROL';
        }
        continue;
      }

      if (pred.state === 'PATROL') {
        pred.patrolPhase += simDt * 1.1;
        const px = pred.homePos.x + Math.sin(pred.patrolPhase) * 4.5;
        const pz = pred.homePos.z + Math.cos(pred.patrolPhase * 0.8) * 3.0;
        const dx = px - pred.pos.x;
        const dz = pz - pred.pos.z;
        pred.pos.set(px, getTerrainHeight(px, pz), pz);
        const yaw = Math.atan2(dx, dz);
        pred.yaw = THREE.MathUtils.lerp(pred.yaw, yaw, 0.08);
        pred.rig.root.rotation.y = pred.yaw;
        animateDinoRig(pred.rig, this.simTime + pred.patrolPhase, 0.35, 'run');

        // Buscar presa cercana
        if (aliveList.length > 1) {
          let bestVictim = null;
          let bestDist = pred.aggroRadius;
          for (const r of aliveList) {
            if (r.targetedBy) continue;
            // Evitar que ataquen demasiado cerca de la meta para no robar un final épico
            if (r.pos.z < OBELISK_Z + 18) continue;
            const d = pred.pos.distanceTo(r.pos);
            if (d < bestDist) {
              bestDist = d;
              bestVictim = r;
            }
          }
          if (bestVictim) {
            pred.state = 'CHARGE';
            pred.target = bestVictim;
            bestVictim.targetedBy = pred;
          }
        }
        continue;
      }

      if (pred.state === 'CHARGE') {
        const v = pred.target;
        if (!v || !v.alive || pred.pos.distanceTo(v.pos) > pred.aggroRadius * 1.55) {
          if (v) v.targetedBy = null;
          pred.target = null;
          pred.state = 'PATROL';
          continue;
        }

        const dx = v.pos.x - pred.pos.x;
        const dz = v.pos.z - pred.pos.z;
        const dist = Math.hypot(dx, dz);

        const moveX = (dx / Math.max(0.01, dist)) * pred.chargeSpeed * simDt;
        const moveZ = (dz / Math.max(0.01, dist)) * pred.chargeSpeed * simDt;
        pred.pos.x += moveX;
        pred.pos.z += moveZ;
        pred.pos.y = getTerrainHeight(pred.pos.x, pred.pos.z);

        const targetYaw = Math.atan2(dx, dz);
        let diff = targetYaw - pred.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        pred.yaw += diff * Math.min(1, simDt * 12);
        pred.rig.root.rotation.y = pred.yaw;

        animateDinoRig(pred.rig, this.simTime, 1.35, 'run', dist < 9 ? 0.55 : null);

        if (dist <= pred.biteRange) {
          pred.state = 'LUNGE';
          pred.stateTimer = 0.36; // duración de la embestida antes del cierre de mandíbula
          this.triggerKillCam(pred, v);
        }
        continue;
      }

      if (pred.state === 'LUNGE') {
        const v = pred.target;
        if (!v || !v.alive) {
          pred.target = null;
          pred.state = 'DIGEST';
          pred.stateTimer = 3.5;
          continue;
        }

        pred.stateTimer -= simDt;
        const dx = v.pos.x - pred.pos.x;
        const dz = v.pos.z - pred.pos.z;
        const dist = Math.hypot(dx, dz);

        const lungeSpeed = pred.chargeSpeed * 1.35;
        if (dist > 1.0) {
          pred.pos.x += (dx / dist) * lungeSpeed * simDt;
          pred.pos.z += (dz / dist) * lungeSpeed * simDt;
          pred.pos.y = getTerrainHeight(pred.pos.x, pred.pos.z);
        }

        const targetYaw = Math.atan2(dx, dz);
        pred.yaw = targetYaw;
        pred.rig.root.rotation.y = pred.yaw;

        // Mandíbula se abre al máximo y se cierra justo al final
        const jawAngle = pred.stateTimer > 0.09 ? 0.85 : 0.04;
        animateDinoRig(pred.rig, this.simTime, 1.4, 'lunge', jawAngle);

        if (pred.stateTimer <= 0) {
          this.executeEat(pred, v);
          pred.target = null;
          pred.state = 'DIGEST';
          // Pausa tras comer para que el resto del pelotón siga avanzando
          pred.stateTimer = this.settings.predatorIntensity === 'carniceria' ? 3.2 : 5.2;
        }
      }
    }
  }

  updateParticles(simDt) {
    for (let i = this.burstParticles.length - 1; i >= 0; i--) {
      const bp = this.burstParticles[i];
      bp.life -= simDt;
      if (bp.life <= 0) {
        this.entitiesGroup.remove(bp.mesh);
        bp.mesh.geometry.dispose();
        bp.mesh.material.dispose();
        this.burstParticles.splice(i, 1);
        continue;
      }
      bp.vel.y -= 14 * simDt;
      bp.mesh.position.addScaledVector(bp.vel, simDt);
      bp.mesh.material.opacity = Math.max(0, bp.life);
    }
  }

  updateCamera(realDt) {
    if (this.camState.killCamCooldown > 0) {
      this.camState.killCamCooldown -= realDt;
    }

    // Modo KILL-CAM
    if (this.camState.mode === 'KILL_CAM') {
      this.camState.killCamTimer -= realDt;
      const pred = this.camState.killCamPredator;
      const victim = this.camState.killCamVictim;

      if (pred && victim && this.camState.killCamTimer > 0) {
        const mid = new THREE.Vector3()
          .addVectors(pred.pos, victim.pos)
          .multiplyScalar(0.5);
        mid.y += 1.65;

        // Vector perpendicular al ataque para ángulo lateral cinematográfico
        const dir = new THREE.Vector3().subVectors(victim.pos, pred.pos);
        dir.y = 0;
        if (dir.lengthSq() < 0.01) dir.set(0, 0, -1);
        dir.normalize();

        const perp = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(this.camState.killCamSide);
        const desiredCam = mid
          .clone()
          .addScaledVector(perp, 6.2)
          .addScaledVector(dir, 3.8);
        desiredCam.y = Math.max(getTerrainHeight(desiredCam.x, desiredCam.z) + 2.2, mid.y + 1.8);

        this.camera.position.lerp(desiredCam, Math.min(1, realDt * 9));
        this.camState.lookAtPos.lerp(mid, Math.min(1, realDt * 12));
        this.camera.lookAt(this.camState.lookAtPos);
      } else {
        this.camState.mode = 'FOLLOW_PACK';
        this.timeScale = 1;
        document.body.classList.remove('killcam-active');
        this.killCamBannerEl.classList.remove('visible');
      }
    } else if (this.camState.mode === 'VICTORY' && this.winner) {
      this.camState.victoryOrbitAngle += realDt * 0.55;
      const r = 13;
      const wx = this.winner.pos.x + Math.cos(this.camState.victoryOrbitAngle) * r;
      const wz = this.winner.pos.z + Math.sin(this.camState.victoryOrbitAngle) * r;
      const wy = Math.max(getTerrainHeight(wx, wz) + 3.2, this.winner.pos.y + 4.8);

      this.camera.position.lerp(new THREE.Vector3(wx, wy, wz), Math.min(1, realDt * 3.5));
      const targetLook = this.winner.pos.clone().add(new THREE.Vector3(0, 1.8, 0));
      this.camState.lookAtPos.lerp(targetLook, Math.min(1, realDt * 5));
      this.camera.lookAt(this.camState.lookAtPos);
    } else {
      // FOLLOW_PACK (Normal o Panorámica)
      const alive = this.runners.filter((r) => r.alive).sort((a, b) => a.pos.z - b.pos.z);
      let focus = new THREE.Vector3(getValleyCenterX(RACE_START_Z), 1.5, RACE_START_Z);

      if (alive.length > 0) {
        const sample = alive.slice(0, Math.min(4, alive.length));
        focus.set(0, 0, 0);
        sample.forEach((r) => focus.add(r.pos));
        focus.divideScalar(sample.length);
      }

      const isWide = this.settings.cameraMode === 'wide';
      const camBack = isWide ? 24 : 15.5;
      const camHeight = isWide ? 14.5 : 6.6;
      const camSide = isWide ? 4 : Math.sin(this.simTime * 0.25) * 4.8;

      const desiredPos = new THREE.Vector3(
        focus.x + camSide,
        Math.max(getTerrainHeight(focus.x + camSide, focus.z + camBack) + 3.5, focus.y + camHeight),
        focus.z + camBack
      );
      const desiredLook = new THREE.Vector3(focus.x, focus.y + 1.4, focus.z - 11);

      this.camera.position.lerp(desiredPos, Math.min(1, realDt * 3.2));
      this.camState.lookAtPos.lerp(desiredLook, Math.min(1, realDt * 4.5));
      this.camera.lookAt(this.camState.lookAtPos);
    }

    // Temblor de cámara por mordida
    if (this.camState.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.camState.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.camState.shake;
      this.camState.shake *= Math.pow(0.03, realDt);
    }
  }

  updateLabels() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const tmp = new THREE.Vector3();

    for (const r of this.runners) {
      if (!r.alive) continue;
      tmp.copy(r.pos);
      tmp.y += 2.05;
      tmp.project(this.camera);

      // Ocultar si está detrás de la cámara o muy lejos
      if (tmp.z > 1 || tmp.z < -1) {
        r.labelEl.style.display = 'none';
        continue;
      }

      const dist = this.camera.position.distanceTo(r.pos);
      if (dist > 95) {
        r.labelEl.style.display = 'none';
        continue;
      }

      const sx = (tmp.x * 0.5 + 0.5) * w;
      const sy = (-tmp.y * 0.5 + 0.5) * h;

      r.labelEl.style.display = 'flex';
      r.labelEl.style.left = `${sx.toFixed(1)}px`;
      r.labelEl.style.top = `${sy.toFixed(1)}px`;
      const scale = THREE.MathUtils.clamp(1.15 - dist / 95, 0.7, 1.1);
      r.labelEl.style.transform = `translate(-50%, -100%) scale(${scale.toFixed(2)})`;
      r.labelEl.style.opacity = dist > 70 ? ((95 - dist) / 25).toFixed(2) : '1';
    }
  }

  loop(now) {
    requestAnimationFrame(this.loop);

    const realDt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const simDt = realDt * this.timeScale;
    this.simTime += simDt;

    if (this.phase === 'running') {
      this.raceElapsed += simDt;
    }

    this.updateRunners(simDt);
    this.updatePredators(simDt);
    this.updateParticles(simDt);
    this.updateCamera(realDt);
    this.world.updateWorld(this.simTime, this.camState.lookAtPos.z, this.phase === 'victory');

    if (this.phase === 'running') {
      this.updateHUD();
    }

    this.composer.render();
    this.updateLabels();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new DinoExtractionGame();
});
