const net = require('net');

/**
 * SOCKS代理相关工具类，支持SOCKS4/5连接和认证
 */
class SocksProxy {
  /**
   * 创建到目标主机的SOCKS代理连接
   * @param {string} host 目标主机
   * @param {number} port 目标端口
   * @param {object} socksConfig SOCKS代理配置 {host, port, type, username, password}
   * @returns {Promise<net.Socket>}
   */
  static createSocksConnection(host, port, socksConfig) {
    return new Promise((resolve, reject) => {
      console.log('[SOCKS] 尝试连接 SOCKS 代理:', socksConfig.host, socksConfig.port, '目标:', host, port, '类型:', socksConfig.type);
      const socket = new net.Socket();
      socket.connect(socksConfig.port, socksConfig.host, () => {
        console.log('[SOCKS] 已连接到 SOCKS 代理服务器');
        if (socksConfig.type === 'socks5') {
          SocksProxy.performSocks5Handshake(socket, host, port, socksConfig, resolve, reject);
        } else if (socksConfig.type === 'socks4') {
          SocksProxy.performSocks4Handshake(socket, host, port, resolve, reject);
        } else {
          reject(new Error('不支持的SOCKS类型'));
        }
      });
      socket.on('error', (err) => {
        console.error('[SOCKS] 连接 SOCKS 代理服务器失败:', err.stack || err);
        reject(err);
      });
    });
  }

  // SOCKS5 认证方法协商和连接
  static performSocks5Handshake(socket, host, port, socksConfig, resolve, reject) {
    console.log('[SOCKS5] 开始认证协商');
    const authMethods = [0x00]; // 无认证
    if (socksConfig.username && socksConfig.password) {
      authMethods.push(0x02); // 用户名密码认证
    }
    const authBuffer = Buffer.alloc(2 + authMethods.length);
    authBuffer[0] = 0x05;
    authBuffer[1] = authMethods.length;
    authMethods.forEach((method, index) => {
      authBuffer[2 + index] = method;
    });
    socket.write(authBuffer);
    socket.once('data', (data) => {
      console.log('[SOCKS5] 认证协商响应:', data, '长度:', data.length);
      if (data.length >= 2 && data[0] === 0x05) {
        const chosenMethod = data[1];
        console.log('[SOCKS5] 选择的认证方式:', chosenMethod);
        if (chosenMethod === 0x00) {
          SocksProxy.sendSocks5ConnectRequest(socket, host, port, resolve, reject);
        } else if (chosenMethod === 0x02) {
          SocksProxy.performSocks5UserPassAuth(socket, host, port, socksConfig, resolve, reject);
        } else {
          reject(new Error('SOCKS5代理不支持指定的认证方法'));
        }
      } else {
        reject(new Error('SOCKS5代理响应格式错误'));
      }
    });
  }

  // SOCKS5 用户名密码认证
  static performSocks5UserPassAuth(socket, host, port, socksConfig, resolve, reject) {
    console.log('[SOCKS5] 开始用户名密码认证');
    const username = Buffer.from(socksConfig.username, 'utf8');
    const password = Buffer.from(socksConfig.password, 'utf8');
    const authBuffer = Buffer.alloc(3 + username.length + password.length);
    authBuffer[0] = 0x01;
    authBuffer[1] = username.length;
    username.copy(authBuffer, 2);
    authBuffer[2 + username.length] = password.length;
    password.copy(authBuffer, 3 + username.length);
    socket.write(authBuffer);
    socket.once('data', (data) => {
      console.log('[SOCKS5] 用户名密码认证响应:', data, '长度:', data.length);
      if (data.length >= 2 && data[0] === 0x01) {
        const authStatus = data[1];
        console.log('[SOCKS5] 认证状态:', authStatus);
        if (authStatus === 0x00) {
          SocksProxy.sendSocks5ConnectRequest(socket, host, port, resolve, reject);
        } else {
          reject(new Error('SOCKS5代理认证失败'));
        }
      } else {
        reject(new Error('SOCKS5代理认证响应格式错误'));
      }
    });
  }

  // SOCKS5 发送连接请求
  static sendSocks5ConnectRequest(socket, host, port, resolve, reject) {
    console.log('[SOCKS5] 发送连接请求:', host, port);
    const hostBuffer = Buffer.from(host, 'utf8');
    const requestBuffer = Buffer.alloc(7 + hostBuffer.length);
    requestBuffer[0] = 0x05;
    requestBuffer[1] = 0x01;
    requestBuffer[2] = 0x00;
    requestBuffer[3] = 0x03;
    requestBuffer[4] = hostBuffer.length;
    hostBuffer.copy(requestBuffer, 5);
    requestBuffer.writeUInt16BE(port, 5 + hostBuffer.length);
    socket.write(requestBuffer);
    socket.once('data', (data) => {
      console.log('[SOCKS5] 连接响应:', data, '长度:', data.length);
      if (data.length >= 4 && data[0] === 0x05) {
        const reply = data[1];
        console.log('[SOCKS5] 连接响应码:', reply);
        if (reply === 0x00) {
          resolve(socket);
        } else {
          reject(new Error(`SOCKS5代理连接失败，错误码: ${reply}`));
        }
      } else {
        reject(new Error('SOCKS5代理响应格式错误'));
      }
    });
  }

  // SOCKS4 简单连接请求
  static performSocks4Handshake(socket, host, port, resolve, reject) {
    console.log('[SOCKS4] 开始连接:', host, port);
    const hostBuffer = Buffer.from(host, 'utf8');
    const requestBuffer = Buffer.alloc(9 + hostBuffer.length);
    requestBuffer[0] = 0x04;
    requestBuffer[1] = 0x01;
    requestBuffer.writeUInt16BE(port, 2);
    requestBuffer.writeUInt32BE(0, 4);
    requestBuffer[8] = 0x00;
    hostBuffer.copy(requestBuffer, 9);
    requestBuffer[9 + hostBuffer.length] = 0x00;
    socket.write(requestBuffer);
    socket.once('data', (data) => {
      console.log('[SOCKS4] 连接响应:', data, '长度:', data.length);
      if (data.length >= 8 && data[0] === 0x00) {
        const reply = data[1];
        console.log('[SOCKS4] 连接响应码:', reply);
        if (reply === 0x5A) {
          resolve(socket);
        } else {
          reject(new Error(`SOCKS4代理连接失败，错误码: ${reply}`));
        }
      } else {
        reject(new Error('SOCKS4代理响应格式错误'));
      }
    });
  }
}

module.exports = { SocksProxy }; 