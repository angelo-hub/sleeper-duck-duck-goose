/* eslint-disable no-plusplus */
/* eslint-disable no-promise-executor-return */
/* eslint-disable no-cond-assign */
/* eslint-disable no-param-reassign */
import { createServer } from 'net';

// code from https://gist.github.com/mikeal/1840641 and linted
function getPort(port = 0) {
  const server = createServer();
  return new Promise((resolve, reject) => server
    .on('error', (error) => (error.code === 'EADDRINUSE' ? server.listen(++port) : reject(error)))
    .on('listening', () => {
      const listenPort = server.address().port;
      server.close(() => resolve(listenPort));
    })
    .listen(port));
}

export {
  // eslint-disable-next-line no-restricted-exports
  getPort as default,
  getPort,
};
