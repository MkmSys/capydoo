// Для работы в сложных сетевых условиях
const Turn = require('node-turn');

const turnServer = new Turn({
  listeningPort: 3478,
  listeningIps: ['0.0.0.0'],
  externalIps: ['YOUR_PUBLIC_IP'],
  minPort: 49152,
  maxPort: 65535,
  authMech: 'long-term',
  credentials: {
    username: 'password'
  },
  debugLevel: 'INFO'
});

turnServer.start();
console.log('TURN сервер запущен на порту 3478');

module.exports = turnServer;