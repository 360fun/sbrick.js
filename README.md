# sbrick.js
JavaScript library for control SBrick (a Lego® Power Functions compatible Bluetooth controller) through Web Bluetooth APIs.

### Requirements
Check your [browser and platform implementation status](https://github.com/WebBluetoothCG/web-bluetooth/blob/gh-pages/implementation-status.md) first.

[bluetooth.js](https://github.com/360fun/bluetooth.js) Generic library that I previusly made to simplify the use of the Web BLuetooth APIs.

[promise-queue](https://github.com/azproduction/promise-queue) Promise-based Queue library, since ECMAScript 6 doesn't implement one by itself.

You must have a SBrick or SBrick Plus in order to use this library with your Lego® creations.

### Supported Firmware
The currently supported firmware is 4.17, compatible with the [SBrick protocol 17](https://social.sbrick.com/wiki/view/pageId/11/slug/the-sbrick-ble-protocol).

### Services Implemeted
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

### Services NOT Implemeted
OTA service - 1d14d6ee-fd63-4fa1-bfa4-8f47b42119f0


### Usage

	The SBrick name for the moment is required, the default one is "SBrick", otherwise the discovery will show all nearby devices.
	SBrick.connect("SBrick")
	.then( ()=> {
		// SBrick now is connected
	} );
  
	SBrick.disconnect()
	.then( ()=> {
		// SBrick now is disconnected
	} );
  
	Drive the channel 0 (supposedly a motor) in clockwise at maximum (255) speed.
	SBrick.drive(SBrick.CHANNEL0, SBrick.CW, SBrick.MAX);

  
	SBrick.disconnect()
	.then( ()=> {
		// SBrick now is disconnected
	} );

  
### Limitations
SBrick Plus works with the same protocol of SBrick so it will supposedly work but it will leak of the ability to read input values. Right now I don't own an SBrick Plus so you have to wait for this functionality.

### Known Bugs
I tried my best to manage errors but there's more work to be done.

### Support or Contact
Francesco Marino - [francesco@360fun.net](mailto:francesco@360fun.net) - [www.360fun.net](http://www.360fun.net)

[SBrick](https://www.sbrick.com/)
