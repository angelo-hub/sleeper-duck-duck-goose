import cache from 'memory-cache';

import { ElectionServer } from '../ipc/election.js';
import { ChildConnection } from '../ipc/child.js';
import { ParentTCPServer } from '../ipc/parent.js';
import { getPort } from '../utils/getPort.js';

class Handler {
  constructor({ redis, serverId }) {
    this.redis = redis;
    this.serverId = serverId;
  }

  // this should start the voting functionality
  async createParentTCPServer(electionConfig, election) {
    const port = await getPort();
    const host = 'localhost';
    this.parentTCPServer = new ParentTCPServer({
      host,
      port,
      electionConfig,
      id: this.serverId,
      election,
    });

    cache.put('local', {
      parentHost: host,
      parentPort: port,
      isParent: true,
    });

    await this.redis.setParentHostPort({ host, port, election });

    this.parentTCPServer.start();

    return this.parentTCPServer;
  }

  // centralize the host data so no pre-req of host data is required to scale the server
  async startElectionServer() {
    const port = await getPort();
    const host = 'localhost';
    this.electionServer = new ElectionServer({
      port,
      host,
      id: this.serverId,
      electionWinHook: this.electionWinHook.bind(this),
      onElectionDecidedHook: this.onElectionDecidedHook.bind(this),
    });
    this.electionServer.start();
    return this.electionServer;
  }

  async startChildConnection() {
    const { host, port } = await this.redis.getParentHostPort();
    this.childConnection = new ChildConnection({
      parentSocketID: 'parent',
      host,
      port,
      electionConfig: this.electionServer.config,
      id: this.serverId,
      noParentServer: this.electionServer.sendVoteRequests.bind(this.electionServer),
    });
    this.childConnection.start();
    return Promise.resolve();
  }

  async electionWinHook(election) {
    const server = await this.createParentTCPServer(this.electionServer.config, election);
    await this.redis.setParentHostPort({ host: server.host, port: server.port });
    await this.childConnection.disconnect();
    return { port: server.port, host: server.host };
  }

  async onElectionDecidedHook() {
    const { host, port } = await this.redis.getParentHostPort();
    this.childConnection.reconnect({ host, port });
  }

  async start() {
    await this.startElectionServer();
    await this.startChildConnection();
    return Promise.resolve();
  }
}

export {
  // eslint-disable-next-line no-restricted-exports
  Handler as default,
};
