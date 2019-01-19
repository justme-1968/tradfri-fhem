
'use strict';

const log = require("./logger")._system;

const version = require('./version');

//const util = require('util');

const tradfriLib = require("node-tradfri-client");

const discoverGateway = tradfriLib.discoverGateway;

const TradfriClient = tradfriLib.TradfriClient;
//const Accessory = tradfriLib.Accessory;
const AccessoryTypes = tradfriLib.AccessoryTypes;

module.exports = {
  Tradfri: Tradfri
}

function Tradfri() {
  this.credentials = { identity: 'tradfri_1547841360224', psk: 'pe1yDkmUJgCjulUG' };

  this.ip = ip;
  this.secret = secret;

  if( identity && psk )
    this.credentials = { identity: identity, psk: psk };

  this.lights = {};
  this.remotes = {};
  this.groups = {};
  this.scenes = {};
}

var ip;
Tradfri.ip = function(_ip) {
 ip = _ip;
}
var secret;
Tradfri.secret = function(s) {
  secret = s;
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
  await tradfri.connect(this.credentials.identity, this.credentials.psk);

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

  let device = this.lights[json.id];
  if( device ) {
    let operation = {};
    if( json.on !== undefined )                         operation.onOff = json.on;
    if( json.bri !== undefined )                       operation.dimmer = json.bri/2.54;
    if( json.ct !== undefined )              operation.colorTemperature = (json.ct-250)/2.04;
    if( json.transitiontime !== undefined )    operation.transitionTime = json.transitiontime/10;

    //transitionTime: number;
    //colorTemperature: number;
    //color: string;
    //hue: number;
    //saturation: number;

    //console.log( operation );

    await this.tradfri.operateLight(device, operation);
  }
}
Tradfri.prototype.HUE2gateway = function( json ) {
  operate.bind(this)(json);
}



Tradfri.prototype.device2HUE = function( device ) {
   var hue = { "name" : device.name,
               "modelid" : device.deviceInfo.modelNumber,
               "manufacturername" : device.deviceInfo.manufacturer,
               "productname" : device.deviceInfo.modelNumber,
               "uniqueid" : device.deviceInfo.serialNumber,
               "swversion" : device.deviceInfo.firmwareVersion };

  if( device.type === AccessoryTypes.lightbulb ) {
    hue.r = 'lights';
    switch( device.lightList[0].spectrum ) {
      case 'rgb':
        hue.type = "Color light";
        break;
      case 'white':
        hue.type = "Color temperature light";
        break;
      default:
        if( device.lightList[0].isDimmable )
          hue.type = "Dimmable light";
        else if( device.lightList[0].isSwitchable )
          hue.type = "On/Off light";
        break;
    }

    if( device.lightList[0].spectrum === 'white' )
      hue.state = { "on" : device.lightList[0].onOff,
                    "bri" : parseInt(device.lightList[0].dimmer*2.54),
                    "ct" : parseInt(250+2.04*device.lightList[0].colorTemperature),
                    "colormode" : "ct" };
    else if( device.lightList[0].spectrum === 'rgb' )
      hue.state = { "on" : device.lightList[0].onOff,
                    "bri" : parseInt(device.lightList[0].dimmer*2.54),
                    "ct" : parseInt(250+2.04*device.lightList[0].colorTemperature),
                    "colormode" : "hsv" };
    if( device.lightList[0].color )
      hue.state.rgb = device.lightList[0].color;

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
  } else if( device.type === AccessoryTypes.remote ) {
    hue.r = 'sensor';
    hue.state = { };
    hue.config = { battery: device.deviceInfo.battery };
  }

  hue.state.reachable = device.alive;

  hue.t = 'event';
  hue.id = device.instanceId;

  console.log( JSON.stringify(hue) );
}
Tradfri.prototype.group2HUE = function( group ) {
   var hue = { "name" : group.name,
               "lights" : group.deviceIDs,
               "type": "LightGroup",
               "state": {},
               "action": {} };

  hue.r = 'group';
  hue.t = 'event';
  hue.id = group.instanceId;

  console.log( JSON.stringify(hue) );
}

Tradfri.prototype.gatewayUpdated = function( gateway ) {
  //console.log( gateway );
   
  //TODO: post gateway info to fhem
}

Tradfri.prototype.deviceUpdated = function( device ) {
  //console.log(device);

  if( device.type === AccessoryTypes.lightbulb || device.type === AccessoryTypes.plug )
    this.lights[device.instanceId] = device;
  else if( device.type === AccessoryTypes.remote || device.type === AccessoryTypes.slaveRemote )
    this.remotes[device.instanceId] = device;
  else
    console.log(device);

  this.device2HUE( device );
}
Tradfri.prototype.deviceRemoved = function(instanceId) {
  delete this.lights[instanceId];
}
Tradfri.prototype.groupUpdated = function(group) {
  //console.log(group);

  this.groups[group.instanceId] = group;

  this.group2HUE( group );
}
Tradfri.prototype.groupRemoved = function(instanceId) {
  delete this.groups[instanceId];
}

Tradfri.prototype.sceneUpdated = function(groupId, scene) {
  console.log(groupId);
  //console.log(scene);

  scene.groupId = groupId;

  this.scenes[scene.instanceId] = scene;

  //this.device2HUE( device );
}
Tradfri.prototype.sceneRemoved = function(groupId,instanceId) {
  delete this.scenes[instanceId];
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
