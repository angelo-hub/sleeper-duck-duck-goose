import { createClient } from 'redis';

class Redis {
  constructor(config = {}) {
    this.client = createClient(config);
  }

  async getParentHostPort() {
    const port = await this.client.get('parent:port');
    const host = await this.client.get('parent:host');
    return {
      port,
      host,
    };
  }

  async setParentHostPort({ host, port }) {
    this.client.set('parent:host', host);
    this.client.set('parent:port', port);
  }

  // TODO: add config support
  async start() {
    this.client.on('error', (err) => console.log('Redis Client Error', err));

    await this.client.connect();
  }
}

const singleton = new Redis();

export {
  // eslint-disable-next-line no-restricted-exports
  singleton as default,
  Redis,
};
