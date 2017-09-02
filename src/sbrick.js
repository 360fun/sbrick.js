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
		{ portId: 0x00, channelsId: [ 0x00, 0x01 ]},
		{ portId: 0x01, channelsId: [ 0x02, 0x03 ]},
		{ portId: 0x02, channelsId: [ 0x04, 0x05 ]},
		{ portId: 0x03, channelsId: [ 0x06, 0x07 ]}
	];

	// Port Mode
	const INPUT  = 'input';
	const OUTPUT = 'output';
	const BREAK  = 'break';

	// Direction
	const CLOCKWISE        = 0x00; // Clockwise
	const COUNTERCLOCKWISE = 0x01; // Counterclockwise

	// Values limits
	const MIN      = 0;   // No Speed
	const MAX      = 255; // Max Speed
	const MAX_QD   = 127; // Max Speed for QuickDrive
	const MAX_VOLT = 9;   // Max Voltage = Full battery

	// Times in milliseconds
	const T_KA  = 300; // Time interval for the keepalive loop (must be < 500ms - watchdog default)
	const T_PVM = 500; // Time delay for PVM completion: the registry is update approximately 5 times per second (must be > 200ms)

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
			this.PORT0    = this.TOPLEFT     = PORTS[0].portId;
			this.PORT1    = this.BOTTOMLEFT  = PORTS[1].portId;
			this.PORT2    = this.TOPRIGHT    = PORTS[2].portId;
			this.PORT3    = this.BOTTOMRIGHT = PORTS[3].portId;
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
				return this.stopAll()
				.then( ()=> {
					clearInterval( this.keepalive );
					return this.webbluetooth.disconnect();
				} );
			} )
			.catch( e => { this._error(e) } );
		}


		/**
		* Check if the SBrick is connected to the browser
		* @returns {boolean}
		*/
		isConnected() {
			return this.webbluetooth && this.webbluetooth.isConnected();
		}

		/**
		* Get the SBrick's model number
		* @returns {promise returning string}
		*/
		getModelNumber() {
			return this._deviceInfo(UUID_CHARACTERISTIC_MODELNUMBER);
		}

		/**
		* Get the SBrick's firmware version
		* @returns {promise returning string}
		*/
		getFirmwareVersion() {
			return this._deviceInfo(UUID_CHARACTERISTIC_FIRMWAREREVISION);
		}

		/**
		* Get the SBrick's hardware version
		* @returns {promise returning string}
		*/
		getHardwareVersion() {
			return this._deviceInfo(UUID_CHARACTERISTIC_HARDWAREREVISION);
		}

		/**
		* Get the SBrick's software version
		* @returns {promise returning string}
		*/
		getSoftwareVersion() {
			return this._deviceInfo(UUID_CHARACTERISTIC_SOFTWAREREVISION);
		}

		/**
		* Get the SBrick's manufacturer's name
		* @returns {promise returning string}
		*/
		getManufacturerName() {
			return this._deviceInfo(UUID_CHARACTERISTIC_MANUFACTURERNAME);
		}


		/**
		* Send drive command
		* @param {object} portObj - {portId, direction, power}
		*		portId: {number} The index (0-3) of the port to update in the this.ports array
		*		direction: {hexadecimal number} The drive direction (0x00, 0x01 - you can use the constants SBrick.CLOCKWISE and SBrick.COUNTERCLOCKWISE)
		*		power: {number} - The power level for the drive command 0-255
		* @returns {promise returning object} - Returned object: portId, direction, power
		*/
		drive( portObj ) {
			if (typeof portObj !== 'object') {
				// the old version with 3 params was used
				portObj = {
					portId: 	  arguments[0],
					direction: 	arguments[1],
					power: 		  arguments[2]
				};
				this._log('Calling drive with 3 arguments is deprecated: use 1 object {portId, direction, power} instead.');
			}

			const portId 		= portObj.portId,
						direction = portObj.direction || CLOCKWISE,
						power 		= ( portObj.power === undefined ) ? MAX : portObj.power

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
				return this._pvm( { portId:portId, mode:OUTPUT } );
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
							new Uint8Array([ CMD_DRIVE, PORTS[portId].portId, port.direction, port.power ])
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
		* Send quickDrive command
		* @param {array} portObjs - An array with a setting objects {port, direction, power} for every port you want to update
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
				let array = [];
				let allPorts = this._getPorts();
				allPorts.forEach( (portId) => {
					array.push( {
						portId: portId,
						mode: OUTPUT
					} );
				});
				console.log(array);
				return this._pvm( array );
			})
			.then( ()=> {
				// updating ports status
				portObjs.forEach( (portObj) => {
		      let portId = parseInt( portObj.portId );
		      if (isNaN(portId)) {
		        // the old version with port instead of portId was used
		        portId = parseInt( portObj.port );
		        this._log('object property port is deprecated. use portId instead.');
		      }
		      let port       = this.ports[portId];
		      port.power     = Math.min(Math.max(parseInt(Math.abs(portObj.power)), MIN), MAX);
		      port.direction = portObj.direction ? COUNTERCLOCKWISE : CLOCKWISE;
		    });
				// send command
				if(this._portsIdle(this._getPorts())) {
					// set all ports busy
		      this._setPortsBusy(this._getPorts(), true);
					this.queue.add( () => {
						let command = [];
						this.ports.forEach( (port, index) => {
								port.busy = false;
								command.push( parseInt( parseInt(port.power/MAX*MAX_QD).toString(2) + port.direction, 2 ) );
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
		* Stop a port
		* @param {number | array} portIds - The number or array of numbers of channels to stop
		* @returns {promise}
		*/
		stop( portIds ) {
			return new Promise( (resolve, reject) => {
				if( portIds!==null ) {
					if( !Array.isArray(portIds) ) {
						portIds = [ portIds ];
					}
					resolve();
				} else {
					reject('wrong input');
				}
			} )
			.then( ()=> {
				let array = [];
				portIds.forEach( (portId) => {
					array.push( {
						portId: portId,
						mode: BREAK
					} );
				});
				return this._pvm( array );
			})
			.then( ()=> {
				let portsToUpdate = [];
				// update object values and build the command
				portIds.forEach( (portId) => {
					let port = this.ports[portId];
					port.power = 0;
					if(!port.busy) {
						portsToUpdate.push(portId);
					}
				});
				if( portsToUpdate.length ) {
					this._setPortsBusy(portsToUpdate, true);
					this.queue.add( () => {
						this._setPortsBusy(portsToUpdate, false);
						return this.webbluetooth.writeCharacteristicValue(
							UUID_CHARACTERISTIC_REMOTECONTROL,
							new Uint8Array( [ CMD_BREAK ].concat(portsToUpdate) )
						);
					});
				}
			})
			.then( () => {
				// all went well, return an array with the channels and the settings we just applied
				let returnData = [];
				portIds.forEach((portId) => {
					// send event for this port
					let portData = this._getPortData(portId);
					this._sendPortChangeEvent(portData);
					returnData.push(portData);
				});
				return returnData;
			})
			.catch( e => { this._error(e) } );
		}


		/**
		* Stop all ports
		* @returns {promise}
		*/
		stopAll() {
			return this.stop( this._getPorts() );
		}


		/**
		* Get battery percentage
		* @returns {promise returning number}
		*/
		getBattery() {
			return this._volt()
			.then( volt => {
				return parseInt( Math.abs( volt / MAX_VOLT * 100 ) );
			});
		}


		/**
		* Get sbrick's temperature in degrees Celsius (default) or Fahrenheit
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
			}).then( () => {
				let newPortStatus = { portId: portId, mode:INPUT };
				// reset the port if is in "break mode" (short circuited) or driving before activate PVM
				if(this.ports[portId].mode===BREAK || this.ports[portId].power!=0) {
					return this.drive(portId,CLOCKWISE,0)
					.then( () => {
						return this._pvm( newPortStatus );
					} );
				} else {
					return this._pvm( newPortStatus );
				}
			}).then( () => {
				let channels = this._getPortChannels(portId);
				return this._adc([CMD_ADC_VOLT].concat(channels))
				.then( data => {
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
			}, T_KA);
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
		* @param {array} portObjs - an array of port status objects { portId, mode: INPUT-OUTPUT}
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
					let mode = portObj.mode;
					if( this.ports[portId].mode != mode ) {
						this.ports[portId].mode = mode;
						update_pvm = true;
					}
				});
				if(update_pvm) {
					let command = [CMD_PVM];
					let srt = "";
					this.ports.forEach( (port, i) => {
						if(port.mode==INPUT) {
							let channels = this._getPortChannels(i);
							command.push(channels[0]);
							command.push(channels[1]);
							srt += " PORT"+ i + " (CH" + channels[0] + " CH" + channels[1]+")";
						}
					});
					this.queue.add( () => {
						return this.webbluetooth.writeCharacteristicValue(
							UUID_CHARACTERISTIC_REMOTECONTROL,
							new Uint8Array(command)
						)
						.then( () => {
							this._log( "PVM set" + ( srt=="" ? " OFF" : srt ) );
						});
					});
					// PVM has a delay before start to collect actual data
					return this._delay(T_PVM);
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
		* Helper function to get ports Ids
		* @returns {boolean}
		*/
		_getPorts() {
			return PORTS.map( function(obj) {return obj.portId;} );
		}

		/**
		* Helper function to find a port channel numbers
		* @param {number} portId - The index of the port in the this.ports array
		* @returns {array} - hexadecimal numbers of both channels
		*/
		_getPortChannels( portId ) {
			return PORTS[portId].channelsId;
		}

		/**
		* Get the settings of a specific port
		* @returns {object} portId, direction, power
		*/
		_getPortData(portId) {
			const port = this.ports[portId],
				data = {
					portId:    portId,
					direction: port.direction,
					power:     port.power,
					mode:      port.mode
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
		* Delay promise
		* @param {number} t - time in milliseconds
		*/
		_delay(t) {
			return new Promise(function(resolve) {
		 		setTimeout(resolve, t)
		 	});
		}

		/**
		* Trigger event on body to notify listeners that a port's values have changed
		* @param {object} portData - The data ({portId, power, direction}) for the port that was changed
		* @returns {undefined}
		*/
		_sendPortChangeEvent( portData ) {
			const event = new CustomEvent('portchange.sbrick', {detail: portData});
			document.body.dispatchEvent(event);
		}

		/**
		* Check if ports are busy
		* @returns {boolean}
		*/
		_portsIdle(ports) {
			let allAreIdle = true;
			ports.forEach( (port) => {
				if (this.ports[port].busy) {
					allAreIdle = false;
				}
			});
			return allAreIdle;
		}

		/**
		* Set all ports to busy
		* @returns {undefined}
		*/
		_setPortsBusy(ports, status) {
			ports.forEach( (port) => {
				this.ports[port].busy = status;
			});
		};

	}

	return SBrick;

})();
