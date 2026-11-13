// Integración con Streamer.bot WebSocket Server + Sincronización entre pestañas/OBS

async function sha256Base64(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hash);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export class StreamerbotConnector {
  constructor(callbacks = {}) {
    this.ws = null;
    this.url = 'ws://127.0.0.1:8080/';
    this.password = '';
    this.rewardName = 'ticket sorteo';
    this.allowDuplicates = false;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'
    this.reconnectTimer = null;
    this.manualDisconnect = false;
    this.reqCounter = 1;

    this.onStatusChange = callbacks.onStatusChange || (() => {});
    this.onParticipantAdded = callbacks.onParticipantAdded || (() => {});
    this.onParticipantsSync = callbacks.onParticipantsSync || (() => {});
    this.onClearRequested = callbacks.onClearRequested || (() => {});
    this.onStartRequested = callbacks.onStartRequested || (() => {});
    this.onLog = callbacks.onLog || (() => {});

    // Canal entre pestañas (Control Dock <-> Fuente OBS)
    this.channel = typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel('mixworlds-sorteo-sync')
      : null;

    if (this.channel) {
      this.channel.onmessage = (ev) => {
        const msg = ev.data;
        if (!msg || !msg.type) return;
        if (msg.type === 'sync_list') {
          this.onParticipantsSync(msg.participants || [], true);
        } else if (msg.type === 'start_race') {
          this.onStartRequested(msg.options || {});
        }
      };
    }
  }

  broadcastList(participants) {
    if (this.channel) {
      this.channel.postMessage({ type: 'sync_list', participants });
    }
  }

  broadcastStart(options = {}) {
    if (this.channel) {
      this.channel.postMessage({ type: 'start_race', options });
    }
  }

  setConfig({ url, password, rewardName, allowDuplicates }) {
    if (url !== undefined) this.url = url.trim() || 'ws://127.0.0.1:8080/';
    if (password !== undefined) this.password = password;
    if (rewardName !== undefined) this.rewardName = rewardName.trim().toLowerCase();
    if (allowDuplicates !== undefined) this.allowDuplicates = !!allowDuplicates;
  }

  setStatus(next) {
    this.status = next;
    this.onStatusChange(next);
  }

  connect() {
    this.manualDisconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
      this.ws = null;
    }

    this.setStatus('connecting');

    try {
      this.ws = new WebSocket(this.url);
    } catch (err) {
      this.onLog(`URL WebSocket inválida: ${err.message}`);
      this.setStatus('disconnected');
      return;
    }

    this.ws.onopen = () => {
      // Streamer.bot envía un paquete "Hello" o acepta Subscribe directamente
      this.onLog('Socket abierto con Streamer.bot...');
    };

    this.ws.onmessage = async (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      // 1. Handshake Hello de Streamer.bot
      if (payload.request === 'Hello') {
        if (payload.authentication && payload.authentication.challenge) {
          if (!this.password) {
            this.onLog('Streamer.bot pide contraseña WebSocket. Introdúcela en el panel.');
            this.disconnect();
            return;
          }
          const secret = await sha256Base64(this.password + payload.authentication.salt);
          const authHash = await sha256Base64(secret + payload.authentication.challenge);
          this.send({
            request: 'Authenticate',
            id: `auth-${this.reqCounter++}`,
            authentication: authHash
          });
        } else {
          this.subscribeEvents();
        }
        return;
      }

      // Respuesta de Authenticate
      if (payload.id && String(payload.id).startsWith('auth-')) {
        if (payload.status === 'ok') {
          this.subscribeEvents();
        } else {
          this.onLog('Error de autenticación en Streamer.bot (contraseña incorrecta).');
          this.disconnect();
        }
        return;
      }

      // Respuesta de Subscribe
      if (payload.id && String(payload.id).startsWith('sub-')) {
        if (payload.status === 'ok') {
          this.setStatus('connected');
          this.onLog(`Conectado y escuchando recompensa "${this.rewardName}"`);
        }
        return;
      }

      // Respuesta de GetGlobal
      if (payload.id && String(payload.id).startsWith('global-')) {
        this.handleGlobalResponse(payload);
        return;
      }

      // 2. Eventos entrantes
      if (payload.event) {
        this.handleEvent(payload.event, payload.data || {});
      }
    };

    this.ws.onerror = () => {
      this.onLog('No se pudo conectar con Streamer.bot WebSocket.');
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.setStatus('disconnected');
      if (!this.manualDisconnect) {
        this.reconnectTimer = setTimeout(() => this.connect(), 5000);
      }
    };
  }

  disconnect() {
    this.manualDisconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
      return true;
    }
    return false;
  }

  subscribeEvents() {
    this.send({
      request: 'Subscribe',
      id: `sub-${this.reqCounter++}`,
      events: {
        Twitch: ['RewardRedemption'],
        General: ['Custom']
      }
    });
    // Fallback por si una versión antigua no envía respuesta a Subscribe
    setTimeout(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN && this.status === 'connecting') {
        this.setStatus('connected');
      }
    }, 600);
  }

  requestGlobalList(variableName = 'sorteo_participantes') {
    if (!this.send({
      request: 'GetGlobal',
      id: `global-${this.reqCounter++}`,
      variable: variableName,
      persisted: true
    })) {
      this.onLog('Conéctate primero a Streamer.bot para leer la variable global.');
    }
  }

  handleGlobalResponse(payload) {
    const val = payload?.variables?.[0]?.value ?? payload?.value ?? payload?.variable?.value;
    if (!val) {
      this.onLog('La variable global en Streamer.bot está vacía o no existe.');
      return;
    }
    const names = this.parseRawNames(val);
    if (names.length > 0) {
      this.onParticipantsSync(names.map((n) => ({ name: n, vip: false })), false);
      this.onLog(`Cargados ${names.length} participantes desde variable global.`);
    }
  }

  handleEvent(eventMeta, data) {
    const source = String(eventMeta.source || '').toLowerCase();
    const type = String(eventMeta.type || '').toLowerCase();

    // Canje de puntos de canal en Twitch
    if (source === 'twitch' && type === 'rewardredemption') {
      const rewardTitle = String(
        data?.reward?.title ||
        data?.rewardTitle ||
        data?.title ||
        ''
      ).trim().toLowerCase();

      if (!this.rewardName || rewardTitle === this.rewardName) {
        const userName =
          data?.user_name ||
          data?.userName ||
          data?.displayName ||
          data?.user?.name ||
          data?.user_login ||
          data?.userLogin;

        if (userName) {
          this.onParticipantAdded({
            name: String(userName).trim(),
            vip: Boolean(data?.isSubscribed || data?.isVip || data?.user?.subscribed)
          });
        }
      }
      return;
    }

    // Eventos Custom enviados desde una acción C# / Trigger Custom Event de Streamer.bot
    if (source === 'general' && type === 'custom') {
      const customName = String(data?.eventName || data?.name || data?.action || '').toLowerCase();
      const payloadData = data?.data || data;

      if (customName === 'sorteo_add' && payloadData?.user) {
        this.onParticipantAdded({
          name: String(payloadData.user).trim(),
          vip: Boolean(payloadData.vip)
        });
      } else if (customName === 'sorteo_sync' && payloadData?.users) {
        const names = this.parseRawNames(payloadData.users);
        this.onParticipantsSync(names.map((n) => ({ name: n, vip: false })), false);
      } else if (customName === 'sorteo_clear') {
        this.onClearRequested();
      } else if (customName === 'sorteo_start') {
        this.onStartRequested({});
      }
    }
  }

  parseRawNames(input) {
    if (Array.isArray(input)) {
      return input.map((v) => String(v).trim()).filter(Boolean);
    }
    const str = String(input).trim();
    if (!str) return [];
    if (str.startsWith('[')) {
      try {
        const arr = JSON.parse(str);
        if (Array.isArray(arr)) {
          return arr.map((v) => (typeof v === 'string' ? v : v?.name || v?.user || '')).map((s) => s.trim()).filter(Boolean);
        }
      } catch (_) {}
    }
    return str
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
}
