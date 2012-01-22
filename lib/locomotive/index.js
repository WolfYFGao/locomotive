/**
 * Module dependencies.
 */
var express = require('express')
  , fs = require('fs')
  , path = require('path')
  , inflect = require('./inflect')
  , util = require('util')
  , Router = require('./router')
  , Controller = require('./controller');


/**
 * `Locomotive` constructor.
 *
 * A default `Locomotive` singleton is exported via the module.  Applications
 * should not need to construct additional instances, and are advised against
 * doing so.
 *
 * @api protected
 */
function Locomotive() {
  this._routes = new Router(this);
  this._controllers = {};
  this._datastores = [];
};

/**
 * Intialize `Locomotive`.
 *
 * @param {express.HTTPServer|express.HTTPSServer} server
 * @param {Function} boot
 * @return {express.HTTPServer|express.HTTPSServer}
 * @api protected
 */
Locomotive.prototype._init = function(server, boot) {
  if (typeof server === 'function') {
    boot = server;
    server = null;
  }
  
  server = server || express.createServer();
  this._routes.init(server);
  
  // Mix interesting functions and properties from the Express `server` into
  // this `Locomotive` instance.  This allows the two instances to be used
  // interchangeably.
  mixin(this, server, [ 'use', 'error',
                        'register', 'helpers', 'dynamicHelpers',
                        'configure', 'set', 'enabled', 'disabled', 'enable', 'disable' ]);
  this.router = server.router;
  
  boot(this);
  return server;
}

/**
 * Register `controller` with given `name`, or return `name`'s controller. 
 *
 * @param {String} name
 * @param {Controller} controller
 * @return {Controller|Locomotive} for chaining, or the controller
 * @api protected
 */
Locomotive.prototype.controller = function(name, controller) {
  name = inflect._controllerize(name);
  // record the controller in an internal hash.
  if (controller) {
    controller._init(this, name);
    this._controllers[name] = controller;
    return this;
  }
  return this._controllers[name];
}

/**
 * Register datastore `store`.
 *
 * To facilitate mapping models to controllers, Locomotive introspects models
 * in order to determine their type.  By default, the constructor name is used;
 * for example, an instance of `Song` maps to `SongsController`.  However, most
 * datastores have APIs that don't conform to this (admittedly, rather
 * simplistic) heuristic.  To accomodate such datastores, adapters can and
 * should be registered with Locomotive to provide the necessary introspection
 * logic.
 *
 * @param {Module} store
 * @api public
 */
Locomotive.prototype.datastore = function(store) {
  this._datastores.push(store);
}

/**
 * Returns a string indicating the type of record of `obj`.
 * 
 * @param {Object} obj
 * @return {String}
 * @api protected
 */
Locomotive.prototype._recordOf = function(obj) {
  for (var i = 0, len = this._datastores.length; i < len; i++) {
    var ds = this._datastores[i];
    var kind = ds.recordOf(obj);
    if (kind) { return kind; }
  }
  return undefined;
}


/**
 * Configure `Locomotive`.
 *
 * @param {String} path
 * @api protected
 */
Locomotive.prototype._boot = function(dir) {
  var self = this;
  var entry;
  
  // Register standard helpers.
  this.helpers(require('./helpers'));
  this.dynamicHelpers(require('./helpers/dynamic'));
  
  var configDir = dir + '/config';
  
  // Require initializers.
  entry = configDir + '/initializers';
  if (path.existsSync(entry)) {
    fs.readdirSync(entry).forEach(function(filename) {
      if (/\.js$/.test(filename)) {
        console.log('Loading initializer: ' + filename);
        require(entry + '/' + filename);
      }
    });
  }
  
  // Apply configuration for all environments.
  entry = configDir + '/environments/all.js';
  if (path.existsSync(entry)) {
    console.log('Configuring for environment: ' + 'all');
    require(entry).apply(this);
  }
  // Apply configuration for current environment.
  entry = configDir + '/environments/' + this.set('env') + '.js';
  if (path.existsSync(entry)) {
    console.log('Configuring for environment: ' + this.set('env'));
    require(entry).apply(this);
  }
  
  // Register fallback datastore. 
  this.datastore(require('./datastores/object'));
  
  // Draw routes.
  var routesPath = configDir + '/routes.js';
  if (path.existsSync(routesPath)) {
    console.log('Drawing routes')
    this._routes.draw(require(routesPath));
  }
  
  
  var appDir = dir + '/app';
  
  // TODO: Implement support for loading controllers contained within subdirectories.
  //       (/admin/accounts_controller.js -> Admin::AccountsController)
  
  // Auto-load controllers.
  entry = appDir + '/controllers';
  if (path.existsSync(entry)) {
    fs.readdirSync(entry).forEach(function(filename) {
      if (/\.js$/.test(filename)) {
        var name = filename.replace(/\.js$/, '');
        self.controller(name, require(entry + '/' + filename));
      }
    });
  }
}

/**
 * Mixin named `functions` from `source` to `target`.
 *
 * The `this` context of all source functions will will be bound to the `source`
 * instance.  As such, it will be indistinguishable as to whether they are
 * called via the `target` or `source` instance.
 *
 * @param {Object} target
 * @param {Object} source
 * @param {Array} functions
 * @api private
 */
function mixin(target, source, functions) {
  for (var i = 0, len = functions.length; i < len; i++) {
    var method = functions[i];
    target[method] = source[method].bind(source);
  }
}



/**
 * Export default singleton.
 *
 * @api public
 */
exports = module.exports = new Locomotive();

/**
 * Framework version.
 */
exports.version = '0.1.2';

/**
 * Expose constructors.
 */
exports.Locomotive = Locomotive;
exports.Controller = Controller;

/**
 * Expose CLI.
 *
 * @api private
 */
exports.cli = require('./cli');