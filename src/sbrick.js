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

let SBrick = (function() {
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
	const CMD_BREAK     = 0x00; // Stop command
	const CMD_DRIVE     = 0x01; // Drive command
	const CMD_ADC       = 0x0F; // Query ADC
	const CMD_ADC_VOLT  = 0x08; // Get Voltage
	const CMD_ADC_TEMP  = 0x09; // Get Temperature
	const CMD_PVM       = 0x2C; // Periodic Voltage Measurements

	// SBrick Ports / Channels
  const PORT    = [
			0x00, // PORT0 (top-left)
			0x01, // PORT1 (bottom-left)
			0x02, // PORT2 (top-right)
			0x03  // PORT3 (bottom-right)
	];
	const CHANNEL = [
		0x00, 0x01, // PORT0 channels
		0x02, 0x03, // PORT1 channels
		0x04, 0x05, // PORT2 channels
		0x06, 0x07  // PORT3 channels
	];

	// Port Mode
	const INPUT  = 'input';
	const OUTPUT = 'output';

	// Direction
	const CLOCKWISE        = 0x00; // Clockwise
	const COUNTERCLOCKWISE = 0x01; // Counterclockwise

	// Values limits
	const MIN      = 0;   // No Speed
	const MAX      = 255; // Max Speed
	const MAX_QD   = 127; // Max Speed for QuickDrive
	const MAX_VOLT = 9;   // Max Voltage = Full battery

	// Sbrick class definition
	class SBrick {

		// CONSTRUCTOR

		/**
  	* Create a new instance of the SBrick class (and accordingly also WebBluetooth)
  	* @param {string} sbrick_name - The name of the sbrick
  	*/
		constructor( sbrick_name ) {
			this.webbluetooth = new WebBluetooth();

			// export constants
			this.NAME     = sbrick_name || "";
			this.PORT0    = PORT[0];
			this.PORT1    = PORT[1];
			this.PORT2    = PORT[2];
			this.PORT3    = PORT[3];
			this.CW       = CLOCKWISE;
			this.CCW      = COUNTERCLOCKWISE;
			this.MAX      = MAX;
			this.SERVICES = {}

			// status
      this.keepalive = null;
			this.ports     = [
				{ power: MIN, direction: CLOCKWISE, mode: OUTPUT, busy: false },
				{ power: MIN, direction: CLOCKWISE, mode: OUTPUT, busy: false },
				{ power: MIN, direction: CLOCKWISE, mode: OUTPUT, busy: false },
				{ power: MIN, direction: CLOCKWISE, mode: OUTPUT, busy: false }
			];

			// queue
			this.maxConcurrent = 1;
			this.maxQueue      = Infinity;
			this.queue         = new Queue( this.maxConcurrent, this.maxQueue );

			// debug
			this._debug         = false;
    }


		// PUBLIC FUNCTIONS

		/**
		* Open the Web Bluetooth popup to search and connect the SBrick (filtered by name if previously specified)
		*/
		connect() {
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
			if( this.NAME != "" ) {
				options.filters = [{
					namePrefix: [ this.NAME ]
				}];
			} else {
				options.acceptAllDevices = true;
			}
			return this.webbluetooth.connect(options,this.SERVICES)
			.then( () => {
				if( this.isConnected() ) {
					if( this._debug ) {
						this._log( "Connected to SBrick " + this.webbluetooth.device.id );
					}
					// Firmware Compatibility Check
					this.getFirmwareVersion()
					.then( version => {
						if( parseFloat(version) >= FIRMWARE_COMPATIBILITY ) {
							this.keepalive = this._keepalive(this);
						} else {
							this._error("Firmware not compatible: please update your SBrick.");
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
					return this.webbluetooth.disconnect();
				} );
			} )
			.catch( e => { this._error(e) } );
		}


		isConnected() {
			return this.webbluetooth && this.webbluetooth.isConnected();
		}

		getModelNumber() {
			return this._deviceInfo(UUID_CHARACTERISTIC_MODELNUMBER);
		}

		getFirmwareVersion() {
			return this._deviceInfo(UUID_CHARACTERISTIC_FIRMWAREREVISION);
		}

		getHardwareVersion() {
			return this._deviceInfo(UUID_CHARACTERISTIC_HARDWAREREVISION);
		}

		getSoftwareVersion() {
			return this._deviceInfo(UUID_CHARACTERISTIC_SOFTWAREREVISION);
		}

		getManufacturerName() {
			return this._deviceInfo(UUID_CHARACTERISTIC_MANUFACTURERNAME);
		}


		drive( port, direction, power ) {
			return new Promise( (resolve, reject) => {
				if( PORT.indexOf(port)!=-1 && direction!=null && power!=null ) {
					resolve();
				} else {
					reject('Wrong input');
				}
			} )
			.then( ()=> {
				return this._pvm( { port:port, mode:OUTPUT } );
			})
			.then( () => {
				this.ports[port].power     = Math.min(Math.max(parseInt(Math.abs(power)), MIN), MAX);
				this.ports[port].direction = direction ? COUNTERCLOCKWISE : CLOCKWISE;

				if( !this.ports[port].busy ) {
					this.ports[port].busy = true;
					this.queue.add( () => {
						this.ports[port].busy = false;
						return this.webbluetooth.writeCharacteristicValue(
							UUID_CHARACTERISTIC_REMOTECONTROL,
							new Uint8Array([ CMD_DRIVE, PORT[port], this.ports[port].direction, this.ports[port].power ])
						) }
					);
				}
			} )
			.catch( e => { this._error(e) } );
		}


		quickDrive( array_ports ) {
			return new Promise( (resolve, reject) => {
				if( array_ports!=null || Array.isArray(array_ports) ) {
					resolve();
				} else {
					reject('Wrong input');
				}
			} )
			.then( ()=> {
				let array = [];
				for(let i=0;i<4;i++) {
					if( typeof array_ports[i] !== 'undefined' ) {
						let port = array_ports[i].port;
						array.push( { port: port, mode: OUTPUT } );
					}
				}
				return this._pvm( array );
			})
			.then( ()=> {
				for(let i=0;i<4;i++) {
					if( typeof array_ports[i] !== 'undefined' ) {
						let port = parseInt( array_ports[i].port );
						this.ports[port].power     = Math.min(Math.max(parseInt(Math.abs(array_ports[i].power)), MIN), MAX);
						this.ports[port].direction = array_ports[i].direction ? COUNTERCLOCKWISE : CLOCKWISE;
					}
				}
				if( !this.ports[0].busy && !this.ports[1].busy && !this.ports[2].busy && !this.ports[3].busy ) {
					for(let i=0;i<4;i++) {
						this.ports[i].busy = true;
					}
					this.queue.add( () => {
						let command = [];
						for(let i=0;i<4;i++) {
							this.ports[i].busy = false;
							if( this.ports[i].mode==OUTPUT ) {
								command.push( parseInt( parseInt(this.ports[i].power/MAX*MAX_QD).toString(2) + this.ports[i].direction, 2 ) );
							} else {
								command.push( null );
							}
						}
						return this.webbluetooth.writeCharacteristicValue(
							UUID_CHARACTERISTIC_QUICKDRIVE,
							new Uint8Array( command )
						) }
					);
				}
			})
			.catch( e => { this._error(e) } );
		}


		stop( array_ports ) {
			return new Promise( (resolve, reject) => {
				if( array_ports!=null ) {
					resolve();
				} else {
					reject('wrong input');
				}
			} )
			.then( ()=> {
				let array = [];
				for(let i=0;i<array_ports.length;i++) {
					array.push( {
						port: array_ports[i],
						mode: OUTPUT
					} );
				}
				return this._pvm( array );
			})
			.then( ()=> {
				if( !Array.isArray(array_ports) ) {
					array_ports = [ array_ports ];
				}
				let command = [ CMD_BREAK ];
				// update object values and build the command
				for(let i=0;i<array_ports.length;i++) {
					this.ports[array_ports[i]].power = 0;
					command.push(array_ports[i]);
				}
				this.queue.add( () => {
					return this.webbluetooth.writeCharacteristicValue(
						UUID_CHARACTERISTIC_REMOTECONTROL,
						new Uint8Array( command )
					);
				});
			} )
			.catch( e => { this._error(e) } );
		}


		stopAll() {
			return this.stop([ PORT[0], PORT[1], PORT[2], PORT[3] ]);
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


		/**
		* Helper function to invert CW in CCW and vice versa
		* @param {hex number} direction
		*/
		invDir( direction ) {
			return direction ? CLOCKWISE : COUNTERCLOCKWISE;
		}
		_deviceInfo( uuid_characteristic ) {
			return new Promise( (resolve, reject) => {
				if( typeof this.SERVICES[UUID_SERVICE_DEVICEINFORMATION].characteristics[uuid_characteristic] != 'undefined' ) {
					resolve();
				} else {
					reject('Wrong input');
				}
			} ).then( () => {
				return this.webbluetooth.readCharacteristicValue( uuid_characteristic )
				.then(data => {
					let str = "";
					for (let i = 0 ; i < data.byteLength ; i++) {
						str += String.fromCharCode(data.getUint8(i));
					}
					return str;
				})
				.catch( e => { this._error(e) } );
			})
			.catch( e => { this._error(e) } );
		}
		_keepalive() {
			return setInterval( () => {
				if( !this.isConnected() ) {
					this._log('Connection lost');
					clearInterval( this.keepalive );
				} else if( this.queue.getQueueLength() === 0 ) {
					this.queue.add( () => {
						return this.webbluetooth.writeCharacteristicValue(
							UUID_CHARACTERISTIC_REMOTECONTROL,
							new Uint8Array( [ CMD_ADC, CMD_ADC_TEMP ] )
						);
					} );
				}
			}, 300);
		}

		_adc( array_channels ) {
			return this.queue.add( () => {
				let ports = Array.isArray(array_channels) ? array_channels : [array_channels];
				return this.webbluetooth.writeCharacteristicValue(
					UUID_CHARACTERISTIC_REMOTECONTROL,
					new Uint8Array([CMD_ADC].concat(ports))
				).then(() => {
					return this.webbluetooth.readCharacteristicValue(UUID_CHARACTERISTIC_REMOTECONTROL)
					.then(data => {
						return data;
					});
				});
			});
		}

		/**
		* Enable "Power Voltage Measurements" (five times a second) on a specific PORT (on both CHANNELS)
		* the values are stored in internal SBrick variables, to read them use _adc()
		* @param {array} array_ports - an array of port status objects { port: PORT[0-3], mode: INPUT-OUTPUT}
		* @returns {promise} - undefined
		*/
		_pvm( array_ports ) {
			return new Promise( (resolve, reject) => {
				if( array_ports!=null ) {
					resolve();
				} else {
					reject('wrong input');
				}
			} ).then( ()=> {
				if( !Array.isArray(array_ports) ) {
					array_ports = [ array_ports ];
				}
				let update_pvm = false;
				for(let i=0;i<4;i++) {
					if( typeof array_ports[i] !== 'undefined' ) {
						let port = array_ports[i].port;
						let mode = array_ports[i].mode;
						if( this.ports[port].mode != mode ) {
							this.ports[port].mode = mode;
							update_pvm = true;
						}
					}
				}
				if(update_pvm) {
					let command = [CMD_PVM];
					let srt = "";
					for(let i=0;i<4;i++) {
						if(this.ports[i].mode==INPUT) {
							let channels = this._getPortChannels(i);
							command.push(channels[0]);
							command.push(channels[1]);
							srt += " PORT"+ i + " (CH" + channels[0] + " CH" + channels[1]+")";
						}
					}
					return this.queue.add( () => {
						return this.webbluetooth.writeCharacteristicValue(
							UUID_CHARACTERISTIC_REMOTECONTROL,
							new Uint8Array(command)
						)
						.then( () => {
							this._log( "PVM set" + ( srt=="" ? " OFF" : srt ) );
						});
					});
				}
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

		/**
		* Helper function to find a port channel numbers
		* @param {hexadecimal} port
		* @returns {array} - hexadecimal numbers of both channels
		*/
		_getPortChannels( port ) {
			return [ CHANNEL[port*2], CHANNEL[port*2+1] ];
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

	return SBrick;

})();
