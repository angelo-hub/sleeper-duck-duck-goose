import { IPCModule } from 'node-ipc';

const heartbeatCheckInterval = 10000;

class ParentTCPServer {
  constructor({
    port, host, id, election = 1,
  } = {}) {
    this.ipc = new IPCModule();
    this.ipc.config.id = 'parent';
    this.ipc.config.retry = 1500;
    this.host = host;
    this.port = port;
    this.healthInfo = {
      cluster: {},
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
          this.ipc.server.on('heartbeat', this.onHeartbeat.bind(this));
          this.ipc.server.on('socket.disconnected', this.onSocketDisconnect.bind(this));
          return resolve;
        },
      );
      this.ipc.server.start();
    });
  }

  // for if network separation causes the parent to be the lone server,
  // therefor should downgrade to child process
  checkHeartBeats() {
    const compareDate = Date.now();
    this.intervalID = setInterval(() => {

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
