const net = require('net');

// Host and port for the Minecraft server
const host = 'mc.hypixel.net';
const port = 25565;

// Create a new TCP socket
const client = new net.Socket();

// Helper function to create a VarInt (variable-length integer) buffer
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

// Helper function to create a packet buffer
function createPacket(id, data) {
  const idBuffer = createVarInt(id);
  const lengthBuffer = createVarInt(idBuffer.length + data.length);
  return Buffer.concat([lengthBuffer, idBuffer, data]);
}

let buffer = Buffer.alloc(0);

// Connect to the server
client.connect(port, host, () => {
  console.log(`Connected to ${host}:${port}`);

  // Handshake packet
  const hostBuffer = Buffer.from(host, 'utf8');
  const portBuffer = Buffer.alloc(2);
  portBuffer.writeUInt16BE(port, 0);
  const handshakeData = Buffer.concat([
    createVarInt(47), // Protocol version
    createVarInt(hostBuffer.length),
    hostBuffer,
    portBuffer,
    createVarInt(1) // Next state: status
  ]);
  const handshakePacket = createPacket(0x00, handshakeData);
  client.write(handshakePacket);

  // Status request packet
  const statusRequestPacket = createPacket(0x00, Buffer.alloc(0));
  client.write(statusRequestPacket);
});

// Receive data from the server
client.on('data', (data) => {
  buffer = Buffer.concat([buffer, data]);

  let offset = 0;

  // Read length of the packet
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
    const length = readVarInt(); // Length of the packet

    if (buffer.length >= offset + length) {
      const packetId = readVarInt(); // Packet ID

      if (packetId === 0x00) {
        const jsonLength = readVarInt();
        const jsonResponse = buffer.toString('utf8', offset, offset + jsonLength);
        const serverInfo = JSON.parse(jsonResponse);
        console.log('Server Info:', JSON.stringify(serverInfo, null, 2));
        client.destroy(); // Close the connection after receiving the server info
      }
    }
  } catch (e) {
    console.error('Error parsing packet:', e);
  }
});

// Handle errors
client.on('error', (err) => {
  console.error('Error:', err);
});

// Handle connection close
client.on('close', () => {
  console.log('Connection closed');
});
