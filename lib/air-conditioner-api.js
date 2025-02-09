const events = require('events');
const util = require('util');
const tls = require('tls');
const carrier = require('carrier');
const { nanoid } = require('nanoid');
const keepAlive = require('net-keepalive');
const connectionHelper = require('./connection-helper');

function AirConditionerApi(ipAddress, skipCertificate, duid, token, log, logSocketActivity, keepAliveConfig) {
    this.connectionOptions = connectionHelper.createConnectionOptions(
        ipAddress,
        skipCertificate,
        log
    );
    this.duid = duid;
    this.token = token;
    this.log = log;
    this.logSocketActivity = logSocketActivity;

    const defaultKeepAliveConfig = {
        "enabled": true,
        "initial_delay": 10000,
        "interval": 10000,
        "probes": 10
    }

    this.keepAliveConfig = Object.assign({}, defaultKeepAliveConfig, keepAliveConfig);

    log('Keep alive config:', this.keepAliveConfig);

    this.authenticated = false;
};

AirConditionerApi.prototype = {
    connect: function () {
        this.log('Connecting...');

        this.controlCallbacks = {};

        this.socket = tls.connect(this.connectionOptions, function () {
            this.log('Connected');

            this.socket.setKeepAlive(this.keepAliveConfig.enabled, this.keepAliveConfig.initial_delay);
            keepAlive.setKeepAliveInterval(this.socket, this.keepAliveConfig.interval);
            keepAlive.setKeepAliveProbes(this.socket, this.keepAliveConfig.probes);

            carrier.carry(this.socket, this._readLine.bind(this));
        }.bind(this));

        this.socket
            .on('end', this._connectionEnded.bind(this))
            .on('close', this._connectionClosed.bind(this))
            .on('error', this._errorOccured.bind(this));
    },

    deviceControl: function (key, value, callback) {
        if (!this.authenticated) {
            callback(new Error('Connection not established'));
            return;
        }

        const id = nanoid();

        if (!!callback) {
            this.controlCallbacks[id] = callback;
        }

        this._send(
            '<Request Type="DeviceControl"><Control CommandID="' + id + '" DUID="' + this.duid + '"><Attr ID="' + key + '" Value="' + value + '" /></Control></Request>'
        );
    },

    _send: function (line) {
        if (this.logSocketActivity) { this.log('Write:', line); }
        this.socket.write(line + "\r\n");
    },

    _readLine: function (line) {
        if (this.logSocketActivity) { this.log('Read:', line); }
        
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
        };
    },

    _handleInvalidateAccount: function() {
        this.log("Auth request received - Authenticating...");
        this._send('<Request Type="AuthToken"><User Token="' + this.token + '"/></Request>');
    },

    _handleAuthSuccessResponse: function() {
        this.log("Authentication succeeded");
        this.authenticated = true;
        this.log("Requesting full state summary...");
        this._send('<Request Type="DeviceState" DUID="' + this.duid + '"></Request>');
    },

    _handleDeviceStateResponse: function (line) {
        this.log("Full state summary received");
        const attributes = line.split("><");
        const state = {};
        attributes.forEach(function (attr) {
            if ((matches = attr.match(/Attr ID="(.*)" Type=".*" Value="(.*)"/))) {
                const id = matches[1];
                state[id] = matches[2];
            }
        }.bind(this));
        this.emit('stateUpdate', state);
    },

    _handleDeviceControlResponse: function (line) {
        if ((matches = line.match(/CommandID="(.*)"/))) {
            id = matches[1];
            if (!this.controlCallbacks[id]) return;
            callback = this.controlCallbacks[id];
            delete (this.controlCallbacks[id]);
            callback(null);
        }
    },

    _errorOccured: function(error) {
        this.log('Error occured:', error.message);
        Object.keys(this.controlCallbacks).forEach(function(id) {
            this.controlCallbacks[id](error);
        }.bind(this));
        this.controlCallbacks = {};
    }
};

util.inherits(AirConditionerApi, events.EventEmitter);
module.exports = AirConditionerApi;
