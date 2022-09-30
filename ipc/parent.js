import { IPCModule } from 'node-ipc';
import cache from 'memory-cache';
import _ from 'lodash';

const heartbeatCheckInterval = 100;

class ParentTCPServer {
  constructor({
    port, host, id, election = 1, triggerElection,
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
    this.triggerElection = triggerElection;
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
    });
  }

  // for if network separation causes the parent to be the lone server,
  // therefor should downgrade to a child process
  checkHeartBeats() {
    this.intervalID = setInterval(() => {
      // if cluster's have went offline since last healthcheck
      const offlineServerAmount = _.size(this.healthInfo.offline);
      if (offlineServerAmount > this.healthInfo.cluster) {
        // downgrade server trigger election
        cache.put('isParent', false);
        if (_.isFunction(this.triggerElection)) {
          this.triggerElection();
        }
        this.healthInfo.deadServers = this.healthInfo.offline;
        this.healthInfo.offline = {};
      }
    }, heartbeatCheckInterval);
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

  onSocketDisconnect(socket) {
    const { address, port } = socket.address();
    const key = `${address}:${port}`;
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
