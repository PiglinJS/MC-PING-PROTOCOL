/*
MIT License

Copyright (c) 2024 PiglinJS

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
const net = require('net');
const dns = require('dns');

// Configuration
const serverAddress = 'serverip:port';
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

function readVarInt(buffer, offset) {
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
  return [value, offset];
}

function connectToServer(host, port) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let buffer = Buffer.alloc(0);
    let serverInfo;
    let pingStartTime;

    client.connect(port, host, () => {
      console.log(`Connected to ${host}:${port}`);
      const hostBuffer = Buffer.from(host, 'utf8');
      const portBuffer = Buffer.alloc(2);
      portBuffer.writeUInt16BE(port, 0);
      const handshakeData = Buffer.concat([
        createVarInt(-1),
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
      try {
        let offset = 0;
        let [length, newOffset] = readVarInt(buffer, offset);
        offset = newOffset;
        if (buffer.length >= offset + length) {
          let [packetId, newOffset] = readVarInt(buffer, offset);
          offset = newOffset;
          if (packetId === 0x00) {
            let [jsonLength, newOffset] = readVarInt(buffer, offset);
            offset = newOffset;
            const jsonResponse = buffer.slice(offset, offset + jsonLength).toString('utf8');
            serverInfo = JSON.parse(jsonResponse);
            // Send ping packet
            const pingPacket = createPacket(0x01, Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]));
            pingStartTime = process.hrtime.bigint();
            client.write(pingPacket);
            buffer = buffer.slice(offset + jsonLength);
          } else if (packetId === 0x01) {
            const latency = Number(process.hrtime.bigint() - pingStartTime) / 1e6;
            serverInfo.latency = Math.round(latency);
            resolve(serverInfo);
            client.destroy();
          }
        }
      } catch (e) {
        reject(e);
      }
    });

    client.on('error', (err) => {
      reject(err);
    });

    client.on('close', () => {
      console.log('Connection closed');
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

  return new Promise((resolve, reject) => {
    dns.resolveSrv(`_minecraft._tcp.${host}`, (err, addresses) => {
      if (err || addresses.length === 0) {
        console.log(`Using host: ${host} and port: ${port}`);
        connectToServer(host, port).then(resolve).catch(reject);
      } else {
        const address = addresses[0];
        console.log(`Resolved SRV: ${address.name}:${address.port}`);
        connectToServer(address.name, address.port).then(resolve).catch(reject);
      }
    });
  });
}

// Usage
pingServer(serverAddress)
  .then(serverInfo => {
    console.log('Server Info:', JSON.stringify(serverInfo, null, 2));
  })
  .catch(error => {
    console.error('Error:', error);
  });
