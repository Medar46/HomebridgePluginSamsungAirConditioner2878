const events = require('events');
const tls = require('tls');
const connectionHelper = require('./connection-helper');

function AirConditionerApi(ipAddress, skipCertificate, duid, token, log, logSocketActivity, keepAlive) {
    this.ipAddress = ipAddress;
    this.skipCertificate = skipCertificate;
    this.duid = duid;
    this.token = token;
    this.log = log;
    this.debug = logSocketActivity; // Debug mode toggle
    this.retryAttempts = 0;

    this.connectionOptions = connectionHelper.createConnectionOptions(ipAddress, skipCertificate, log);

    this.connect();
}

// Extend EventEmitter to allow event-based communication
AirConditionerApi.prototype = Object.create(events.EventEmitter.prototype);
AirConditionerApi.prototype.constructor = AirConditionerApi;

AirConditionerApi.prototype.connect = function () {
    if (this.socket && !this.socket.destroyed) {
        this.log('🔄 [INFO] Already connected. Skipping reconnection.');
        return;
    }

    this.log('🔗 [INFO] Connecting to Samsung AC...');

    this.socket = tls.connect(this.connectionOptions, () => {
        this.retryAttempts = 0;
        this.log('✅ [INFO] Successfully connected to Samsung AC.');
        this.emit('connected');
    });

    this.socket.on('error', (err) => {
        this.log(`❌ [ERROR] Connection error: ${err.message}`);

        if (this.retryAttempts < 3) {
            this.retryAttempts++;
            this.log(`🔄 [INFO] Retrying connection (${this.retryAttempts}/3)...`);
            setTimeout(() => this.connect(), 5000);
        } else {
            this.log('🚨 [ERROR] Maximum retry attempts reached. Check your AC connection.');
        }
    });

    this.socket.on('end', () => {
        this.log('⚠️ [WARN] Connection ended unexpectedly. Reconnecting...');
        setTimeout(() => this.connect(), 5000);
    });

    this.socket.on('data', (data) => {
        this.handleResponse(data.toString());
    });
};

// Handles incoming data from the AC
AirConditionerApi.prototype.handleResponse = function (data) {
    this.log(`📥 [DEBUG] Received data: ${data}`);

    if (data.includes('Update Type="InvalidateAccount"')) {
        this._send('<Request Type="GetToken" />');
    } else if (data.includes('Response Type="GetToken" Status="Ready"')) {
        this.log('🔑 [INFO] Power on the device within the next 30 seconds to authenticate.');
    } else if (data.includes('Response Status="Fail" Type="Authenticate" ErrorCode="301"')) {
        this.log('🚨 [ERROR] Authentication failed: Invalid token or credentials.');
        this.emit('error', new Error('Authentication failed'));
    }

    const tokenMatch = data.match(/Token="(.*)"/);
    if (tokenMatch) {
        this.log('✅ [INFO] Successfully retrieved authentication token.');
        this.emit('token', tokenMatch[1]);
    }
};

// Sends commands to the AC
AirConditionerApi.prototype.deviceControl = function (stateKey, value, callback) {
    if (!this.socket || this.socket.destroyed) {
        this.log('⚠️ [WARN] Cannot send command: No active connection.');
        return callback(new Error('No active connection to AC.'));
    }

    const command = `<Request Type="DeviceControl"><Control Command="${stateKey}" Value="${value}" /></Request>\r\n`;
    
    // Prevent sending duplicate commands
    if (this.lastCommand === command) {
        this.log("🔄 [INFO] Ignoring duplicate command:", command);
        return callback(null);
    }
    this.lastCommand = command;

    this.log(`📤 [INFO] Sending command: ${command}`);
    this.socket.write(command, (err) => {
        if (err) {
            this.log('❌ [ERROR] Error sending command:', err);
            return callback(err);
        }

        this.log('✅ [INFO] Command sent successfully.');
        callback(null);
    });
};

// Sends data to the AC
AirConditionerApi.prototype._send = function (command) {
    if (this.debug) this.log(`📤 [DEBUG] Writing to AC: ${command}`);
    this.socket.write(command + "\r\n");
};

// Closes the connection properly
AirConditionerApi.prototype.disconnect = function () {
    if (this.socket) {
        this.log('🔌 [INFO] Disconnecting from AC...');
        this.socket.end();
    }
};

module.exports = AirConditionerApi;
