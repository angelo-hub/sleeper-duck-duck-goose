import { IPCModule } from 'node-ipc';
import _ from 'lodash';
import cache from 'memory-cache';

// voting solution based on https://medium.com/geekculture/raft-consensus-algorithm-and-leader-election-in-mongodb-vs-coachroachdb-19b767c87f95

class ElectionServer {
  constructor({
    port, host, id, electionWinHook, onElectionDecidedHook,
  } = {}) {
    this.ipc = new IPCModule();
    this.bootstrapServer();
    this.port = port;
    this.host = host;
    this.id = id;
    this.voteHistory = {};
    this.electionResults = {};
    this.electionWinHook = electionWinHook;
    this.onElectionDecidedHook = onElectionDecidedHook;
  }

  get config() {
    return {
      port: this.port,
      host: this.host,
      address: `${this.host}:${this.port}`,
    };
  }

  bootstrapServer() {
    this.ipc.config.id = 'election';
    this.ipc.config.retry = 1500;
    // in order to intercommunicate P2P when a goose goes down. UDP4 is required to solicit votes
  }

  connect() {
    this.ipc.serveNet(
      this.host,
      this.port,
      'udp4',
      () => {
        this.ipc.server.on('connect', this.onConnect.bind(this));
        this.ipc.server.on('election:voteRequest', this.getVoteRequest.bind(this));
        this.ipc.server.on('election:submitVote', this.onSubmitVote.bind(this));
        this.ipc.server.on('election:won', this.onElectionWonNotification.bind(this));
        this.ipc.server.on(
          'election:new',
          (data, socket) => {
            this.ipc.server.emit(
              socket,
              'message',
              {
                from: this.ipc.config.id,
                message: `${data.message} world!`,
              },
            );
          },
        );
      },
    );
  }

  getVoteRequest({ election, candidate: { id, host, port } }) {
    if (!this.voteHistory[election]) {
      this.voteHistory[election] = id;
    }
    const candidate = this.voteHistory[election];
    this.voteHistory[election] = id;
    this.ipc.server.emit(
      {
        address: host, // any hostname will work
        port,
      },
      'election:submitVote',
      {
        from: this.id,
        candidate,
        election,
      },
    );
  }

  onSubmitVote({ candidate, from, election: ballotElection }) {
    const { elections, cluster = [this.id] } = cache.get('healthInfo') || {};
    const localElection = elections + 1;
    if (localElection < ballotElection) {
      return;
    }
    if (!this.electionResults[candidate]) {
      this.electionResults[candidate] = [];
    }
    this.electionResults[candidate].push(from);
    if (_.size(cluster) === this.electionResultsLength) {
      const { winner } = this.getElectionResultsWinner(cluster);
      if (winner === this.id) {
        this.onElectionWin(localElection);
      }
    }
  }

  resetElectionValues() {
    this.electionResults = {};
  }

  // get the winner and number of votes
  getElectionResultsWinner(cluster) {
    return _.reduce(this.electionResults, (result, votes, key) => {
      const newResult = result;
      if (votes.length > newResult.votes) {
        newResult.votes = votes.length;
        newResult.winner = key;
      } else if (votes.length === newResult.votes) {
        newResult.winner = ElectionServer.pickTieBreaker(cluster, result.winner, key);
      }
      return newResult;
    }, { votes: 0, winner: '' });
  }

  static pickTieBreaker(cluster, winner1, winner2) {
    const { lastHeartbeat: winner1LastHeartBeat } = _.find(cluster, { id: winner1 });
    const { lastHeartbeat: winner2LastHeartBeat } = _.find(cluster, { id: winner2 });
    if (winner1LastHeartBeat > winner2LastHeartBeat) {
      return winner1;
    }
    return winner2;
  }

  // utility to get total votes
  get electionResultsLength() {
    return _.reduce(this.electionResults, (sum, votes) => votes.length + sum, 0);
  }

  // when starting the voting process this server must vote for itself
  voteForSelf(election) {
    this.onSubmitVote({ candidate: this.id, from: this.id, election });
  }

  async onElectionWin() {
    const { elections = 0, cluster = {} } = cache.get('healthInfo') || {};
    const election = elections + 1;
    console.log('ELECTION RESULTS:');
    console.table(_.reduce(
      this.electionResults,
      (acc, value, candidate) => ({ ...acc, [candidate]: value.length }),
      {},
    ));
    this.resetElectionValues();
    if (_.isFunction(this.electionWinHook)) {
      await this.electionWinHook(election);
      this.notifyClusterOfWinner(cluster, election);
    }
  }

  async onElectionWonNotification() {
    this.resetElectionValues();
    if (_.isFunction(this.onElectionDecidedHook)) {
      await this.onElectionDecidedHook();
    }
  }

  notifyClusterOfWinner(cluster, election) {
    _.forEach(cluster, ({ host, port, id }) => {
      if (this.id !== id) {
        this.ipc.server.emit(
          {
            address: host, // any hostname will work
            port,
          },
          'election:won',
          {
            winner: {
              id: this.id,
            },
            election,
          },
        );
      }
    });
  }

  sendVoteRequests() {
    const { elections = 0, cluster = {}, offline = {} } = cache.get('healthInfo') || {};
    const election = elections + 1;
    this.voteForSelf(election);
    // knowingly not ack'ing for a callback on emit
    _.forEach({ ...cluster, ...offline }, ({ host, port, id }) => {
      if (this.id !== id) {
        this.ipc.server.emit(
          {
            address: host, // any hostname will work
            port,
          },
          'election:voteRequest',
          {
            candidate: {
              id: this.id,
              host: this.host,
              port: this.port,
            },
            election,
          },
        );
      }
    });
  }

  async onConnect() {
    console.log(`election server running on: ${this.id}`);
  }

  async start() {
    this.connect();
    await this.ipc.server.start();
  }
}

const singleton = new ElectionServer();

export {
  // eslint-disable-next-line no-restricted-exports
  singleton as default,
  ElectionServer,
};
