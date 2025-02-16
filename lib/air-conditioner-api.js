const events = require('events');
const util = require('util');
const tls = require('tls');
const carrier = require('carrier');
const { nanoid } = require('nanoid');
const keepAlive = require('net-keepalive');
const connectionHelper = require('./connection-helper');

class AirConditionerApi extends events.EventEmitter {
    constructor(ipAddress, skipCertificate, duid, token, log, logSocketActivity, keepAliveConfig) {
        super();
        this.connectionOptions = connectionHelper.createConnectionOptions(ipAddress, skipCertificate, log);
        this.duid = duid;
        this.token = token;
        this.log = log;
        this.logSocketActivity = logSocketActivity;

        this.keepAliveConfig = Object.assign({
            "enabled": true,
            "initial_delay": 10000,
            "interval": 10000,
            "probes": 10
        }, keepAliveConfig);

        log('Keep alive config:', this.keepAliveConfig);
        this.authenticated = false;
        this.controlCallbacks = {};
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.log('Connecting...');

            this.socket = tls.connect(this.connectionOptions, () => {
                this.log('Connected');
                this.socket.setKeepAlive(this.keepAliveConfig.enabled, this.keepAliveConfig.initial_delay);
                keepAlive.setKeepAliveInterval(this.socket, this.keepAliveConfig.interval);
                keepAlive.setKeepAliveProbes(this.socket, this.keepAliveConfig.probes);

                carrier.carry(this.socket, this._readLine.bind(this));
                resolve();
            });

            this.socket
                .on('end', this._connectionEnded.bind(this))
                .on('close', this._connectionClosed.bind(this))
                .on('error', (error) => {
                    this.log('Error occurred:', error.message);
                    reject(error);
                });
        });
    }

    async deviceControl(key, value) {
        if (!this.authenticated) {
            throw new Error('Connection not established');
        }

        const id = nanoid(10);
        return new Promise((resolve, reject) => {
            this.controlCallbacks[id] = (err) => err ? reject(err) : resolve();

            this._send(
                `<Request Type="DeviceControl"><Control CommandID="${id}" DUID="${this.duid}"><Attr ID="${key}" Value="${value}" /></Control></Request>`
            );
        });
    }

    _send(line) {
        if (this.logSocketActivity) {
            this.log('Write:', line);
        }
        this.socket.write(line + "\r\n");
    }

    _readLine(line) {
        if (this.logSocketActivity) {
            this.log('Read:', line);
        }

        if (line.match(/Update Type="InvalidateAccount"/)) {
            this._handleInvalidateAccount();
        } else if (line.match(/Response Type="AuthToken" Status="Okay"/)) {
            this._handleAuthSuccessResponse();
        } else if (line.match(/Update Type="Status"/)) {
            this._handleDeviceStatusUpdate(line);
        } else if (line.match(/Response Type="DeviceState" Status="Okay"/)) {
            this._handleDeviceStateResponse(line);
        } else if (line.match(/Response Type="DeviceControl" Status="Okay"/)) {
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
        attributes.forEach(attr => {
            const matches = attr.match(/Attr ID="(.*)" Type=".*" Value="(.*)"/);
            if (matches) {
                state[matches[1]] = matches[2];
            }
        });
        this.emit('stateUpdate', state);
    }

    _handleDeviceControlResponse(line) {
        const matches = line.match(/CommandID="(.*)"/);
        if (matches) {
            const id = matches[1];
            if (this.controlCallbacks[id]) {
                const callback = this.controlCallbacks[id];
                delete this.controlCallbacks[id];
                callback(null);
            }
        }
    }

    _handleDeviceStatusUpdate(line) {
        const matches = line.match(/Attr ID="(.*)" Value="(.*)"/);
        if (matches) {
            const state = { [matches[1]]: matches[2] };
            this.emit('stateUpdate', state);
        }
    }

    _connectionEnded() {
        this.log('Connection ended');
    }

    _connectionClosed(hadError) {
        this.authenticated = false;
        this.log(`Connection closed${hadError ? ' because an error occurred' : ''}`);
        this.log('Trying to reconnect in 5s...');
        setTimeout(() => this.connect(), 5000);
    }
}

module.exports = AirConditionerApi;
