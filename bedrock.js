const dgram = require('dgram');

// Configuration
const serverAddress = 'ip:port';
const defaultPort = 19132;

// Create a UDP client
const client = dgram.createSocket('udp4');

// Create a Bedrock ping packet
function createBedrockPacket() {
  const packetId = Buffer.from([0x01]); // Ping request packet ID
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigUInt64BE(BigInt(Date.now()), 0); // Timestamp
  const magic = Buffer.from('00ffff00fefefefefdfdfdfd12345678', 'hex'); // Magic number
  const clientGUID = Buffer.alloc(8);
  clientGUID.writeBigUInt64BE(BigInt(Math.floor(Math.random() * 1e15)), 0); // Random GUID
  return Buffer.concat([packetId, timeBuffer, magic, clientGUID]);
}

function readBedrockResponse(buffer) {
  const packetId = buffer.readUInt8(0);
  if (packetId !== 0x1c) { // Response packet ID
    throw new Error('Invalid packet ID');
  }
  const offset = 35; // Skipping the initial 35 bytes
  const serverInfoStr = buffer.slice(offset).toString('utf8');
  const serverInfoParts = serverInfoStr.split(';');
  return {
    edition: serverInfoParts[0],
    motd: serverInfoParts[1],
    protocol: parseInt(serverInfoParts[2], 10),
    version: serverInfoParts[3],
    playersOnline: parseInt(serverInfoParts[4], 10),
    playersMax: parseInt(serverInfoParts[5], 10),
    serverId: serverInfoParts[6],
    worldname: serverInfoParts[7],
    gameMode: serverInfoParts[8],
    nintendoLimited: serverInfoParts[9],
    portIPv4: serverInfoParts[10],
    portIPv6: serverInfoParts[11]
  };
}

function pingBedrockServer(host, port) {
  return new Promise((resolve, reject) => {
    const pingPacket = createBedrockPacket();
    const timeout = setTimeout(() => {
      client.close();
      reject(new Error('Ping timeout'));
    }, 5000);

    client.on('message', (msg) => {
      clearTimeout(timeout);
      try {
        const serverInfo = readBedrockResponse(msg);
        const responseTime = BigInt(Date.now()) - BigInt(msg.readBigUInt64BE(1)); // Calculate latency
        serverInfo.latency = Number(responseTime); // Convert BigInt to Number
        resolve(serverInfo);
      } catch (error) {
        reject(error);
      } finally {
        client.close();
      }
    });

    client.send(pingPacket, 0, pingPacket.length, port, host, (err) => {
      if (err) {
        clearTimeout(timeout);
        client.close();
        reject(err);
      }
    });
  });
}

function parseHostAndPort(input) {
  const [host, port] = input.split(':');
  return {
    host: host,
    port: port ? parseInt(port, 10) : defaultPort
  };
}

function pingServer(input) {
  const { host, port } = parseHostAndPort(input);
  pingBedrockServer(host, port)
    .then(serverInfo => {
      console.log('Server Info:', JSON.stringify(serverInfo, null, 2));
    })
    .catch(error => {
      console.error('Error:', error);
    });
}

// Usage
pingServer(serverAddress);
