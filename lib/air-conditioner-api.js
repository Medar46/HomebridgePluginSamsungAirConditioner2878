const EventEmitter = require('events');
const tls = require('tls');
const carrier = require('carrier');
const { nanoid } = require('nanoid');
const keepAlive = require('net-keepalive');
const connectionHelper = require('./connection-helper');

class AirConditionerApi extends EventEmitter {
  constructor(ipAddress, skipCertificate, duid, token, log, logSocketActivity, keepAliveConfig = {}) {
    super();
    this.connectionOptions = connectionHelper.createConnectionOptions(ipAddress, skipCertificate, log);
    this.duid = duid;
    this.token = token;
    this.log = log;
    this.logSocketActivity = logSocketActivity;

    const defaultKeepAliveConfig = {
      enabled: true,
      initial_delay: 10000,
      interval: 10000,
      probes: 10
    };

    this.keepAliveConfig = { ...defaultKeepAliveConfig, ...keepAliveConfig };
    this.log('Keep alive config:', this.keepAliveConfig);
    this.authenticated = false;
  }

  connect() {
    this.log('Connecting...');
    this.controlCallbacks = {};

    this.socket = tls.connect(this.connectionOptions, () => {
      this.log('Connected');

      this.socket.setKeepAlive(this.keepAliveConfig.enabled, this.keepAliveConfig.initial_delay);
      keepAlive.setKeepAliveInterval(this.socket, this.keepAliveConfig.interval);
      keepAlive.setKeepAliveProbes(this.socket, this.keepAliveConfig.probes);

      // Process incoming data line by line
      carrier.carry(this.socket, this._readLine.bind(this));
    });

    this.socket
      .on('end', () => this._connectionEnded())
      .on('close', (hadError) => this._connectionClosed(hadError))
      .on('error', (error) => this._errorOccured(error));
  }

  deviceControl(key, value, callback) {
    if (!this.authenticated) {
      callback(new Error('Connection not established'));
      return;
    }

    // Generate a unique command ID
    const id = nanoid(10);
    if (callback) {
      this.controlCallbacks[id] = callback;
    }

    const request = `<Request Type="DeviceControl"><Control CommandID="${id}" DUID="${this.duid}"><Attr ID="${key}" Value="${value}" /></Control></Request>`;
    this._send(request);
  }

  _send(line) {
    if (this.logSocketActivity) {
      this.log('Write:', line);
    }
    this.socket.write(`${line}\r\n`);
  }

  _readLine(line) {
    if (this.logSocketActivity) {
      this.log('Read:', line);
    }

    if (/Update Type="InvalidateAccount"/.test(line)) {
      this._handleInvalidateAccount();
    } else if (/Response Type="AuthToken" Status="Okay"/.test(line)) {
      this._handleAuthSuccessResponse();
    } else if (/Update Type="Status"/.test(line)) {
      this._handleDeviceStatusUpdate(line);
    } else if (/Response Type="DeviceState" Status="Okay"/.test(line)) {
      this._handleDeviceStateResponse(line);
    } else if (/Response Type="DeviceControl" Status="Okay"/.test(line)) {
      this._handleDeviceControlResponse(line);
    }
  }

  _handleInvalidateAccount() {
    this.log("Auth request received - Authenticating...");
    this._send(`<Request Type="AuthToken"><User Token="${this.token}"/></Request>`);
  }

  _handleAuthSuccessResponse() {
    this.log("Authentication succeeded");
    this.authenticated = true;
    this.log("Requesting full state summary...");
    this._send(`<Request Type="DeviceState" DUID="${this.duid}"></Request>`);
  }

  _handleDeviceStateResponse(line) {
    this.log("Full state summary received");

    const attributes = line.split("><");
    const state = {};
    attributes.forEach((attr) => {
      const matches = attr.match(/Attr ID="(.*)" Type=".*" Value="(.*)"/);
      if (matches) {
        const id = matches[1];
        state[id] = matches[2];
      }
    });

    this.emit('stateUpdate', state);
  }

  _handleDeviceControlResponse(line) {
    const matches = line.match(/CommandID="(.*)"/);
    if (matches) {
      const id = matches[1];
      if (!this.controlCallbacks[id]) return;
      const callback = this.controlCallbacks[id];
      delete this.controlCallbacks[id];
      callback(null);
    }
  }

  _handleDeviceStatusUpdate(line) {
    const matches = line.match(/Attr ID="(.*)" Value="(.*)"/);
    if (matches) {
      const state = { [matches[1]]: matches[2] };
      this.emit('stateUpdate', state);
    }
  }

  _errorOccured(error) {
    this.log('Error occured:', error.message);
    // Notify all pending callbacks about the error
    Object.keys(this.controlCallbacks).forEach((id) => {
      this.controlCallbacks[id](error);
    });
    this.controlCallbacks = {};
  }

  _connectionEnded() {
    this.log('Connection ended');
  }

  _connectionClosed(hadError) {
    this.authenticated = false;
    this.log(`Connection closed${hadError ? ' because error occured' : ''}`);
    this.log('Trying to reconnect in 5s...');
    setTimeout(() => this.connect(), 5000);
  }
}

module.exports = AirConditionerApi;
