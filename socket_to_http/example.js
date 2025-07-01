// 示例：如何通过 HTTP 代理转发到 SOCKS 代理
const { HttpProxyServer } = require('./httpProxy');

// 配置 SOCKS 代理参数
const socksConfig = {
  host: 'ip', // SOCKS 代理服务器地址
  port: 8888,        // SOCKS 代理服务器端口
  type: 'socks5',    // 支持 'socks4' 或 'socks5'
  username: 'xxx',      // 可选，用户名
  password: 'xxx'       // 可选，密码
};

// 启动 HTTP 代理服务器，监听 8888 端口
const httpProxy = new HttpProxyServer(8888, socksConfig);

httpProxy.start().then(() => {
  console.log('HTTP 代理服务器已启动，监听端口 8888');
  console.log('所有流量将通过 SOCKS 代理转发');
}).catch(err => {
  console.error('HTTP 代理服务器启动失败:', err);
});

// 你可以在浏览器或 curl 中设置 HTTP 代理为 127.0.0.1:8888 进行测试 