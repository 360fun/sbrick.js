# sbrick.js
JavaScript library to control SBrick (a [Lego® Power Functions](https://www.lego.com/en-us/powerfunctions) compatible Bluetooth controller) through [Web Bluetooth APIs](https://www.w3.org/community/web-bluetooth/).

Project page: [sbrick.360fun.net](http://sbrick.360fun.net/)

### Requirements
Check your [browser and platform implementation status](https://github.com/WebBluetoothCG/web-bluetooth/blob/gh-pages/implementation-status.md) first.

[bluetooth.js](https://github.com/360fun/bluetooth.js) Generic library that I previusly made to simplify the use of the Web BLuetooth APIs.

[promise-queue](https://github.com/azproduction/promise-queue) Promise-based Queue library, since ECMAScript 6 doesn't implement one by itself.

You must have a SBrick or SBrick Plus in order to use this library with your Lego® creations.

### Supported Firmware
The currently supported firmware is 4.17, compatible with the [SBrick protocol 17](https://social.sbrick.com/wiki/view/pageId/11/slug/the-sbrick-ble-protocol).

### Services Implemented
Device information - 180a
* Model number string
* Firmware revision string
* Hardware revision string
* Software revision string
* Manufacturer string

Remote control service - 4dc591b0-857c-41de-b5f1-15abda665b0c (partially)
* 00 Break
* 01 Drive
* 0F Query ADC (Temperature & Voltage)

Quick Drive - 489a6ae0-c1ab-4c9c-bdb2-11d373c1b7fb

### Services NOT Implemented
OTA service - 1d14d6ee-fd63-4fa1-bfa4-8f47b42119f0


### Usage

When you load the library an instance of the Class SBrick is automatically allocated and can be referenced with "SBrick".

The SBrick name for the moment is required, by default should be "SBrick", if not specified the discovery popup will show all nearby Bluetooth devices.
	
	let SBRICKNAME = 'SBrick';
	SBrick.connect(SBRICKNAME)
	.then( ()=> {
		// SBrick now is connected
	} );
  
	SBrick.disconnect()
	.then( ()=> {
		// SBrick now is disconnected
	} );
 
Check if the SBrick is connected:

	SBrick.isConnected()
	.then( ()=> {
		// SBrick now is disconnected
	} );

Get basic SBrick Informations:

	SBrick.getModelNumber().then( model => {
		alert( model );
	});
	SBrick.getFirmwareVersion().then( version => {
		alert( version );
	});
	SBrick.getHardwareVersion().then( version => {
		alert( version );
	});
	SBrick.getSoftwareVersion().then( version => {
		alert( version );
	});
	SBrick.getManufacturerName().then( version => {
		alert( version );
	});
	
Sending a command is pretty easy and some constants will help the process:

	SBrick.CHANNEL0-3 // Channels 0 to 3
	SBrick.CW-CCW     // Clockwise and Counterclockwise
	SBrick.MIN        // Minimum power
	SBrick.MAX	  // Maximum power for Drive (255)
	SBrick.MAX_QD     // Maximum Power for QuickDrive (127): so the control is a bit less precise
	SBrick.MAX_VOLT   // Battery Pack Voltage: normally is 9V


Get the Battery voltage:

	SBrick.getBattery()
	.then( battery => {
		alert( battery + '%' );
	} );


Get the SBrick internal Temperature:

	let fahrenheit = true-false; // default is false: C°
	SBrick.getTemp(fahrenheit)
	.then(temp => {
		alert( temp + fahrenheit ? ' F°' : ' C°' );
	});
	
	
To send a Drive command is pretty easy, are just needed: channel, direction and power.
For example, the Channel 0 (supposedly a motor) drives in clockwise direction at the maximum (255) speed:

	SBrick.drive( SBrick.CHANNEL0, SBrick.CW, SBrick.MAX );
	
QuickDrive permits to send up to 4 Drive commands at the same instant, without any delay between the channels.
It accepts an Array of Objects (1 to 4) or a single Object (but better use Drive in that case).
In the following example Channel 0 and 1 start to drive both in clockwise direction at the max speed:

	SBrick.quickDrive( [
		{ channel: SBrick.CHANNEL0, direction: SBrick.CW, power: SBrick.MAX }
		{ channel: SBrick.CHANNEL1, direction: SBrick.CW, power: SBrick.MAX }
	] );
	
Stop a specific Channel.
	
	SBrick.stop( SBrick.CHANNEL0 ); //stops Channel 0
	
Stop all Channels at once.
	
	SBrick.stopAll();
	
  
### Limitations
SBrick Plus works with the same protocol of SBrick so it will supposedly work but it will leak of the ability to read input values. Right now I don't own an SBrick Plus so you have to wait for this functionality.

### Known Bugs
I tried my best to manage errors but there's more work to be done.

### Support or Contact
Francesco Marino - [francesco@360fun.net](mailto:francesco@360fun.net) - [www.360fun.net](http://www.360fun.net)

[Vengit Limited](https://www.vengit.com/) - [SBrick](https://www.sbrick.com/)
