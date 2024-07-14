const net = require('net');
const dns = require('dns');

const host = 'mc.hypixel.net';
const defaultPort = 25565;

function createVarInt(value) {
  const bytes = [];
  while (true) {
    if ((value & 0xffffff80) === 0) {
      bytes.push(value);
      return Buffer.from(bytes);
    }
    bytes.push(value & 0x7f | 0x80);
    value >>>= 7;
  }
}

function createPacket(id, data) {
  const idBuffer = createVarInt(id);
  const lengthBuffer = createVarInt(idBuffer.length + data.length);
  return Buffer.concat([lengthBuffer, idBuffer, data]);
}

let buffer = Buffer.alloc(0);

function connectToServer(host, port) {
  const client = new net.Socket();

  client.connect(port, host, () => {
    console.log(`Connected to ${host}:${port}`);

    const hostBuffer = Buffer.from(host, 'utf8');
    const portBuffer = Buffer.alloc(2);
    portBuffer.writeUInt16BE(port, 0);
    const handshakeData = Buffer.concat([
      createVarInt(47),
      createVarInt(hostBuffer.length),
      hostBuffer,
      portBuffer,
      createVarInt(1)
    ]);
    const handshakePacket = createPacket(0x00, handshakeData);
    client.write(handshakePacket);

    const statusRequestPacket = createPacket(0x00, Buffer.alloc(0));
    client.write(statusRequestPacket);
  });

  client.on('data', (data) => {
    buffer = Buffer.concat([buffer, data]);

    let offset = 0;

    function readVarInt() {
      let value = 0;
      let size = 0;
      let byte;
      do {
        byte = buffer[offset++];
        value |= (byte & 0x7f) << (size++ * 7);
        if (size > 5) {
          throw new Error('VarInt is too big');
        }
      } while (byte & 0x80);
      return value;
    }

    try {
      const length = readVarInt();

      if (buffer.length >= offset + length) {
        const packetId = readVarInt();

        if (packetId === 0x00) {
          const jsonLength = readVarInt();
          const jsonResponse = buffer.toString('utf8', offset, offset + jsonLength);
          const serverInfo = JSON.parse(jsonResponse);
          console.log('Server Info:', JSON.stringify(serverInfo, null, 2));
          client.destroy();
        }
      }
    } catch (e) {
      console.error('Error parsing packet:', e);
    }
  });

  client.on('error', (err) => {
    console.error('Error:', err);
  });

  client.on('close', () => {
    console.log('Connection closed');
  });
}

dns.resolveSrv(`_minecraft._tcp.${host}`, (err, addresses) => {
  if (err) {
    console.error('Failed to resolve SRV records:', err);
    connectToServer(host, defaultPort);
  } else if (addresses.length > 0) {
    const address = addresses[0];
    console.log(`Resolved SRV: ${address.name}:${address.port}`);
    connectToServer(address.name, address.port);
  } else {
    console.error('No SRV records found');
    connectToServer(host, defaultPort);
  }
});
