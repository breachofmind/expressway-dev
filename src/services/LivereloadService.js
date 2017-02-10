"use strict";

var _ = require('lodash');
var livereload = require('livereload');
var Promise = require('expressway').Promise;

const LIVERELOAD_URL = "http://localhost:35729/";
const LIVERELOAD_FILE = LIVERELOAD_URL + "livereload.js";

module.exports = function(app,log,debug,url,config)
{
    class LivereloadService {

        constructor()
        {
            /**
             * Is the server running?
             * @type {boolean}
             * @private
             */
            this._running = false;

            /**
             * The livereload server instance.
             * @type {Server}
             * @private
             */
            this._server = null;

            /**
             * Paths to watch.
             * @type {Array}
             * @private
             */
            this._watch = config('livereload.watch', []);

            /**
             * Livereload server options.
             * @type {{originalPath: (*), exts: [*]}}
             */
            this.options = {
                originalPath: config('livereload.url',url.get()),
                exts: config('livereload.extensions', ['htm','html','ejs','hbs','png','gif','jpg','css'])
            };
        }

        /**
         * Get the protected running property.
         * @returns {boolean}
         */
        get running() {
            return this._running;
        }

        /**
         * Check if the server is allowed to run.
         * @returns {Boolean}
         */
        get canRun() {
            if (config('livereload.enable') === false) return false;

            return (app.env == ENV_LOCAL && app.context == CXT_WEB && ! this.running);
        }

        /**
         * Get the watch paths.
         * @returns {Array}
         */
        get paths() {
            return this._watch;
        }

        /**
         * Have the livereload server watch a path or array of paths.
         * @param paths string|Array
         * @returns {Livereload}
         */
        watch(paths)
        {
            if (this.running) {
                throw new Error("Livereload can't watch paths after it has already started");
            }
            [].concat(paths).forEach(path => {
                this._watch.push(path);
            });

            return this;
        }

        /**
         * Start the livereload server.
         * @returns {Promise}
         */
        run()
        {
            if (! this.canRun) return Promise.resolve();

            return new Promise((resolve,reject) =>
            {
                try {
                    this._server = livereload.createServer(this.options);
                    this._server.watch(this.paths);
                    this.paths.forEach(dir => {
                        debug('Livereload watching path %s', dir);
                    });
                    log.info('Livereload server running at %s', LIVERELOAD_URL);
                    // When each view renders, add the livereload runtime script.
                    app.on('view.render', function(view) {
                        view.script('livereload', LIVERELOAD_FILE);
                    });

                } catch (err) {
                    log.error(err.message);
                    return reject(err);
                }

                return resolve();
            })
        }
    }

    return new LivereloadService;
};