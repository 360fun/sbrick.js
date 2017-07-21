# sbrick.js
JavaScript library to control SBrick (a [Lego® Power Functions](https://www.lego.com/en-us/powerfunctions) compatible Bluetooth controller) through [Web Bluetooth APIs](https://www.w3.org/community/web-bluetooth/).

Project page: [sbrick.360fun.net](http://sbrick.360fun.net/)

### Requirements
Check your [browser and platform implementation status](https://github.com/WebBluetoothCG/web-bluetooth/blob/gh-pages/implementation-status.md) first.

[bluetooth.js](https://github.com/360fun/bluetooth.js) Generic library that I previusly made to simplify the use of the Web BLuetooth APIs.

[promise-queue](https://github.com/azproduction/promise-queue) Promise-based Queue library, since ECMAScript 6 doesn't implement one by itself.

You must have a SBrick or SBrick Plus in order to use this library with your Lego® creations.

### Supported Firmware
The currently supported firmware is 4.17+, so upgrade your SBrick to be compatible with the [SBrick protocol 17](https://social.sbrick.com/wiki/view/pageId/11/slug/the-sbrick-ble-protocol).

### Services
Device information - 180a
* Model number string
* Firmware revision string
* Hardware revision string
* Software revision string
* Manufacturer string

Remote control service - 4dc591b0-857c-41de-b5f1-15abda665b0c (**partially implemented**)
* 00 Break
* 01 Drive
* 0F Query ADC (Temperature, Battery voltage + Sensor measurements on Sbrick Plus)
* 2C PVM (Periodic Voltage Measurements on SBrick Plus)

Quick Drive - 489a6ae0-c1ab-4c9c-bdb2-11d373c1b7fb

OTA service - 1d14d6ee-fd63-4fa1-bfa4-8f47b42119f0 (**NOT implemented**)


### Usage

In order to use the class is necessary to create an instance of it, in this way is possible to connect **multiple Sbricks** at the same time! ;)

If not specified any name the discovery popup will show all the nearby BLE devices, otherwise it will filter them by the given string.
	
	let SBRICK1 = new SBrick(); // create a new SBrick object
	let SBRICK2 = new SBrick('SBrick'); // create a new SBrick object and set the device name
	
	SBRICK1.connect(); // open a popup showing all the BLE devices nearby
	
	SBRICK2.connect(); // show only the SBricks with "Sbrick" in their name (so also "SBrick1" for example)
	.then( ()=> {
		// the SBrick is now connected
	} );
  
	SBRICK1.disconnect()
	.then( ()=> {
		// the SBrick is now disconnected
	} );
 
Check if the SBrick is connected:

	SBRICK1.isConnected(); // returns true or false

Get basic SBrick Informations:

	SBRICK1.getModelNumber().then( model => {
		alert( model );
	});
	SBRICK1.getFirmwareVersion().then( version => {
		alert( version );
	});
	SBRICK1.getHardwareVersion().then( version => {
		alert( version );
	});
	SBRICK1.getSoftwareVersion().then( version => {
		alert( version );
	});
	SBRICK1.getManufacturerName().then( version => {
		alert( version );
	});
	
Sending a command is pretty easy and some constants will help the process:

	SBRICK1.CHANNEL0-3 // Channels 0 to 3
	SBRICK1.CW-CCW     // Clockwise and Counterclockwise
	SBRICK1.MIN        // Minimum power
	SBRICK1.MAX	   // Maximum power for Drive (255)


Get the Battery voltage:

	SBRICK1.getBattery()
	.then( battery => {
		alert( battery + '%' );
	} );


Get the SBrick internal Temperature:

	let fahrenheit = true-false; // default is false: C°
	SBRICK1.getTemp(fahrenheit)
	.then( temp => {
		alert( temp + fahrenheit ? ' F°' : ' C°' );
	});

Get sensor data (SBrick Plus only!) - [work in progress](https://social.sbrick.com/forums/topic/511/-/view/post_id/5125):

	SBRICK1.getSensor(SBRICK1.PORT0)
	.then( data => {
		console.log( data );
	});
	
To send a Drive command is pretty easy, are just needed: channel, direction and power.
For example, the Channel 0 (supposedly a motor) drives in clockwise direction at the maximum (255) speed:

	SBRICK1.drive( SBRICK1.CHANNEL0, SBRICK1.CW, SBRICK1.MAX );
	
QuickDrive permits to send up to 4 Drive commands at the same instant, without any delay between the channels.
It accepts an Array of Objects (1 to 4) or a single Object (but better use Drive in that case).
In the following example Channel 0 and 1 start to drive both in clockwise direction at the max speed:

	SBRICK1.quickDrive( [
		{ channel: SBRICK1.CHANNEL0, direction: SBRICK1.CW, power: SBRICK1.MAX }
		{ channel: SBRICK1.CHANNEL1, direction: SBRICK1.CW, power: SBRICK1.MAX }
	] );
	
Stop a specific Channel.
	
	SBRICK1.stop( SBrick.CHANNEL0 ); //stops Channel 0
	
Stop all Channels at once.
	
	SBRICK1.stopAll();
	
  
### Limitations
SBrick Plus support is partially implemented: any help will be appreciated!

### Known Bugs
I tried my best to manage errors but there's more work to be done.

### Support or Contact
Francesco Marino - [francesco@360fun.net](mailto:francesco@360fun.net) - [www.360fun.net](http://www.360fun.net)

[Vengit Limited](https://www.vengit.com/) - [SBrick](https://www.sbrick.com/)
