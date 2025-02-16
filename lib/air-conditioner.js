const API = require('./air-conditioner-api');
const State = require('./state');
const OpMode = require('./op-mode');
const Direction = require('./direction');
const WindLevel = require('./wind-level');
const mapper = require('./mapper');

module.exports = (api) => {
    api.registerAccessory("homebridge-plugin-samsung-air-conditioner2878", "Samsung Air Conditioner", AirConditioner);
};

function AirConditioner(log, config, api) {
    this.log = log;
    this.api = api;
    this.hap = api.hap;  // ✅ Use Homebridge v2 API

    this.name = config["name"];
    this.duid = config["mac"].replace(/:/g, '').replace(/\-/g, '');
    this.api = new API(
        config["ip_address"],
        config["skip_certificate"] === true, 
        this.duid, 
        config["token"], 
        log, 
        config["log_socket_activity"] === true, 
        config["keep_alive"]
    );

    this.debug = config.debug || false;

    this.currentDeviceState = {
        [State.Active]: 'Off',
        [State.TempNow]: 20,
        [State.TempSet]: 16,
        [State.OpMode]: OpMode.Cool,
        [State.Direction]: Direction.Fixed,
        [State.WindLevel]: WindLevel.Auto,
    };
}

AirConditioner.prototype = {
    getServices: function () {
        this.api.connect();
        this.api.on('stateUpdate', this.updateState.bind(this));

        this.acService = new this.hap.Service.HeaterCooler(this.name);

        // ACTIVE STATE
        this.acService
            .getCharacteristic(this.hap.Characteristic.Active)
            .onGet(this.getActive.bind(this))
            .onSet(this.setActive.bind(this));

        // CURRENT TEMPERATURE
        this.acService
            .getCharacteristic(this.hap.Characteristic.CurrentTemperature)
            .setProps({ minValue: 0, maxValue: 100, minStep: 1 })
            .onGet(this.getCurrentTemperature.bind(this));

        // TARGET TEMPERATURE
        this.acService
            .getCharacteristic(this.hap.Characteristic.CoolingThresholdTemperature)
            .setProps({ minValue: 16, maxValue: 30, minStep: 1 })
            .onGet(this.getTargetTemperature.bind(this))
            .onSet(this.setTargetTemperature.bind(this));

        this.acService
            .getCharacteristic(this.hap.Characteristic.HeatingThresholdTemperature)
            .setProps({ minValue: 16, maxValue: 30, minStep: 1 })
            .onGet(this.getTargetTemperature.bind(this))
            .onSet(this.setTargetTemperature.bind(this));

        // TARGET STATE
        this.acService
            .getCharacteristic(this.hap.Characteristic.TargetHeaterCoolerState)
            .onGet(this.getTargetState.bind(this))
            .onSet(this.setTargetState.bind(this));

        // CURRENT STATE
        this.acService
            .getCharacteristic(this.hap.Characteristic.CurrentHeaterCoolerState)
            .onGet(this.getCurrentState.bind(this));

        // SWING MODE
        this.acService
            .getCharacteristic(this.hap.Characteristic.SwingMode)
            .onGet(this.getSwingMode.bind(this))
            .onSet(this.setSwingMode.bind(this));

        // ROTATION SPEED
        this.acService
            .getCharacteristic(this.hap.Characteristic.RotationSpeed)
            .onGet(this.getRotationSpeed.bind(this))
            .onSet(this.setRotationSpeed.bind(this));

        const packageJson = require('../package.json');
        const informationService = new this.hap.Service.AccessoryInformation();
        informationService
            .setCharacteristic(this.hap.Characteristic.SerialNumber, this.duid)
            .setCharacteristic(this.hap.Characteristic.Manufacturer, packageJson.author)
            .setCharacteristic(this.hap.Characteristic.Model, packageJson.name)
            .setCharacteristic(this.hap.Characteristic.FirmwareRevision, packageJson.version);

        return [this.acService, informationService];
    },

    // GETTERS
    async getActive() {
        if (this.debug) this.log('Getting active...');
        return this.currentDeviceState[State.Power] === 'On' ? this.hap.Characteristic.Active.ACTIVE : this.hap.Characteristic.Active.INACTIVE;
    },

    async getCurrentTemperature() {
        if (this.debug) this.log('Getting current temperature...');
        return this.currentDeviceState[State.TempNow];
    },

    async getTargetTemperature() {
        if (this.debug) this.log('Getting target temperature...');
        return this.currentDeviceState[State.TempSet];
    },

    async getTargetState() {
        if (this.debug) this.log('Getting target state...');
        return mapper.targetStateFromOpMode(this.currentDeviceState[State.OpMode]);
    },

    async getCurrentState() {
        return this.currentHeaterCoolerState();
    },

    async getSwingMode() {
        if (this.debug) this.log('Getting swing mode...');
        return this.currentDeviceState[State.Direction] === Direction.SwingUpDown;
    },

    async getRotationSpeed() {
        if (this.debug) this.log('Getting rotation speed...');
        return mapper.rotationSpeedFromWindLevel(this.currentDeviceState[State.WindLevel]);
    },

    // SETTERS
    async setActive(value) {
        this.log('Setting active:', value);
        await this.api.deviceControl(State.Power, value ? "On" : "Off");
    },

    async setTargetTemperature(value) {
        this.log('Setting target temperature:', value);
        await this.api.deviceControl(State.TempSet, value);
    },

    async setTargetState(value) {
        this.log('Setting target state:', value);
        await this.api.deviceControl(State.OpMode, mapper.opModeFromTargetState(value));
    },

    async setSwingMode(value) {
        this.log('Setting swing mode:', value);
        await this.api.deviceControl(State.Direction, value ? Direction.SwingUpDown : Direction.Fixed);
    },

    async setRotationSpeed(value) {
        this.log('Setting rotation speed:', value);
        await this.api.deviceControl(State.WindLevel, mapper.windLevelFromRotationSpeed(value));
    },

    currentHeaterCoolerState: function () {
        const currentTemperature = this.currentDeviceState[State.TempNow];
        const targetTemperature = this.currentDeviceState[State.TempSet];
        const opMode = this.currentDeviceState[State.OpMode];

        if (opMode === OpMode.Cool && currentTemperature > targetTemperature) return this.hap.Characteristic.CurrentHeaterCoolerState.COOLING;
        if (opMode === OpMode.Heat && currentTemperature < targetTemperature) return this.hap.Characteristic.CurrentHeaterCoolerState.HEATING;
        return this.hap.Characteristic.CurrentHeaterCoolerState.IDLE;
    },

    updateState: function (stateUpdate) {
        if (this.debug) this.log("State updated:", JSON.stringify(stateUpdate, Object.values(State)));
        this.currentDeviceState = { ...this.currentDeviceState, ...stateUpdate };
        Object.keys(stateUpdate || {}).forEach((key) => this.updateCharacteristic(key, stateUpdate[key]));
        this.updateDerivedCharacteristics();
    },

    updateCharacteristic: function (name, value) {
        let characteristic;
        let mappedValue;

        switch (name) {
            case State.Power: characteristic = this.hap.Characteristic.Active; mappedValue = value === "On"; break;
            case State.TempNow: characteristic = this.hap.Characteristic.CurrentTemperature; mappedValue = value; break;
            case State.OpMode: characteristic = this.hap.Characteristic.TargetHeaterCoolerState; mappedValue = mapper.targetStateFromOpMode(value); break;
            case State.Direction: characteristic = this.hap.Characteristic.SwingMode; mappedValue = value === Direction.SwingUpDown; break;
            case State.WindLevel: characteristic = this.hap.Characteristic.RotationSpeed; mappedValue = mapper.rotationSpeedFromWindLevel(value); break;
        }

        if (characteristic) this.acService.getCharacteristic(characteristic).updateValue(mappedValue);
    }
};
