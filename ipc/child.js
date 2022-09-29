import { IPCModule } from 'node-ipc';
import _ from 'lodash';
import cache from 'memory-cache';

const { isFunction } = _;
// interval the heartbeat will take place
const heartbeatIntervalMax = 1000;
const hearbeatIntervalMin = 750;

class ChildConnection {
  constructor({
    noParentServer, parentSocketID, port, host, electionConfig = {}, id,
  } = {}) {
    this.ipc = new IPCModule();
    this.ipc.config.retry = 1500;
    this.ipc.config.silent = true;
    // manage retries ourself for heartbeats
    this.ipc.stopRetrying = 0;
    this.ipc.maxRetries = 1;

    this.noParentServer = noParentServer;
    this.parentSocketID = parentSocketID;
    this.port = port;
    this.host = host;
    this.heartbeatAttempts = 0;
    this.electionConfig = electionConfig;
    this.id = id;
    this.hasRunNoParentServer = false;
    // create a random interval to heartbeat the primary server
    // eslint-disable-next-line max-len
    this.heartbeatInterval = Math.floor(Math.random() * (heartbeatIntervalMax - hearbeatIntervalMin) + hearbeatIntervalMin);
  }

  start({ host, port } = {}) {
    if (host) {
      this.host = host;
    }
    if (port) {
      this.port = port;
    }
    this.connect();
  }

  async connect() {
    this.ipc.connectToNet(
      this.parentSocketID,
      this.host,
      this.port,
      () => {
        this.ipc.of[this.parentSocketID].on('connect', this.onConnect.bind(this));
        this.ipc.of[this.parentSocketID].on('disconnect', this.onDisconnect.bind(this));
        this.ipc.of[this.parentSocketID].on('healthInfo', this.handleHealthInfo.bind(this)); // any event or message type your server listens for
      },
    );
    this.emitHeartBeat();
  }

  async reconnect({ host, port }) {
    if (!host || !port) {
      console.error('missing host or port arguments');
      return Promise.reject(new Error('missing host and port'));
    }
    this.host = host;
    this.port = port;
    await this.disconnect();
    this.connect();
    return Promise.resolve();
  }

  async onConnect() {
    this.hasRunNoParentServer = false;
    cache.set('isParent', false);
    console.log(`connected to ${this.parentSocketID}`);
    // fulling committing to this, set it to a random within 5 seconds and run it on a timeout
  }

  async handleHealthInfo({ message }) {
    cache.put('healthInfo', message);
    this.heartbeatAttempts = 0;
  }

  async onDisconnect() {
    console.log(`disconnected from ${this.parentSocketID}`);
    if (isFunction(this.noParentServer) && this.hasRunNoParentServer === false) {
      // debounce voting
      this.hasRunNoParentServer = true;
      this.noParentServer();
    }
  }

  async emitHeartBeat() {
    this.intervalID = setInterval(async () => {
      if (this.heartbeatAttempts === 3) {
        // Trigger voting sequence
        // if (isFunction(this.noParentServer) && this.hasRunNoParentServer === false) {
        //   // debounce voting
        //   this.hasRunNoParentServer = true;
        //   this.noParentServer();
        // }
        clearInterval(this.intervalID);
      } else if (this.parentSocketID && this.ipc.of[this.parentSocketID]) {
        this.ipc.of[this.parentSocketID].emit(
          'heartbeat', // any event or message type your server listens for
          { ...this.electionConfig, id: this.id },
          () => console.log(`${this.id} emit heartbeat to parent`),
        );
      }
      // eslint-disable-next-line no-plusplus
      this.heartbeatAttempts++;
    }, this.heartbeatInterval);
  }

  async disconnect() {
    return this.ipc.disconnect(this.parentSocketID);
  }
}

const singleton = new ChildConnection();

export {
  // eslint-disable-next-line no-restricted-exports
  singleton as default,
  ChildConnection,
};
