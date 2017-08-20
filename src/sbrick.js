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
	const PORTS = [
		{ hexId: 0x00, channelHexIds: [ 0x00, 0x01 ]},
		{ hexId: 0x01, channelHexIds: [ 0x02, 0x03 ]},
		{ hexId: 0x02, channelHexIds: [ 0x04, 0x05 ]},
		{ hexId: 0x03, channelHexIds: [ 0x06, 0x07 ]}
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
			this.PORT0    = PORTS[0].hexId;
			this.PORT1    = PORTS[1].hexId;
			this.PORT2    = PORTS[2].hexId;
			this.PORT3    = PORTS[3].hexId;
			this.CW       = CLOCKWISE;
			this.CCW      = COUNTERCLOCKWISE;
			this.MAX      = MAX;
			this.SERVICES = {}

			// status
			this.keepalive = null;
			this.ports     = [
				{ id: 0, power: MIN, direction: CLOCKWISE, mode: OUTPUT, pvmActive: false, busy: false },
				{ id: 1, power: MIN, direction: CLOCKWISE, mode: OUTPUT, pvmActive: false, busy: false },
				{ id: 2, power: MIN, direction: CLOCKWISE, mode: OUTPUT, pvmActive: false, busy: false },
				{ id: 3, power: MIN, direction: CLOCKWISE, mode: OUTPUT, pvmActive: false, busy: false }
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
		* @returns {promise returning undefined}
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
						// version = FIRMWARE_COMPATIBILITY;
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

		/**
		* Disconnect the SBrick
		* @returns {promise returning undefined}
		*/
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


		/**
		* check if the SBrick is connected to the browser
		* @returns {boolean}
		*/
		isConnected() {
			return this.webbluetooth && this.webbluetooth.isConnected();
		}

		/**
		* get the SBrick's model number
		* @returns {promise returning string}
		*/
		getModelNumber() {
			return this._deviceInfo(UUID_CHARACTERISTIC_MODELNUMBER);
		}

		/**
		* get the SBrick's firmware version
		* @returns {promise returning string}
		*/
		getFirmwareVersion() {
			return this._deviceInfo(UUID_CHARACTERISTIC_FIRMWAREREVISION);
		}

		/**
		* get the SBrick's hardware version
		* @returns {promise returning string}
		*/
		getHardwareVersion() {
			return this._deviceInfo(UUID_CHARACTERISTIC_HARDWAREREVISION);
		}

		/**
		* get the SBrick's software version
		* @returns {promise returning string}
		*/
		getSoftwareVersion() {
			return this._deviceInfo(UUID_CHARACTERISTIC_SOFTWAREREVISION);
		}

		/**
		* get the SBrick's manufacturer's name
		* @returns {promise returning string}
		*/
		getManufacturerName() {
			return this._deviceInfo(UUID_CHARACTERISTIC_MANUFACTURERNAME);
		}


		/**
		* send drive command
		* @param {object} portObj - {portId, direction, power}
		*		portId: {number} The index (0-3) of the port to update in the this.ports array
		*		direction: {hexadecimal number} The drive direction (0x00, 0x01 - you can use the constants SBrick.CLOCKWISE and SBrick.COUNTERCLOCKWISE)
		*		power {number} - The power level for the drive command 0-255
		* @returns {promise returning object} - Returned object: portId, direction, power
		*/
		drive( portObj ) {
			if (typeof portObj !== 'object') {
				// the old version with 3 params was used
				portObj = {
					portId: 	arguments[0],
					direction: 	arguments[1] || CLOCKWISE,
					power: 		arguments[2]
				};
				this._log('calling drive with 3 arguments is deprecated. use 1 object {portId, direction, power} instead.');
			}

			const portId = portObj.portId,
				direction = portObj.direction || CLOCKWISE,
				power = portObj.power;

			return new Promise( (resolve, reject) => {
				if( portId !== undefined && direction !== undefined && power !== undefined ) {
					resolve();
				} else {
					let msg = 'Wrong input: please specify ';
					if (portId === undefined) { msg += 'portId'; }
					if (power === undefined) {
						if (portId === undefined) {	msg += ' and'; }
						msg += ' power';
					}
					reject(msg);
				}
			} )
			.then( ()=> {
				// I think this promise could be removed:
				// all ports have mode:OUTPUT by default
				// and only change from OUTPUT to INPUT on sensors
				// output ports don't need pvm
				return this._pvm( { portId:portId, mode:OUTPUT, pvmActive: false } );
			})
			.then( () => {
				let port = this.ports[portId];

				port.power     = Math.min(Math.max(parseInt(Math.abs(power)), MIN), MAX);
				port.direction = direction ? COUNTERCLOCKWISE : CLOCKWISE;

				if( !port.busy ) {
					port.busy = true;
					this.queue.add( () => {
						port.busy = false;
						return this.webbluetooth.writeCharacteristicValue(
							UUID_CHARACTERISTIC_REMOTECONTROL,
							new Uint8Array([ CMD_DRIVE, PORTS[portId].hexId, port.direction, port.power ])
						) }
					);
				}
			})
			.then( () => {
				// all went well, send event and return the settings we just applied
				let portData = this._getPortData(portId);
				this._sendPortChangeEvent(portData);
				// return the new settings to the promise
				return portData;
			})
			.catch( e => { this._error(e) } );
		}


		/**
		* send quickDrive command
		* @param {array} portObjs - An array with a setting objects {port, direction, power}
									for every port you want to update
		* @returns {promise returning array} - Returned array: [{portId, direction, power}, {...}, {...}, {...}]
		*/
		quickDrive( portObjs ) {
			return new Promise( (resolve, reject) => {
				if( Array.isArray(portObjs) ) {
					resolve();
				} else {
					reject('Wrong input: quickDrive expects array');
				}
			} )
			.then( ()=> {
				portObjs.forEach( (portObj) => {
					let portId = parseInt( portObj.portId );
					if (isNaN(portId)) {
						// the old version with port instead of portId was used
						portId = parseInt( portObj.port );
						this._log('object property port is deprecated. use portId instead.');
					}
					let port = this.ports[portId];
					port.power     = Math.min(Math.max(parseInt(Math.abs(portObj.power)), MIN), MAX);
					port.direction = portObj.direction ? COUNTERCLOCKWISE : CLOCKWISE;
				});
				
				if(this._allPortsAreIdle()) {
					this._setAllPortsBusy();

					this.queue.add( () => {
						let command = [];
						this.ports.forEach( (port) => {
							port.busy = false;
							if( port.mode===OUTPUT ) {
								command.push( parseInt( parseInt(port.power/MAX*MAX_QD).toString(2) + port.direction, 2 ) );
							} else {
								command.push( null );
							}
						});
						
						return this.webbluetooth.writeCharacteristicValue(
							UUID_CHARACTERISTIC_QUICKDRIVE,
							new Uint8Array( command )
						);
					});
				}
			})
			.then( () => {
				// all went well, return an array with the channels and the settings we just applied
				let returnData = [];

				portObjs.forEach((portObj) => {
					let portId = portObj.portId;
					if (portObj.port) {
						// it uses the old syntax
						portId = parseInt( portObj.port );
					}

					//send event for this port
					let portData = this._getPortData(portId);
					this._sendPortChangeEvent(portData);
					returnData.push(portData);
				});
				return returnData;
			})
			.catch( e => { this._error(e) } );
		}


		/**
		* stop a port
		* @param {number | array} portIds - The number or array of numbers of channels to stop
		* @returns {promise}
		*/
		stop( portIds ) {
			return new Promise( (resolve, reject) => {
				if( portIds!==null ) {
					resolve();
				} else {
					reject('wrong input');
				}
			} )
			.then( ()=> {
				let array = [];
				if( !Array.isArray(portIds) ) {
					portIds = [ portIds ];
				}
				portIds.forEach( (portId) => {
					// set pvm of input ports to false
					const port = this.ports[portId];
					let pvmActive = true;
					if (port.mode === INPUT) {
						pvmActive = false;
					}
					// TODO: I think object needs only to be pushed when it's input-port
					array.push( {
						portId: portId,
						mode: port.mode,
						pvmActive: pvmActive
					} );
				});
				return this._pvm( array );
			})
			.then( ()=> {
				let command = [ CMD_BREAK ];
				// update object values and build the command
				// only send command to output ports, otherwise sensor values get messed up
				portIds.forEach( (portId) => {
					let port = this.ports[portId];
					if (port.mode === OUTPUT) {
						port.power = 0;
						command.push(PORTS[portId].hexId);
					}
				});

				if (command.length > 1) {
					// there is at least one output port
					this.queue.add( () => {
						return this.webbluetooth.writeCharacteristicValue(
							UUID_CHARACTERISTIC_REMOTECONTROL,
							new Uint8Array( command )
						);
					});
				}
			})
			.then( () => {
				// all went well, return an array with the channels and the settings we just applied
				let returnData = [];

				portIds.forEach((portId) => {
					
					//send event for this port
					let portData = this._getPortData(portId);
					this._sendPortChangeEvent(portData);
					returnData.push(portData);
				});
				return returnData;
			})
			.catch( e => { this._error(e) } );
		}


		/**
		* stop all ports
		* @returns {promise}
		*/
		stopAll() {
			return this.stop([0, 1, 2, 3])
		}


		/**
		* get battery percentage
		* @returns {promise returning number}
		*/
		getBattery() {
			return this._volt()
			.then( volt => {
				return parseInt( Math.abs( volt / MAX_VOLT * 100 ) );
			});
		}


		/**
		* get sbrick's temperature in degrees Celsius (default) or Fahrenheit
		* @param {boolean} fahrenheit - If true, temperature is returned in Fahrenheit
		* @returns {promise returning number}
		*/
		getTemp( fahrenheit = false) {
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
		* Read sensor data on a specific PORT
		* @param {hexadecimal} portId - The index of the port in the this.ports array
		* @param {string} sensorSeries - not implemented yet - in the future it will manage different sensor series (wedo, EV3, NXT, ...)
		* @returns {promise} - sensor measurement Object (structure depends on the sensor type)
		*/
		getSensor( portId, sensorSeries ) {
			return new Promise( (resolve, reject) => {
				if( portId !== null ) {
					resolve();
				} else {
					reject('wrong input');
				}
			}).then( ()=> {
				this.ports[portId].mode = INPUT;// apparently, this is a sensor. So make sure its mode is set to input
				return this._pvm( { portId: portId, mode:INPUT, pvmActive: true } );
			}).then( ()=> {
				let channels = this._getPortChannels(portId);
				return this._adc([CMD_ADC_VOLT].concat(channels)).then( data => {
					let arrayData = [];
					for (let i = 0; i < data.byteLength; i+=2) {
						arrayData.push( data.getUint16(i, true) );
					}
					let sensorData = {
						type: 'unknown',
						voltage: arrayData[0] >> 4,
						ch0_raw: arrayData[1] >> 4,
						ch1_raw: arrayData[2] >> 4
					};

					// Sensor Type Management
					switch(sensorSeries) {
						case "wedo":
							let typeId  = Math.round( ( sensorData.ch0_raw / sensorData.voltage ) * 255 );
							let value = Math.round( ( sensorData.ch1_raw / sensorData.voltage ) * 255 );
							sensorData.type  = ( typeId >= 48 && typeId <= 50 ) ? "tilt" : "motion";
							sensorData.value = value;
							break;

						default:
							sensorData.value = sensorData.ch1_raw / sensorData.voltage;
					}
					return sensorData;
				} );
			});
		}

		/**
		* Helper function to invert CW in CCW and vice versa
		* @param {hex number} direction
		*/
		invDir( direction ) {
			return direction ? CLOCKWISE : COUNTERCLOCKWISE;
		}


		// PRIVATE FUNCTIONS

		/**
		* Read some common Blutooth devices informations about the SBrick
		* @param {hexadecimal|string} uuid_characteristic
		* @returns {promise}
		*/
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

		/**
		* Keep the connection alive, preventing the SBrick internal watchdog (500 millisec by default) to close it
		*/
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

		/**
		* Read the ADC sensor "variables" where each specific channel values are stored
		* every PORT has 2 channels so use CHANNEL[0-7] to read sensor data
		* the remaining 2 channels are for the chip TEMPERATURE (0x08) and battery VOLTAGE (0x09)
		* @param {array} array_channels - an array of channels CHANNEL[0-7], TEMPERATURE or VOLTAGE
		* @returns {promise} - voltage measurement
		*/
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
		* @param {array} portObjs - an array of port status objects { portId, mode: INPUT | OUTPUT, pvmActive: true | false}
		* @returns {promise} - undefined
		*/
		_pvm( portObjs ) {
			return new Promise( (resolve, reject) => {
				if( portObjs !== null ) {
					resolve();
				} else {
					reject('wrong input');
				}
			} ).then( ()=> {
				if( !Array.isArray(portObjs) ) {
					portObjs = [ portObjs ];
				}

				let update_pvm = false;
				portObjs.forEach( (portObj) => {
					let portId = portObj.portId;
					let pvmActive = portObj.pvmActive;
					if( this.ports[portId].pvmActive != pvmActive ) {
						this.ports[portId].pvmActive = pvmActive;
						update_pvm = true;
					}
				});

				if(update_pvm) {
					let command = [CMD_PVM];
					let srt = "";
					this.ports.forEach( (port, i) => {
						if(port.pvmActive === true) {
							let channels = this._getPortChannels(i);
							command.push(channels[0]);
							command.push(channels[1]);
							srt += " PORT"+ i + " (CH" + channels[0] + " CH" + channels[1]+")";
						}
					});

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
				return false;
			});
		}


		/**
		* Get the SBrick battery voltage
		* @returns {number} - voltage in Volts
		*/
		_volt() {
			return this._adc(CMD_ADC_VOLT).then( data => {
				let volt = data.getInt16( 0, true );
				return parseFloat( volt * 0.83875 / 2047.0 ); // V;
			} );
		}

		/**
		* Get the SBrick internal temperature
		* @returns {number} - temperature in Celsius
		*/
		_temp() {
			return this._adc(CMD_ADC_TEMP).then( data => {
				let temp = data.getInt16( 0, true );
				return parseFloat(temp / 118.85795 - 160); // °C;
			} );
		}

		/**
		* Helper function to find a port channel numbers
		* @param {number} portId - The index of the port in the this.ports array
		* @returns {array} - hexadecimal numbers of both channels
		*/
		_getPortChannels( portId ) {
			return PORTS[portId].channelHexIds;
		}

		/**
		* get the settings of a specific port
		* @returns {object} portId, direction, power
		*/
		_getPortData(portId) {
			const port = this.ports[portId],
				data = {
					portId: portId,
					direction: port.direction,
					power: port.power
				};
			return data;
		}

		/**
		* Error management
		* @param {string} msg - message to print or throw
		*/
		_error( msg ) {
			if(this._debug) {
				console.debug(msg);
			} else {
				throw msg;
			}
		}

		/**
		* Log
		* @param {string} msg - message to print
		*/
		_log( msg ) {
			if(this._debug) {
				console.log(msg);
			}
		}

		/**
		* trigger event on body to notify listeners that a port's values have changed
		* @param {object} portData - The data ({portId, power, direction}) for the port that was changed
		* @returns {undefined}
		*/
		_sendPortChangeEvent( portData ) {
			const event = new CustomEvent('portchange.sbrick', {detail: portData});
			document.body.dispatchEvent(event);
		}

		/**
		* check if no port is busy
		* @returns {boolean}
		*/
		_allPortsAreIdle() {
			let allAreIdle = true;
			this.ports.forEach((port) => {
				if (port.busy) {
					allAreIdle = false;
				}
			});
			
			return allAreIdle;
		}


		/**
		* set all ports to busy
		* @returns {undefined}
		*/
		_setAllPortsBusy() {
			this.ports.forEach((port) => {
				port.busy = true;
			});
		};



	}

	return SBrick;

})();
