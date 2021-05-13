import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { Sp108eControllerAccessory } from './platformAccessory';

/* eslint-disable */
const { sp108e } = require('sp108e_raw');


/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class Sp108eControllerPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', "SP108E");

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  async discoverDevices() {

    const controllers = this.config.controllers;

    for (const controller of controllers) {
      // the accessory does not yet exist, so we need to create it
      this.log.info('Found Controller Configuration:', controller.address);

      const uuid = this.api.hap.uuid.generate(controller.address);

      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

      const opts = {
        host: controller.address,
        port: 8189,
      };

      const sp108eInstance = new sp108e(opts);

      if (existingAccessory) {
        // the accessory already exists
        this.log.info('Restoring controller from cache:', existingAccessory.displayName);

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        existingAccessory.context.sp108e = sp108eInstance;
        this.api.updatePlatformAccessories([existingAccessory]);

        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new Sp108eControllerAccessory(this, existingAccessory);

        // Status is probably stale, refresh it
        const status = await sp108eInstance.getStatus();
        if (status)
        {
          this.log.info('Controller found, status updated: ' + existingAccessory.displayName);
          existingAccessory.context.lastStatus = status;
        }

        // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
        // remove platform accessories when no longer present
        // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
        // this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
      } else {

        this.log.info('Controller created:', controller.displayName);

        const status = await sp108eInstance.getStatus();

        if (status) {
          
          this.log.info('Controller found, status updated: ' + controller.displayName);

          // create a new accessory
          const sp108eAccessory = new this.api.platformAccessory(controller.displayName ?? controller.address, uuid);

          // store a copy of the device object in the `accessory.context`
          // the `context` property can be used to store any data about the accessory you may need
          sp108eAccessory.context.config = controller;
          sp108eAccessory.context.sp108e = sp108eInstance;

          // Update recent status (initial status)
          sp108eAccessory.context.lastStatus = status;

          // create the accessory handler for the newly create accessory
          // this is imported from `platformAccessory.ts`
          new Sp108eControllerAccessory(this, sp108eAccessory);

          // link the accessory to your platform
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [sp108eAccessory]);
        }
      }
    }
  }
}
