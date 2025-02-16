const API = require('./air-conditioner-api');
const State = require('./state');
const OpMode = require('./op-mode');
const Direction = require('./direction');
const WindLevel = require('./wind-level');
const mapper = require('./mapper');

var Service, Characteristic;

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    mapper.setCharacteristic(Characteristic);

    homebridge.registerAccessory("homebridge-plugin-samsung-air-conditioner2878", "Samsung Air Conditioner", AirConditioner);
};

function AirConditioner(log, config) {
    this.log = log;
    this.name = config["name"];
    this.duid = config["mac"].replace(/:/g, '').replace(/-/g, '');
    this.api = new API(
        config["ip_address"],
        config["skip_certificate"] === true, 
        this.duid, 
        config["token"], 
        log, 
        config["log_socket_activity"] === true, 
        config["keep_alive"]
    );

    this.debug = config.debug || false; // Enable debug logging if set in config.json

    this.currentDeviceState = {};

    // Set initial state. Prevents null values if getters are called before first connection.
    this.currentDeviceState[State.Power] = 'Off';
    this.currentDeviceState[State.TempNow] = 20;
    this.currentDeviceState[State.TempSet] = 16;
    this.currentDeviceState[State.OpMode] = OpMode.Cool;
    this.currentDeviceState[State.Direction] = Direction.Fixed;
    this.currentDeviceState[State.WindLevel] = WindLevel.Auto;

    this.api.on('stateUpdate', this.updateState.bind(this));
}

AirConditioner.prototype = {
    getServices: function () {
        this.api.connect();

        this.acService = new Service.HeaterCooler(this.name);

        // ACTIVE STATE
        this.acService
            .getCharacteristic(Characteristic.Active)
            .on('get', this.getActive.bind(this))
            .on('set', this.setActive.bind(this));

        // CURRENT TEMPERATURE
        this.acService
            .getCharacteristic(Characteristic.CurrentTemperature)
            .setProps({ minValue: 0, maxValue: 100, minStep: 1 })
            .on('get', this.getCurrentTemperature.bind(this));

        // TARGET TEMPERATURE
        this.acService
            .getCharacteristic(Characteristic.CoolingThresholdTemperature)
            .setProps({ minValue: 16, maxValue: 30, minStep: 1 })
            .on('get', this.getTargetTemperature.bind(this))
            .on('set', this.setTargetTemperature.bind(this));

        this.acService
            .getCharacteristic(Characteristic.HeatingThresholdTemperature)
            .setProps({ minValue: 16, maxValue: 30, minStep: 1 })
            .on('get', this.getTargetTemperature.bind(this))
            .on('set', this.setTargetTemperature.bind(this));

        // TARGET STATE
        this.acService
            .getCharacteristic(Characteristic.TargetHeaterCoolerState)
            .on('get', this.getTargetState.bind(this))
            .on('set', this.setTargetState.bind(this));

        // CURRENT STATE
        this.acService
            .getCharacteristic(Characteristic.CurrentHeaterCoolerState)
            .on('get', this.getCurrentState.bind(this));

        // SWING MODE
        this.acService
            .getCharacteristic(Characteristic.SwingMode)
            .on('get', this.getSwingMode.bind(this))
            .on('set', this.setSwingMode.bind(this));

        // ROTATION SPEED
        this.acService
            .getCharacteristic(Characteristic.RotationSpeed)
            .on('get', this.getRotationSpeed.bind(this))
            .on('set', this.setRotationSpeed.bind(this));

        const packageData = require('../package.json');
        const informationService = new Service.AccessoryInformation();
        informationService
            .setCharacteristic(Characteristic.SerialNumber, this.duid)
            .setCharacteristic(Characteristic.Manufacturer, packageData.author || "Unknown")
            .setCharacteristic(Characteristic.Model, packageData.name)
            .setCharacteristic(Characteristic.FirmwareRevision, packageData.version);

        return [this.acService, informationService];
    },

    // GETTERS
    getActive: function (callback) {
        this.log('🔎 [INFO] Getting active status...');
        callback(null, this.currentDeviceState[State.Power] === 'On');
    },

    getCurrentTemperature: function (callback) {
        this.log('🌡️ [INFO] Getting current temperature...');
        callback(null, this.currentDeviceState[State.TempNow]);
    },

    getTargetTemperature: function (callback) {
        this.log('🎯 [INFO] Getting target temperature...');
        callback(null, this.currentDeviceState[State.TempSet]);
    },

    getTargetState: function (callback) {
        this.log('🔄 [INFO] Getting target state...');
        callback(null, mapper.targetStateFromOpMode(this.currentDeviceState[State.OpMode]));
    },

    getCurrentState: function (callback) {
        callback(null, this.currentHeaterCoolerState());
    },

    getSwingMode: function (callback) {
        this.log('🔁 [INFO] Getting swing mode...');
        callback(null, this.currentDeviceState[State.Direction] === Direction.SwingUpDown);
    },

    getRotationSpeed: function (callback) {
        this.log('⚙️ [INFO] Getting rotation speed...');
        callback(null, mapper.rotationSpeedFromWindLevel(this.currentDeviceState[State.WindLevel]));
    },

    // SETTERS
    setActive: function (isActive, callback) {
        this.log(`🔘 [INFO] Setting active: ${isActive}`);
        this.api.deviceControl(State.Power, isActive ? "On" : "Off", callback);
    },

    setTargetTemperature: function (temperature, callback) {
        this.log(`🌡️ [INFO] Setting target temperature: ${temperature}`);
        this.api.deviceControl(State.TempSet, temperature, callback);
    },

    setTargetState: function (state, callback) {
        this.log(`🎯 [INFO] Setting target state: ${state}`);
        this.api.deviceControl(State.OpMode, mapper.opModeFromTargetState(state), callback);
    },

    setSwingMode: function (enabled, callback) {
        this.log(`🔁 [INFO] Setting swing mode: ${enabled}`);
        this.api.deviceControl(State.Direction, enabled ? Direction.SwingUpDown : Direction.Fixed, callback);
    },

    setRotationSpeed: function (speed, callback) {
        this.log(`⚙️ [INFO] Setting rotation speed: ${speed}`);
        this.api.deviceControl(State.WindLevel, mapper.windLevelFromRotationSpeed(speed), callback);
    },

    currentHeaterCoolerState: function() {
        const currentTemp = this.currentDeviceState[State.TempNow];
        const targetTemp = this.currentDeviceState[State.TempSet];
        const opMode = this.currentDeviceState[State.OpMode];

        if (opMode === OpMode.Cool) {
            return currentTemp > targetTemp ? Characteristic.CurrentHeaterCoolerState.COOLING : Characteristic.CurrentHeaterCoolerState.IDLE;
        }
        if (opMode === OpMode.Heat) {
            return currentTemp < targetTemp ? Characteristic.CurrentHeaterCoolerState.HEATING : Characteristic.CurrentHeaterCoolerState.IDLE;
        }
        return Characteristic.CurrentHeaterCoolerState.IDLE;
    },

    // Optimized updateState to avoid unnecessary updates
    updateState: function (stateUpdate) {
        if (!stateUpdate || Object.keys(stateUpdate).length === 0) {
            this.log("⚠️ [WARN] Received empty state update.");
            return;
        }

        // Check if the state actually changed before updating
        let hasChanges = false;
        for (let key in stateUpdate) {
            if (this.currentDeviceState[key] !== stateUpdate[key]) {
                hasChanges = true;
                break;
            }
        }

        if (!hasChanges) {
            this.log("🔄 [INFO] Ignoring duplicate state update.");
            return;
        }

        this.log("🔄 [INFO] State updated:", JSON.stringify(stateUpdate));
        this.currentDeviceState = { ...this.currentDeviceState, ...stateUpdate };
    }
};
