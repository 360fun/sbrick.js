/*
 * Copyright (c) 2016-17 Francesco Marino
 *
 * @author Francesco Marino <francesco@360fun.net>
 * @website www.360fun.net
 *
 * Requires bluetooth.js and promise-queue library
 * https://github.com/360fun/bluetooth.js
 * https://github.com/azproduction/promise-queue
 *
 * This code is compatible with SBrick Protocol 4.17
 * https://social.sbrick.com/wiki/view/pageId/11/slug/the-sbrick-ble-protocol
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

(function() {
	'use strict';

	const ID_SBRICK                             = "SBrick";
	const FIRMWARE_COMPATIBILITY                = 4.17;

	const UUID_SERVICE_DEVICEINFORMATION        = "device_information";
  const UUID_CHARACTERISTIC_MODELNUMBER       = "model_number_string";
	const UUID_CHARACTERISTIC_FIRMWAREREVISION  = "firmware_revision_string";
	const UUID_CHARACTERISTIC_HARDWAREREVISION  = "hardware_revision_string";
	const UUID_CHARACTERISTIC_SOFTWAREREVISION  = "software_revision_string";
	const UUID_CHARACTERISTIC_MANUFACTURERNAME  = "manufacturer_name_string";

	const UUID_SERVICE_REMOTECONTROL            = "4dc591b0-857c-41de-b5f1-15abda665b0c";
	const UUID_CHARACTERISTIC_REMOTECONTROL     = "02b8cbcc-0e25-4bda-8790-a15f53e6010f";
	const UUID_CHARACTERISTIC_QUICKDRIVE        = "489a6ae0-c1ab-4c9c-bdb2-11d373c1b7fb";

	const UUID_SERVICE_OTA                      = "1d14d6ee-fd63-4fa1-bfa4-8f47b42119f0";
	const UUID_CHARACTERISTIC_OTACONTROL        = "f7bf3564-fb6d-4e53-88a4-5e37e0326063";

	// REMOTE CONTROL COMMANDS

	// Exceptions
	const ERROR_LENGTH  = 0x80; // Invalid command length
	const ERROR_PARAM   = 0x81; // Invalid parameter
	const ERROR_COMMAND = 0x82; // No such command
	const ERROR_NOAUTH  = 0x83; // No authentication needed
	const ERROR_AUTH    = 0x84; // Authentication error
	const ERROR_DOAUTH  = 0x85; // Authentication needed
	const ERROR_AUTHOR  = 0x86; // Authorization error
	const ERROR_THERMAL = 0x87; // Thermal protection is active
	const ERROR_STATE   = 0x88; // The system is in a state where the command does not make sense

	// Commands
	const CMD_BREAK      = 0x00; // Stop command
	const CMD_DRIVE      = 0x01; // Drive command
	const CMD_ADC        = 0x0F; // Query ADC
	const CMD_ADC_VOLT   = 0x08; // Get Voltage
	const CMD_ADC_TEMP   = 0x09; // Get Temperature

	// Channels
	const CHANNEL_0 = 0x00; // Top-Left Channel
	const CHANNEL_1 = 0x01; // Bottom-Left Channel
	const CHANNEL_2 = 0x02; // Top-Right Channel
	const CHANNEL_3 = 0x03; // Bottom-Right Channel

	// Directions
	const CLOCKWISE        = 0x00; // Clockwise
	const COUNTERCLOCKWISE = 0x01; // Counterclockwise

	// Values limits
	const MIN    = 0;   // No Speed
	const MAX    = 255; // Max Speed
	const MAX_QD = 127; // Max Speed for QuickDrive
	const MAX_VOLT = 9; // Max Voltage = Full battery

	// Sbrick class definition
	class SBrick {

		constructor() {
			// export constants
			this.CHANNEL0   = CHANNEL_0;
			this.CHANNEL1   = CHANNEL_1;
			this.CHANNEL2   = CHANNEL_2;
			this.CHANNEL3   = CHANNEL_3;
			this.CW         = CLOCKWISE;
			this.CCW        = COUNTERCLOCKWISE;
			this.MAX        = MAX;
			this.SERVICES   = {}

			// status
      this.keepalive = null;
			this.channel   = [
				{ power: MIN, direction: CLOCKWISE, busy: false },
				{ power: MIN, direction: CLOCKWISE, busy: false },
				{ power: MIN, direction: CLOCKWISE, busy: false },
				{ power: MIN, direction: CLOCKWISE, busy: false }
			];

			// queue
			this.maxConcurrent = 1;
			this.maxQueue      = Infinity;
			this.queue         = new Queue( this.maxConcurrent, this.maxQueue );

			// debug
			this._debug         = false;
    }

		connect( sbrick_name ) {
			this.SERVICES = {
				[UUID_SERVICE_DEVICEINFORMATION] : {
					name : "Device Information",
					characteristics : {
						[UUID_CHARACTERISTIC_MODELNUMBER] : {
							name : "Model Number String"
						},
						[UUID_CHARACTERISTIC_FIRMWAREREVISION] : {
							name : "Firmware Revision String"
						},
						[UUID_CHARACTERISTIC_HARDWAREREVISION] : {
							name : "Hardware Revision String"
						},
						[UUID_CHARACTERISTIC_SOFTWAREREVISION] : {
							name : "Software Revision String"
						},
						[UUID_CHARACTERISTIC_MANUFACTURERNAME] : {
							name : "Manufacturer Name String"
						}
					}
				},
				[UUID_SERVICE_REMOTECONTROL] : {
					name : "Remote Control",
					characteristics : {
						[UUID_CHARACTERISTIC_REMOTECONTROL] : {
							name : "Quick Drive"
						},
						[UUID_CHARACTERISTIC_QUICKDRIVE] : {
							name : "Remote Control"
						}
					}
				}
			}
			let options = {
				// filter by service should work but it doesn't show any SBrick...
				// filters: [{
				// 	services: [ UUID_SERVICE_DEVICEINFORMATION, UUID_SERVICE_OTA, UUID_SERVICE_REMOTECONTROL ]
				// }],
				optionalServices: Object.keys(this.SERVICES)
			};

			// if the SBrick name is not defined it shows all the devices
			// I don't like this solution, would be better to filter "by services"
			if( typeof sbrick_name !== 'undefined' ) {
				options.filters = [{
					namePrefix: [ sbrick_name ]
				}];
			} else {
				options.acceptAllDevices = true;
			}
			return WebBluetooth.connect(options,this.SERVICES)
			.then( () => {
				if( this.isConnected() ) {
					if( this._debug ) {
						this._log( "Connected to SBrick " + WebBluetooth.device.id );
					}
					// Firmware Compatibility Check
					this.getFirmwareVersion()
					.then( version => {
						if( parseFloat(version) >= FIRMWARE_COMPATIBILITY ) {
							this.keepalive = this._keepalive(this);
						} else {
							this._log("Firmware not compatible: please update your SBrick.");
							this.disconnect();
						}
					});
				}
			})
			.catch( e => { this._error(e) } );
    }


		disconnect() {
			return new Promise( (resolve, reject) => {
					if( this.isConnected() ) {
						resolve();
					} else {
						reject('Not connected');
					}
			} ).then( ()=> {
				return this.stopAll().then( ()=>{
					clearInterval( this.keepalive );
					return WebBluetooth.disconnect();
				} );
			} )
			.catch( e => { this._error(e) } );
		}


		isConnected() {
			return WebBluetooth && WebBluetooth.isConnected();
		}

		_deviceInfo( uuid_characteristic ) {
			return new Promise( (resolve, reject) => {
				if( typeof this.SERVICES[UUID_SERVICE_DEVICEINFORMATION].characteristics[uuid_characteristic] != 'undefined' ) {
					resolve();
				} else {
					reject('Wrong input');
				}
			} ).then( () => {
				return WebBluetooth.readCharacteristicValue( uuid_characteristic )
				.then(data => {
					var str = "";
					for (let i = 0; i < data.byteLength; i++) {
						str += String.fromCharCode(data.getUint8(i));
					}
					return str;
				})
				.catch( e => { this._error(e) } );
			})
			.catch( e => { this._error(e) } );
		}

		getModelNumber() {
			return this._deviceInfo(UUID_CHARACTERISTIC_MODELNUMBER).then( model => {
					return model;
			} )
		}

		getFirmwareVersion() {
			return this._deviceInfo(UUID_CHARACTERISTIC_FIRMWAREREVISION).then( version => {
					return version;
			} )
		}

		getHardwareVersion() {
			return this._deviceInfo(UUID_CHARACTERISTIC_HARDWAREREVISION).then( version => {
					return version;
			} )
		}

		getSoftwareVersion() {
			return this._deviceInfo(UUID_CHARACTERISTIC_SOFTWAREREVISION).then( version => {
					return version;
			} )
		}

		getManufacturerName() {
			return this._deviceInfo(UUID_CHARACTERISTIC_MANUFACTURERNAME).then( version => {
					return version;
			} )
		}


		drive( channel, direction, power ) {
			return new Promise( (resolve, reject) => {
				if( channel!=null && direction!=null && power!=null ) {
					resolve();
				} else {
					reject('Wrong input');
				}
			} ).then( () => {
				let channels    = [CHANNEL_0,CHANNEL_1,CHANNEL_2,CHANNEL_3];
				let directions = [CLOCKWISE,COUNTERCLOCKWISE];

				this.channel[channel].power     = Math.min(Math.max(parseInt(Math.abs(power)), MIN), MAX);
				this.channel[channel].direction = directions[direction];

				if( !this.channel[channel].busy ) {
					this.channel[channel].busy = true;
					this.queue.add( () => {
						this.channel[channel].busy = false;
						return WebBluetooth.writeCharacteristicValue(
							UUID_CHARACTERISTIC_REMOTECONTROL,
							new Uint8Array([ CMD_DRIVE, channels[channel], this.channel[channel].direction, this.channel[channel].power ])
						) }
					);
				}
			} )
			.catch( e => { this._error(e) } );
		}


		quickDrive( channel_array ) {
			return new Promise( (resolve, reject) => {
				if( channel_array!=null || Array.isArray(channel_array) ) {
					resolve();
				} else {
					reject('Wrong input');
				}
			} ).then( ()=> {

				for(var i=0;i<4;i++) {
					if( typeof channel_array[i] !== 'undefined' ) {
						var channel = parseInt( channel_array[i].channel );
						this.channel[channel].power     = Math.min(Math.max(parseInt(Math.abs(channel_array[i].power)), MIN), MAX);
						this.channel[channel].direction = channel_array[i].direction ? COUNTERCLOCKWISE : CLOCKWISE;
					}
				}

				if( !this.channel[0].busy && !this.channel[1].busy && !this.channel[2].busy && !this.channel[3].busy ) {
					for(var i=0;i<4;i++) {
						this.channel[i].busy = true;
					}
					this.queue.add( () => {
						for(var i=0;i<4;i++) {
							this.channel[i].busy = false;
						}
						return WebBluetooth.writeCharacteristicValue(
							UUID_CHARACTERISTIC_QUICKDRIVE,
							new Uint8Array([
								parseInt( parseInt(this.channel[0].power/MAX*MAX_QD).toString(2) + this.channel[0].direction, 2 ),
								parseInt( parseInt(this.channel[1].power/MAX*MAX_QD).toString(2) + this.channel[1].direction, 2 ),
								parseInt( parseInt(this.channel[2].power/MAX*MAX_QD).toString(2) + this.channel[2].direction, 2 ),
								parseInt( parseInt(this.channel[3].power/MAX*MAX_QD).toString(2) + this.channel[3].direction, 2 )
							])
						) }
					);
				}
			})
			.catch( e => { this._error(e) } );
		}


		stop( channel ) {
			return new Promise( (resolve, reject) => {
				if( channel!=null ) {
					resolve();
				} else {
					reject('wrong input');
				}
			} ).then( ()=> {

				let command = null;

				if( !Array.isArray(channel) ) {
					channel = [ channel ];
				}

				// set motors power to 0 in the object
				for(var i=0;i<channel.length;i++) {
					this.channel[channel[i]].power = 0;
				}

				switch( channel.length ) {
					default:
						command = new Uint8Array([ CMD_BREAK, channel[0] ]);
						break;
					case 2:
						command = new Uint8Array([ CMD_BREAK,channel[0], channel[1] ]);
						break;
					case 3:
						command = new Uint8Array([ CMD_BREAK, channel[0], channel[1], channel[2] ]);
						break;
					case 4:
						command = new Uint8Array([ CMD_BREAK, channel[0], channel[1], channel[2], channel[3] ]);
						break;
				}

				this.queue.add( () => {
					return WebBluetooth.writeCharacteristicValue(
						UUID_CHARACTERISTIC_REMOTECONTROL,
						command
					);
				});

			} )
			.catch( e => { this._error(e) } );
		}


		stopAll() {
			return this.stop([ CHANNEL_0, CHANNEL_1, CHANNEL_2, CHANNEL_3 ]);
		}


		getBattery() {
			return this._volt()
			.then( volt => {
					return parseInt( Math.abs( volt / MAX_VOLT * 100 ) );
			});
		}


		getTemp( fahrenheit ) {
			return this._temp()
			.then( temp => {
				let result = 0;
				if( fahrenheit ) {
					result = temp * 9/5 + 32;
					result = result; // ' °F';
				} else {
					result = temp; // ' °C';
				}
				return result;
			});
		}


		_keepalive() {
			return setInterval( () => {
				if( !this.isConnected() ) {
					this._log('Connection lost');
					clearInterval( this.keepalive );
				} else if( this.queue.getQueueLength() === 0 ) {
					this.queue.add( () => {
						return WebBluetooth.writeCharacteristicValue(
							UUID_CHARACTERISTIC_REMOTECONTROL,
							new Uint8Array( [ CMD_ADC, CMD_ADC_TEMP ] )
						);
					} );
				}
			}, 300);
		}


		_adc( mode ) {
			return this.queue.add( () => {
				return WebBluetooth.writeCharacteristicValue(
					UUID_CHARACTERISTIC_REMOTECONTROL,
					new Uint8Array([CMD_ADC,mode])
				).then(() => {
					return WebBluetooth.readCharacteristicValue(UUID_CHARACTERISTIC_REMOTECONTROL)
					.then(data => {
						return data.getInt16( 0, true );
					});
				});
			});
		}


		_volt() {
			return this._adc(CMD_ADC_VOLT).then( volt => {
					return parseFloat( volt * 0.83875 / 2047.0 ); // V;
			} )
		}


		_temp() {
			return this._adc(CMD_ADC_TEMP).then( temp => {
					return parseFloat(temp / 118.85795 - 160); // °C;
			} )
		}

		_error( msg ) {
			if(this._debug) {
				console.debug(msg);
			} else {
				throw msg;
			}
		}

		_log( msg ) {
			if(this._debug) {
				console.log(msg);
			}
		}

  }

  window.SBrick = new SBrick();

})();
