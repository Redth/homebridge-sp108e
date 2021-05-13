import { Service, PlatformAccessory, CharacteristicValue, Nullable } from 'homebridge';

import { Sp108eControllerPlatform as Sp108eControllerPlatform } from './platform';

import { Sp108e } from 'sp108e_raw';

import { Mutex } from 'async-mutex';
import { ConsoleUtil } from './consoleUtil';

/* eslint-disable */
const convert = require('color-convert');

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */

const sp108eMutex = new Mutex();

export class Sp108eControllerAccessory {
  private service: Service;

  private pendingHueChange: boolean;
  private pendingSaturationChange: boolean;
  private pendingBrightnessChange: boolean;

  public static sp108ePlatform: Sp108eControllerPlatform;

  constructor(
    private readonly platform: Sp108eControllerPlatform,
    private readonly accessory: PlatformAccessory,
  ) {

    this.pendingHueChange = false;
    this.pendingSaturationChange = false;
    this.pendingBrightnessChange = true;

    Sp108eControllerAccessory.sp108ePlatform = platform;

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'BTF Lighting')
      .setCharacteristic(this.platform.Characteristic.Model, 'SP108E')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'btf-sp108e');

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    this.service = this.accessory.getService(this.platform.Service.Lightbulb) || this.accessory.addService(this.platform.Service.Lightbulb);

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.config.displayName);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Lightbulb

    // register handlers for the On/Off Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))                // SET - bind to the `setOn` method below
      .onGet(this.getOn.bind(this));               // GET - bind to the `getOn` method below

    // register handlers for the Brightness Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.Brightness)
      .onSet(this.setBrightness.bind(this))        // SET - bind to the 'setBrightness` method below
      .onGet(this.getBrightness.bind(this));       // GET

    this.service.getCharacteristic(this.platform.Characteristic.Hue)
      .onSet(this.setHue.bind(this))
      .onGet(this.getHue.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.Saturation)
      .onSet(this.setSaturation.bind(this))
      .onGet(this.getSaturation.bind(this));
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  setOn(value: CharacteristicValue): Nullable<CharacteristicValue> {
    this.platform.log.debug('Set Characteristic Requested: On ->', value);

    let toUse = this.accessory.context.sp108e.on;

    if (!value) {
      toUse = this.accessory.context.sp108e.off;
    }

    sp108eMutex.runExclusive(async() => {
      await toUse();
      this.accessory.context.lastStatus.on = value;
      this.service.updateCharacteristic(this.platform.Characteristic.On, value);
      this.platform.log.debug('Set Characteristic On ->', value);
    });

    return this.accessory.context.lastStatus.on ?? false;
  }

  getOn(): Nullable<CharacteristicValue> {
    this.platform.log.debug('Get Characteristic Request: On...');

    // implement your own code to check if the device is on
    this.getStatus(this.accessory.context.sp108e).then(s => {
      const isOn = s?.on ?? false;
      this.service.updateCharacteristic(this.platform.Characteristic.On, isOn);
      this.platform.log.debug('Got Characteristic On ->', isOn);
    });

    return this.accessory.context.lastStatus.on ?? false;
  }

  private getHsv(hex: string): any
  {
    var hsv = convert.hex.hsv(hex);

    return hsv;
  }

  private getColorPart(part: string) : Nullable<CharacteristicValue> {
    this.platform.log.debug('Get Characteristic Request: ' + part + '...');

    var partIndex = 0; // hue
    var partCharacteristic = this.platform.Characteristic.Hue;
    if (part === 'saturation') {
      partIndex = 1;
      partCharacteristic = this.platform.Characteristic.Saturation;
    } else if (part === 'brightness') {
      partIndex = 2;
      partCharacteristic = this.platform.Characteristic.Brightness;
    }

    const partValue = this.getHsv(this.accessory.context.lastStatus.color)[partIndex];

    this.getStatus(this.accessory.context.sp108e).then(s => {
      this.service.updateCharacteristic(partCharacteristic, partValue);
      this.platform.log.debug('Get Characteristic ' + part + ' -> ', partValue);
    });

    return partValue ?? 0;
  }

  getHue(): Nullable<CharacteristicValue> {
    return this.getColorPart('hue');
  }

  getSaturation(): Nullable<CharacteristicValue> {
   return this.getColorPart('saturation');
  }

  getBrightness(): Nullable<CharacteristicValue> {
    return this.getColorPart('brightness');
  }

  setHue(value: CharacteristicValue) : Nullable<CharacteristicValue> {
    this.updateColorPart(this.accessory, value as number, 'hue');
    return null;
  }

  setSaturation(value: CharacteristicValue) : Nullable<CharacteristicValue> {
    this.updateColorPart(this.accessory, value as number, 'saturation');
    return null;
  }

  setBrightness(value: CharacteristicValue) : Nullable<CharacteristicValue> {
    this.updateColorPart(this.accessory, value as number, 'brightness');
    return null;
  }

  updateColorPart(accessory: PlatformAccessory, value: number, part: string)
  {
    this.platform.log.debug('Set Characteristic Request: ' + part + ' -> ', value);

    var hsv = convert.hex.hsv(accessory.context.lastStatus.color);

    if (part === 'hue')
    {
      hsv[0] = value;
      this.pendingHueChange = true;
    }
    else if (part === 'saturation')
    {
      hsv[1] = value;
      this.pendingSaturationChange = true;
    }
    else if (part === 'brightness')
    {
      hsv[2] = value;
      this.pendingBrightnessChange = true;
    }

    if (this.pendingBrightnessChange || (this.pendingHueChange || this.pendingSaturationChange))
    {
      accessory.context.lastStatus.color = convert.hsv.hex(hsv[0], hsv[1], hsv[2]);

      var didChangeHue = this.pendingHueChange;
      var didChangeSaturation = this.pendingSaturationChange;
      var didChangeBrightness = this.pendingBrightnessChange;
      
      this.pendingBrightnessChange = false;
      this.pendingHueChange = false;
      this.pendingSaturationChange = false;

      this.platform.log.info('Changing ' + accessory.displayName + ' color to -> ', accessory.context.lastStatus.color);

      sp108eMutex.runExclusive(async() => {

        ConsoleUtil.DisableLog();

        await this.accessory.context.sp108e.setColor(accessory.context.lastStatus.color);

        ConsoleUtil.EnableLog();

        if (didChangeHue)
          this.service.updateCharacteristic(this.platform.Characteristic.Hue, hsv[0]);
        if (didChangeSaturation)
          this.service.updateCharacteristic(this.platform.Characteristic.Saturation, hsv[1]);
        if (didChangeBrightness)
          this.service.updateCharacteristic(this.platform.Characteristic.Brightness, hsv[2]);
      });
    }
  }

  private async getStatus(sp: Sp108e): Promise<any>{
    return await sp108eMutex.runExclusive(async () => {

      if (this.accessory.context.lastStatus)
        return this.accessory.context.lastStatus;

      ConsoleUtil.DisableLog();
      const status = await sp.getStatus();
      ConsoleUtil.EnableLog();

      this.accessory.context.lastStatus = status;

      return status;
    });
  }
}
