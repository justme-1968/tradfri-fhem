
var program = require('commander');
var version = require('./version');
var Tradfri = require('./tradfri').Tradfri;
var log = require("./logger")._system;

'use strict';

module.exports = function() {

  program
    .version(version)
    .option('-D, --debug', 'turn on debug level logging', function() { require('./logger').setDebugEnabled(true) })
    .option('--ip [ip]', 'the gateway ip', function(ip) { Tradfri.ip(ip) })
    .option('-s, --securityCode [code]', 'the security code', function(s) { Tradfri.securityCode(s) })
    .option('-i, --identity [identity]', 'the identity', function(i) { Tradfri.identity(i) })
    .option('-p, --psk [psk]', 'the psk', function(p) { Tradfri.psk(p) })
    .parse(process.argv);

    tradfri = new Tradfri();

    process.on('disconnect', function () {
      console.log('parent exited')
      tradfri.shutdown();
    });

    process.stdout.on('end', function() {
      console.error('STDOUT EOF')
      tradfri.shutdown();
    });

    let buff = "";
    process.stdin.resume();
    process.stdin.on('data', (data) => {
      log.debug( 'read: '+ data );
      buff += data;

      let lines = buff.split(/[\r\n|\n]/);
      buff = lines.pop();
      log.debug( lines );
      log.debug( buff );

      lines.forEach( (line) => {
        log.debug( 'processing: '+ line );
        try {
          let decoded = JSON.parse(line);

          if( typeof decoded === 'object' )
            tradfri.HUE2gateway(decoded);
          else
            log.error( 'invalid json: '+ line  );
        } catch( e ) {
          log.error( e );
        }
      });
    });

    process.stdin.on('end', function () {
      console.log('STDIN EOF')
      tradfri.shutdown();
    });

    var signals = {'SIGINT': 2, 'SIGTERM': 15};
    Object.keys(signals).forEach(function (signal) {
      process.on(signal, function () {
        log.info("Got %s, shutting down tradfri-fhem...", signal);

        tradfri.shutdown();
      });
    });

    tradfri.run();
}
