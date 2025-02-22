const API = require('./air-conditioner-api');
const State = require('./state');
const OpMode = require('./op-mode');
const Direction = require('./direction');
const WindLevel = require('./wind-level');
const mapper = require('./mapper');

let Service, Characteristic;

module.exports = (homebridge) => {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  mapper.setCharacteristic(Characteristic);

  homebridge.registerAccessory(
    "homebridge-plugin-samsung-air-conditioner2878",
    "Samsung Air Conditioner",
    AirConditioner
  );
};

class AirConditioner {
  constructor(log, config) {
    this.log = log;
    this.name = config["name"];
    // Clean the MAC address by removing colons and dashes
    this.duid = config["mac"].replace(/[:\-]/g, '');
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

    // Set initial state to avoid null values
    this.currentDeviceState = {
      [State.Active]: 'Off',
      [State.TempNow]: 20,
      [State.TempSet]: 16,
      [State.OpMode]: OpMode.Cool,
      [State.Direction]: Direction.Fixed,
      [State.WindLevel]: WindLevel.Auto
    };
  }

  getServices() {
    this.api.connect();
    this.api.on('stateUpdate', (stateUpdate) => this.updateState(stateUpdate));

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

    // TARGET TEMPERATURE (Cooling)
    this.acService
      .getCharacteristic(Characteristic.CoolingThresholdTemperature)
      .setProps({ minValue: 16, maxValue: 30, minStep: 1 })
      .on('get', this.getTargetTemperature.bind(this))
      .on('set', this.setTargetTemperature.bind(this));

    // TARGET TEMPERATURE (Heating)
    this.acService
      .getCharacteristic(Characteristic.HeatingThresholdTemperature)
      .setProps({ minValue: 16, maxValue: 30, minStep: 1 })
      .on('get', this.getTargetTemperature.bind(this))
      .on('set', this.setTargetTemperature.bind(this));

    // TARGET STATE (Desired Mode)
    this.acService
      .getCharacteristic(Characteristic.TargetHeaterCoolerState)
      .on('get', this.getTargetState.bind(this))
      .on('set', this.setTargetState.bind(this));

    // CURRENT STATE (Actual operation: Cooling/Heating/Idle)
    this.acService
      .getCharacteristic(Characteristic.CurrentHeaterCoolerState)
      .on('get', this.getCurrentState.bind(this));

    // SWING MODE (Oscillation)
    this.acService
      .getCharacteristic(Characteristic.SwingMode)
      .on('get', this.getSwingMode.bind(this))
      .on('set', this.setSwingMode.bind(this));

    // ROTATION SPEED (Fan speed)
    this.acService
      .getCharacteristic(Characteristic.RotationSpeed)
      .on('get', this.getRotationSpeed.bind(this))
      .on('set', this.setRotationSpeed.bind(this));

    const pkg = require('../package.json');
    const informationService = new Service.AccessoryInformation();
    informationService
      .setCharacteristic(Characteristic.SerialNumber, this.duid)
      .setCharacteristic(Characteristic.Manufacturer, pkg.author)
      .setCharacteristic(Characteristic.Model, pkg.name)
      .setCharacteristic(Characteristic.FirmwareRevision, pkg.version);

    return [this.acService, informationService];
  }

  // GETTERS
  getActive(callback) {
    if (this.debug) this.log('Getting active...');
    const power = this.currentDeviceState[State.Power];
    const isActive = power === 'On';
    callback(null, isActive);
  }

  getCurrentTemperature(callback) {
    if (this.debug) this.log('Getting current temperature...');
    const currentTemperature = this.currentDeviceState[State.TempNow];
    callback(null, currentTemperature);
  }

  getTargetTemperature(callback) {
    if (this.debug) this.log('Getting target temperature...');
    const targetTemperature = this.currentDeviceState[State.TempSet];
    callback(null, targetTemperature);
  }

  getTargetState(callback) {
    if (this.debug) this.log('Getting target state...');
    const opMode = this.currentDeviceState[State.OpMode];
    const targetState = mapper.targetStateFromOpMode(opMode);
    callback(null, targetState);
  }

  getCurrentState(callback) {
    callback(null, this.currentHeaterCoolerState());
  }

  getSwingMode(callback) {
    if (this.debug) this.log('Getting swing mode...');
    const direction = this.currentDeviceState[State.Direction];
    const isOscillating = direction === Direction.SwingUpDown;
    callback(null, isOscillating);
  }

  getRotationSpeed(callback) {
    if (this.debug) this.log('Getting rotation speed...');
    const windLevel = this.currentDeviceState[State.WindLevel];
    const rotationSpeed = mapper.rotationSpeedFromWindLevel(windLevel);
    callback(null, rotationSpeed);
  }

  // SETTERS
  setActive(isActive, callback) {
    this.log('Setting active:', isActive);
    this.api.deviceControl(State.Power, isActive ? "On" : "Off", (err) => {
      if (err) this.log('Error setting active');
      else this.log('Active set');
      callback(err);
    });
  }

  setTargetTemperature(temperature, callback) {
    this.log('Setting target temperature:', temperature);
    this.api.deviceControl(State.TempSet, temperature, (err) => {
      if (err) this.log('Error setting target temperature');
      else this.log('Target temperature set');
      callback(err);
    });
  }

  setTargetState(state, callback) {
    this.log('Setting target state:', state);
    const opMode = mapper.opModeFromTargetState(state);
    this.api.deviceControl(State.OpMode, opMode, (err) => {
      if (err) this.log('Error setting target state');
      else this.log('Target state set');
      callback(err);
    });
  }

  setSwingMode(enabled, callback) {
    this.log('Setting swing mode:', enabled);
    const directionValue = enabled ? Direction.SwingUpDown : Direction.Fixed;
    this.api.deviceControl(State.Direction, directionValue, (err) => {
      if (err) this.log('Error setting swing mode');
      else this.log('Swing mode set');
      callback(err);
    });
  }

  setRotationSpeed(speed, callback) {
    this.log('Setting rotation speed:', speed);
    const windLevel = mapper.windLevelFromRotationSpeed(speed);
    this.api.deviceControl(State.WindLevel, windLevel, (err) => {
      if (err) this.log('Error setting rotation speed');
      else this.log('Rotation speed set');
      callback(err);
    });
  }

  // Determine the current operating state based on temperatures and mode
  currentHeaterCoolerState() {
    const currentTemperature = this.currentDeviceState[State.TempNow];
    const targetTemperature = this.currentDeviceState[State.TempSet];
    const opMode = this.currentDeviceState[State.OpMode];

    let state;
    if (opMode === OpMode.Cool) {
      state =
        currentTemperature > targetTemperature
          ? Characteristic.CurrentHeaterCoolerState.COOLING
          : Characteristic.CurrentHeaterCoolerState.IDLE;
    } else if (opMode === OpMode.Heat) {
      state =
        currentTemperature < targetTemperature
          ? Characteristic.CurrentHeaterCoolerState.HEATING
          : Characteristic.CurrentHeaterCoolerState.IDLE;
    } else if (opMode === OpMode.Auto) {
      if (currentTemperature > targetTemperature) {
        state = Characteristic.CurrentHeaterCoolerState.COOLING;
      } else if (currentTemperature < targetTemperature) {
        state = Characteristic.CurrentHeaterCoolerState.HEATING;
      } else {
        state = Characteristic.CurrentHeaterCoolerState.IDLE;
      }
    } else {
      // For Dry/Wind or any unhandled modes, default to IDLE
      state = Characteristic.CurrentHeaterCoolerState.IDLE;
    }
    return state;
  }

  // Update the internal state and HomeKit characteristics
  updateState(stateUpdate) {
    if (stateUpdate && Object.keys(stateUpdate).length > 0) {
      this.log("State updated:", JSON.stringify(stateUpdate));
    }

    // Merge the new update with the current state
    this.currentDeviceState = { ...this.currentDeviceState, ...stateUpdate };

    // Update characteristics for each key in the update
    Object.keys(stateUpdate || {}).forEach((key) => {
      this.updateCharacteristic(key, stateUpdate[key]);
    });

    // Update derived values such as the current heater/cooler state
    this.updateDerivedCharacteristics();
  }

  updateCharacteristic(name, value) {
    let characteristic;
    let mappedValue;

    switch (name) {
      case State.Power:
        characteristic = Characteristic.Active;
        mappedValue = value === "On";
        break;
      case State.TempNow:
        characteristic = Characteristic.CurrentTemperature;
        mappedValue = value;
        break;
      case State.OpMode:
        characteristic = Characteristic.TargetHeaterCoolerState;
        mappedValue = mapper.targetStateFromOpMode(value);
        break;
      case State.Direction:
        characteristic = Characteristic.SwingMode;
        mappedValue = value === Direction.SwingUpDown;
        break;
      case State.WindLevel:
        characteristic = Characteristic.RotationSpeed;
        mappedValue = mapper.rotationSpeedFromWindLevel(value);
        break;
    }

    if (characteristic) {
      this.acService.getCharacteristic(characteristic).updateValue(mappedValue);
    }
  }

  updateDerivedCharacteristics() {
    const targetTemperature = this.currentDeviceState[State.TempSet];

    this.acService
      .getCharacteristic(Characteristic.CurrentHeaterCoolerState)
      .updateValue(this.currentHeaterCoolerState());
    this.acService
      .getCharacteristic(Characteristic.HeatingThresholdTemperature)
      .updateValue(targetTemperature);
    this.acService
      .getCharacteristic(Characteristic.CoolingThresholdTemperature)
      .updateValue(targetTemperature);
  }
}

module.exports = AirConditioner;
