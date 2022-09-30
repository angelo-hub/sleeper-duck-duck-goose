import { IPCModule } from 'node-ipc';
import cache from 'memory-cache';
import _ from 'lodash';

import redis from '../repository/redis.js';

const heartbeatCheckInterval = 100;

class ParentTCPServer {
  constructor({
    port, host, id, election = 1, startChildServer,
  } = {}) {
    this.ipc = new IPCModule();
    this.ipc.config.id = 'parent';
    this.ipc.config.retry = 1500;
    this.ipc.silent = true;
    this.host = host;
    this.port = port;
    this.healthInfo = {
      cluster: {},
      offline: {},
      deadServers: {},
      online: {},
      totalServers: 0,
      elections: election,
    };
    this.id = id;
    this.startChildServer = startChildServer;
    this.lastHeartbeatCheck = Date.now();
  }

  async start() {
    return new Promise((resolve) => {
      this.ipc.serveNet(
        this.host,
        this.port,
        () => {
          console.log('parent server started on', this.host, this.port);
          cache.put('isParent', true);
          this.ipc.server.on('heartbeat', this.onHeartbeat.bind(this));
          this.ipc.server.on('socket.disconnected', this.onSocketDisconnect.bind(this));
          return resolve;
        },
      );
      this.ipc.server.start();
      this.checkHeartBeats();
    });
  }

  // for if network separation causes the parent to be the lone server,
  // therefor should downgrade to a child process
  checkHeartBeats() {
    this.intervalID = setInterval(() => {
      // if cluster's have went offline since last healthcheck
      const offlineServerAmount = _.size(this.healthInfo.offline);
      // include self in server cluster size
      if (offlineServerAmount >= _.size(this.healthInfo.cluster) + 1) {
        // downgrade server using cache so it permeates through app and is retriggered
        cache.put('isParent', false);
      }
      this.healthInfo.deadServers = { ...this.healthInfo.offline };
      this.healthInfo.offline = {};
      // if this is an offline former parent check for new parent
      // in redis and trigger the child IPC connection
      if (cache.get('isParent') === false) {
        const { host, port } = redis.getParentHostPort();
        if (host !== this.host && port !== this.port) {
          this.endParentServerStartChildServer();
        }
      }
    }, heartbeatCheckInterval);
  }

  endParentServerStartChildServer() {
    this.ipc.server.stop();
    this.startChildServer();
  }

  onHeartbeat(data, socket) {
    this.ipc.log('got a message from', (data.id));
    if (!this.healthInfo.cluster[data.address]) {
      this.healthInfo.totalServers += 1;
    }

    this.healthInfo.cluster[data.address] = { ...data, lastHeartbeat: Date.now() };
    cache.put('healthInfo', this.healthInfo);

    this.ipc.server.emit(
      socket,
      'healthInfo',
      {
        id: this.ipc.config.id,
        message: this.healthInfo,
      },
    );
  }

  onSocketDisconnect(socket, socketId) {
    const key = _.findKey(this.healthInfo.cluster, { id: socketId });
    this.healthInfo.offline[key] = { ...this.healthInfo.cluster[key], offlineTime: Date.now() };
    delete this.healthInfo.cluster[key];
    this.healthInfo.totalServers -= 1;
    cache.put('healthInfo', this.healthInfo);
    this.ipc.server.broadcast(
      'healthInfo',
      {
        id: this.ipc.config.id,
        message: this.healthInfo,
      },
    );
  }
}

const singleton = new ParentTCPServer();

export {
  // eslint-disable-next-line no-restricted-exports
  singleton as default,
  ParentTCPServer,
};
