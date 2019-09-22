
'use strict';

const log = require("./logger")._system;

const version = require('./version');

//const util = require('util');

const tradfriLib = require("node-tradfri-client");

const discoverGateway = tradfriLib.discoverGateway;

const TradfriClient = tradfriLib.TradfriClient;
//const Accessory = tradfriLib.Accessory;
const AccessoryTypes = tradfriLib.AccessoryTypes;
const PowerSources = tradfriLib.PowerSources;

module.exports = {
  Tradfri: Tradfri
}

function Tradfri() {
  //this.credentials = { identity: 'tradfri_1547841360224', psk: 'pe1yDkmUJgCjulUG' };

  this.ip = ip;
  this.security_code = security_code;

  if( identity && psk )
    this.credentials = { identity: identity, psk: psk };

  this.lights = {};
  this.blinds = {};
  this.remotes = {};
  this.groups = {};
  this.scenes = {};
}

var ip;
Tradfri.ip = function(_ip) {
 ip = _ip;
}
var security_code;
Tradfri.securityCode = function(s) {
  security_code = s;
}
var identity;
Tradfri.identity = function(i) {
  identity = i;
}
var psk;
Tradfri.psk = function(p) {
  psk = p;
}

async function start() {
  let tradfri;

  if( this.ip ) {
    tradfri = new TradfriClient(this.ip);
  } else {
    log.info( 'discovering gateways' );
    const gateway = await discoverGateway();
    log.info( '  found gateway: '+ JSON.stringify(gateway) );

    tradfri = new TradfriClient(gateway.host);
  }

  this.tradfri = tradfri;
  log.info( 'connecting to: '+ tradfri.hostname );

  if( this.security_code && !this.credentials ) {
    try {
      const {identity, psk} = await tradfri.authenticate(this.security_code);

      console.log( '*** FHEM: identity: '+ identity );
      console.log( '*** FHEM: psk: '+ psk );

      this.credentials = { identity: identity, psk: psk };
    } catch(e) {
      console.log( '*** FHEM: connection failed, '+ e );
      this.shutdown();
    }
  }

  if( !this.credentials ) {
    console.log( '*** FHEM: connection failed, credentials missing' );
    this.shutdown();
  }

  try {
    await tradfri.connect(this.credentials.identity, this.credentials.psk);
  } catch(e) {
    console.log( '*** FHEM: connection failed, credentials wrong' );
    this.shutdown();
  }

  tradfri
   .on("gateway updated", this.gatewayUpdated.bind(this))
   .on("device updated", this.deviceUpdated.bind(this))
   .on("device removed", this.deviceRemoved.bind(this))
   .on("group updated", this.groupUpdated.bind(this))
   .on("group removed", this.groupRemoved.bind(this))
   .on("scene updated", this.sceneUpdated.bind(this))
   .on("scene removed", this.sceneRemoved.bind(this));

   tradfri.observeGateway();
   //tradfri.observeNotifications();
   tradfri.observeDevices();
   tradfri.observeGroupsAndScenes();
}

 async function operate(json) {
  if( typeof json !== 'object' )
    return;
  if( !json.id )
    return;

  if( json.t === 'group' ) {
    let group = this.groups[json.id];
    if( group ) {
      let operation = {};
      if( json.on !== undefined )                      operation.onOff = json.on;
      if( json.bri !== undefined )                    operation.dimmer = json.bri/2.54;
      if( json.transitiontime !== undefined ) operation.transitionTime = json.transitiontime/10;
      if( json.sceneId !== undefined )               operation.sceneId = json.sceneId;

      log.debug( operation );
      await this.tradfri.operateGroup(group, operation, true);
    }
  } else {
    let device = this.lights[json.id];
    if( device ) {
      let operation = {};
      if( json.on !== undefined )                         operation.onOff = json.on;
      if( json.bri !== undefined )                       operation.dimmer = json.bri/2.54;
      if( json.ct !== undefined )              operation.colorTemperature = (json.ct-250)/2.04;
      if( json.hue !== undefined )                          operation.hue = json.hue*359/65535;
      if( json.sat !== undefined )                   operation.saturation = json.sat/2.54;
      if( json.transitiontime !== undefined )    operation.transitionTime = json.transitiontime/10;

      //transitionTime: number;
      //colorTemperature: number;
      //color: string;
      //hue: number;
      //saturation: number;

      //console.log( operation );

      log.debug( operation );

      if( device.type === AccessoryTypes.lightbulb )
        await this.tradfri.operateLight(device, operation);
      else if( device.type === AccessoryTypes.plug )
        await this.tradfri.operatePlug(device, operation);

    } else {
      let device = this.blinds[json.id];
      if( device ) {
        let operation = {};
        if( json.pct !== undefined )                         operation.position = json.pct;

        log.debug( operation );

        if( device.type === AccessoryTypes.blind )
          await this.tradfri.operateBlind(device, operation);
      }
    }
  }
}
Tradfri.prototype.HUE2gateway = function( json ) {
  log.debug( json );

  try {
    operate.bind(this)(json);
  } catch(e) {
    log.error( 'failed to send command' );
    log.debug( e );
  }
}



Tradfri.prototype.device2HUE = function( device ) {
   var hue = { "name" : device.name,
               "modelid" : device.deviceInfo.modelNumber,
               "manufacturername" : device.deviceInfo.manufacturer,
               "uniqueid" : device.deviceInfo.serialNumber,
               "swversion" : device.deviceInfo.firmwareVersion };

  if( device.deviceInfo.power && PowerSources[device.deviceInfo.power] )
    hue.power = PowerSources[device.deviceInfo.power];

  if( device.type === AccessoryTypes.lightbulb ) {
    hue.r = 'lights';
    switch( device.lightList[0].spectrum ) {
      case 'rgb':
        hue.type = "Color light";
        hue.state = { "on" : device.lightList[0].onOff,
                      "colormode" : "hsv",
                      "bri" : parseInt(device.lightList[0].dimmer*2.54),
                      "ct" : parseInt(250+2.04*device.lightList[0].colorTemperature),
                      "hue" : parseInt(device.lightList[0].hue*65535/359),
                      "sat" : parseInt(device.lightList[0].saturation*254/100),
                      "rgb" : device.lightList[0].color };
        break;
      case 'white':
        hue.type = "Color temperature light";
        hue.state = { "on" : device.lightList[0].onOff,
                      "colormode" : "ct",
                      "bri" : parseInt(device.lightList[0].dimmer*2.54),
                      "ct" : parseInt(250+2.04*device.lightList[0].colorTemperature),
                      "rgb" : device.lightList[0].color };
        break;
      default:
        if( device.lightList[0].isDimmable ) {
          hue.type = "Dimmable light";
          hue.state = { "on" : device.lightList[0].onOff,
                        "bri" : parseInt(device.lightList[0].dimmer*2.54) };
        } else if( device.lightList[0].isSwitchable ) {
          hue.type = "On/Off light";
          hue.state = { "on" : device.lightList[0].onOff };
        }
        break;
    }

  } else if( device.type === AccessoryTypes.plug ) {
    hue.r = 'lights';
    if( device.plugList[0].isDimmable ) {
      hue.type = "Dimmable light";
      hue.state = { "on" : device.plugList[0].onOff,
                    "bri" : parseInt(device.plugList[0].dimmer*2.54) };
    } else if( device.plugList[0].isSwitchable ) {
      hue.type = "On/Off light";
      hue.state = { "on" : device.plugList[0].onOff };
    }

  } else if( device.type === AccessoryTypes.blind ) {
    hue.r = 'lights';
    hue.type = "blind";
    hue.config = { battery: device.deviceInfo.battery };
    hue.state = { "pct" : parseInt(device.blindList[0].position) };

  } else if( device.type === AccessoryTypes.remote || device.type === AccessoryTypes.slaveRemote ) {
    hue.r = 'sensor';
    hue.config = { battery: device.deviceInfo.battery };
    hue.state = { lastupdated: new Date(device.lastSeen*1000).toISOString().replace(/\..+/, '') };

  } else if( device.type === 6 ) { // repeater
    hue.r = 'sensor';
    hue.config = { battery: device.deviceInfo.battery };
    hue.state = { lastupdated: new Date(device.lastSeen*1000).toISOString().replace(/\..+/, '') };
  }

  if( !hue.state ) hue.state = {};
  hue.state.reachable = device.alive;

  hue.t = 'event';
  hue.id = device.instanceId;

  console.log( JSON.stringify(hue) );
}
Tradfri.prototype.group2HUE = function( group ) {
   var hue = { "name" : group.name,
               "lights" : group.deviceIDs,
               "type": "LightGroup",
               "state": {  },
               "action": {} };

  hue.r = 'group';
  hue.t = 'event';
  hue.id = group.instanceId;

  console.log( JSON.stringify(hue) );
}
Tradfri.prototype.scene2HUE = function( scene ) {
   var hue = { "name" : scene.name,
               "type": "LightGroup",
               "group": scene.groupId,
               "state": {},
               "action": {} };

  var group = this.groups[scene.groupId];
  if( group ) {
     //hue.group_name = group.name;
    hue.lights = group.deviceIDs;
  }

  hue.r = 'scene';
  hue.t = 'event';
  hue.id = scene.instanceId;

  console.log( JSON.stringify(hue) );
}

Tradfri.prototype.gatewayUpdated = function( gateway ) {
  log.debug( gateway );

  //TODO: post gateway info to fhem
}

Tradfri.prototype.deviceUpdated = function( device ) {
  log.debug( device );

  if( device.type === AccessoryTypes.lightbulb || device.type === AccessoryTypes.plug )
    this.lights[device.instanceId] = device;
   else if( device.type === AccessoryTypes.blind )
    this.blinds[device.instanceId] = device;
  else if( device.type === AccessoryTypes.remote || device.type === AccessoryTypes.slaveRemote )
    this.remotes[device.instanceId] = device;
  else if( device.type === 6 ) // repeater
    ;
  else
    console.log(device);

  try {
    this.device2HUE( device );
  } catch(e) {
    log.error( 'failed to convert device to hue' );
    log.debug( device );
    log.debug( e );
  }
}
Tradfri.prototype.deviceRemoved = function(instanceId) {
  delete this.lights[instanceId];

  let hue = { r: 'lights',
              t: 'remove',
              id: instanceId };

  console.log( JSON.stringify(hue) );
}
Tradfri.prototype.groupUpdated = function(group) {
  log.debug( group );

  this.groups[group.instanceId] = group;

  try {
    this.group2HUE( group );
  } catch(e) {
    log.error( 'failed to convert group to hue' );
    log.debug( group );
    log.debug( e );
  }
}
Tradfri.prototype.groupRemoved = function(instanceId) {
  delete this.groups[instanceId];

  let hue = { r: 'group',
              t: 'remove',
              id: instanceId };

  console.log( JSON.stringify(hue) );
}

Tradfri.prototype.sceneUpdated = function(groupId, scene) {
  log.debug( scene );

  scene.groupId = groupId;

  this.scenes[scene.instanceId] = scene;

  try {
    this.scene2HUE( scene );
  } catch(e) {
    log.error( 'failed to convert scene to hue' );
    log.debug( scene );
    log.debug( e );
  }
}
Tradfri.prototype.sceneRemoved = function(groupId,instanceId) {
  delete this.scenes[instanceId];

  let hue = { r: 'scene',
              t: 'remove',
              id: instanceId };

  console.log( JSON.stringify(hue) );
}

Tradfri.prototype.run = function() {
  log.info( 'this is tradfri-fhem '+ version );

  start.bind(this)();
}

Tradfri.prototype.shutdown = function() {
  for( let instanceId in this.remotes ) {
    let device = this.remotes[instanceId];

    device.alive = false;
    this.device2HUE( device );
  }

  for( let instanceId in this.lights ) {
    let device = this.lights[instanceId];

    device.alive = false;
    this.device2HUE( device );
  }

  process.exit();
}
