import { IPCModule } from 'node-ipc';
import cache from 'memory-cache';

const heartbeatCheckInterval = 10000;

class ParentTCPServer {
  constructor({
    port, host, id, election = 1,
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
      online: {},
      totalServers: 0,
      elections: election,
    };
    this.id = id;
  }

  async start() {
    return new Promise((resolve) => {
      this.ipc.serveNet(
        this.host,
        this.port,
        () => {
          console.log('parent server started on', this.host, this.port);
          cache.set('isParent', true);
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
    const compareDate = Date.now();
    this.intervalID = setInterval(() => {
      // if cluster's have went offline
      if (_.size(this.healthInfo.cluster) === 0 && _.size(this.healthInfo.offline) > 0)
    }, heartbeatCheckInterval);
  }

  onHeartbeat(data, socket) {
    this.ipc.log('got a message from', (data.id), (data.message));
    if (!this.healthInfo.cluster[data.address]) {
      this.healthInfo.cluster[data.address] = { ...data, lastHeartbeat: Date.now() };
      this.healthInfo.totalServers += 1;
    }

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
    this.healthInfo.offline[key] = this.healthInfo.cluster[key];
    delete this.healthInfo.cluster[key];
    this.healthInfo.totalServers -= 1;
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
