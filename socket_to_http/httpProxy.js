// HTTP代理服务器管理类
const http = require('http');
const net = require('net');
const { SocksProxy } = require('./socksProxy');

/**
 * HTTP代理服务器，支持将HTTP/HTTPS请求转发到SOCKS代理
 */
class HttpProxyServer {
  constructor(port, socksConfig) {
    this.server = null;
    this.port = port;
    this.socksConfig = socksConfig;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer();
      // 处理HTTP请求
      this.server.on('request', (req, res) => this.handleHttpRequest(req, res));
      // 处理HTTPS CONNECT请求
      this.server.on('connect', (req, clientSocket, head) => this.handleConnectRequest(req, clientSocket, head));
      this.server.listen(this.port, '127.0.0.1', () => {
        console.log(`HTTP代理服务器已启动: 127.0.0.1:${this.port}`);
        resolve();
      });
      this.server.on('error', (error) => {
        console.error(`HTTP代理服务器启动失败: ${error.message}`);
        reject(error);
      });
    });
  }

  handleHttpRequest(req, res) {
    let targetUrl;
    console.log('[HTTP] 收到请求:', req.method, req.url, req.headers);
    let bodyChunks = [];
    req.on('data', chunk => {
      bodyChunks.push(chunk);
    });
    req.on('end', () => {
      const body = Buffer.concat(bodyChunks);
      console.log(`[HTTP] 请求体长度: ${body.length}`);
    });
    if (req.url && (req.url.startsWith('http://') || req.url.startsWith('https://'))) {
      targetUrl = req.url;
    } else {
      const host = req.headers.host;
      if (!host) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('缺少Host头');
        return;
      }
      targetUrl = `https://${host}${req.url || ''}`;
    }
    const parsedUrl = new URL(targetUrl);
    const destHost = parsedUrl.hostname;
    const destPort = parsedUrl.port ? parseInt(parsedUrl.port) : (parsedUrl.protocol === 'https:' ? 443 : 80);
    console.log(`[HTTP] 目标: ${destHost}:${destPort}`);
    SocksProxy.createSocksConnection(destHost, destPort, this.socksConfig).then(socket => {
      console.log('[SOCKS] 连接已建立:', destHost, destPort);
      const requestLine = `${req.method} ${parsedUrl.pathname}${parsedUrl.search || ''} HTTP/1.1\r\n`;
      const headers = Object.keys(req.headers).map(key => `${key}: ${req.headers[key]}`).join('\r\n');
      const httpRequest = requestLine + headers + '\r\n\r\n';
      socket.write(httpRequest);
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        req.pipe(socket);
      }
      let responseLength = 0;
      socket.on('data', chunk => {
        responseLength += chunk.length;
      });
      socket.pipe(res);
      socket.on('end', () => {
        console.log(`[SOCKS] 代理响应结束，总长度: ${responseLength}`);
      });
      socket.on('error', (err) => {
        console.error('[SOCKS] 连接错误:', err.stack || err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('SOCKS代理连接错误: ' + err.message);
        }
      });
      res.on('close', () => {
        console.log('[HTTP] 响应关闭，销毁SOCKS连接');
        socket.destroy();
      });
    }).catch(err => {
      console.error('[SOCKS] 连接失败:', err.stack || err);
      if (parsedUrl.protocol === 'https:' && !req.url?.startsWith('https://')) {
        const httpUrl = `http://${destHost}${parsedUrl.pathname || ''}`;
        const httpParsedUrl = new URL(httpUrl);
        const httpDestPort = httpParsedUrl.port ? parseInt(httpParsedUrl.port) : 80;
        console.log('[SOCKS] 尝试HTTP端口:', httpDestPort);
        SocksProxy.createSocksConnection(destHost, httpDestPort, this.socksConfig).then(socket => {
          console.log('[SOCKS] HTTP端口连接已建立:', destHost, httpDestPort);
          const requestLine = `${req.method} ${httpParsedUrl.pathname}${httpParsedUrl.search || ''} HTTP/1.1\r\n`;
          const headers = Object.keys(req.headers).map(key => `${key}: ${req.headers[key]}`).join('\r\n');
          const httpRequest = requestLine + headers + '\r\n\r\n';
          socket.write(httpRequest);
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            req.pipe(socket);
          }
          let responseLength = 0;
          socket.on('data', chunk => {
            responseLength += chunk.length;
          });
          socket.pipe(res);
          socket.on('end', () => {
            console.log(`[SOCKS] HTTP端口代理响应结束，总长度: ${responseLength}`);
          });
          socket.on('error', (err) => {
            console.error('[SOCKS] HTTP端口连接错误:', err.stack || err);
            if (!res.headersSent) {
              res.writeHead(500, { 'Content-Type': 'text/plain' });
              res.end('SOCKS代理连接错误: ' + err.message);
            }
          });
          res.on('close', () => {
            console.log('[HTTP] 响应关闭，销毁SOCKS连接');
            socket.destroy();
          });
        }).catch(httpErr => {
          console.error('[SOCKS] HTTP端口连接失败:', httpErr.stack || httpErr);
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('SOCKS代理连接失败: ' + httpErr.message);
        });
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('SOCKS代理连接失败: ' + err.message);
      }
    });
  }

  handleConnectRequest(req, clientSocket, head) {
    const [host, port] = req.url.split(':');
    const destPort = port ? parseInt(port) : 443;
    console.log('[CONNECT] 请求:', host, destPort);
    SocksProxy.createSocksConnection(host, destPort, this.socksConfig).then(socket => {
      console.log('[SOCKS] CONNECT 连接已建立:', host, destPort);
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      socket.write(head);
      let pipeBytes = 0;
      clientSocket.on('data', chunk => {
        pipeBytes += chunk.length;
      });
      clientSocket.pipe(socket);
      socket.pipe(clientSocket);
      socket.on('end', () => {
        console.log(`[SOCKS] CONNECT 代理响应结束，pipe总字节: ${pipeBytes}`);
      });
      socket.on('error', (err) => {
        console.error('[SOCKS] CONNECT 连接错误:', err.stack || err);
        clientSocket.destroy();
      });
      clientSocket.on('error', (err) => {
        console.error('[CLIENT] 连接错误:', err.stack || err);
        socket.destroy();
      });
    }).catch(err => {
      console.error('[SOCKS] CONNECT 连接失败:', err.stack || err);
      clientSocket.write('HTTP/1.1 500 Connection Error\r\n\r\n');
      clientSocket.destroy();
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
      console.log(`HTTP代理服务器已停止: 127.0.0.1:${this.port}`);
    }
  }

  getPort() {
    return this.port;
  }
}

module.exports = { HttpProxyServer }; 