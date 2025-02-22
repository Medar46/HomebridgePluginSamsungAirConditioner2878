const OpMode = require('./op-mode');
const WindLevel = require('./wind-level');

let Characteristic;

const setCharacteristic = (characteristic) => {
  Characteristic = characteristic;
};

const opModeFromTargetState = (targetState) => {
  if (!Characteristic) {
    throw new Error('Characteristic is not set. Call setCharacteristic() first.');
  }
  switch (targetState) {
    case Characteristic.TargetHeaterCoolerState.COOL:
      return OpMode.Cool;
    case Characteristic.TargetHeaterCoolerState.HEAT:
      return OpMode.Heat;
    case Characteristic.TargetHeaterCoolerState.AUTO:
      return OpMode.Auto;
    default:
      throw new Error(`Unknown targetState: ${targetState}`);
  }
};

const targetStateFromOpMode = (opMode) => {
  if (!Characteristic) {
    throw new Error('Characteristic is not set. Call setCharacteristic() first.');
  }
  switch (opMode) {
    case OpMode.Cool:
      return Characteristic.TargetHeaterCoolerState.COOL;
    case OpMode.Heat:
      return Characteristic.TargetHeaterCoolerState.HEAT;
    case OpMode.Auto:
    case OpMode.Dry:
    case OpMode.Wind:
      return Characteristic.TargetHeaterCoolerState.AUTO;
    default:
      throw new Error(`Unknown opMode: ${opMode}`);
  }
};

const rotationSpeedFromWindLevel = (windLevel) => {
  switch (windLevel) {
    case WindLevel.Auto:
      return 0;
    case WindLevel.Low:
      return 25;
    case WindLevel.Mid:
      return 50;
    case WindLevel.High:
      return 75;
    case WindLevel.Turbo:
      return 100;
    default:
      throw new Error(`Unknown windLevel: ${windLevel}`);
  }
};

const windLevelFromRotationSpeed = (rotationSpeed) => {
  if (rotationSpeed === 0) {
    return WindLevel.Auto;
  } else if (rotationSpeed <= 25) {
    return WindLevel.Low;
  } else if (rotationSpeed <= 50) {
    return WindLevel.Mid;
  } else if (rotationSpeed <= 75) {
    return WindLevel.High;
  } else {
    return WindLevel.Turbo;
  }
};

module.exports = {
  setCharacteristic,
  opModeFromTargetState,
  targetStateFromOpMode,
  rotationSpeedFromWindLevel,
  windLevelFromRotationSpeed,
};
