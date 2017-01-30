"use strict";

var Middleware = require('expressway').Middleware;
var livereload = require('livereload');

class Livereload extends Middleware
{
    get description() {
        return "Adds livereload server";
    }

    /**
     * Constructor.
     * @injectable
     * @param app Application
     * @param url URLService
     */
    constructor(app,url)
    {
        super(app);

        /**
         * Is livereload currently running?
         * Only one server instance can run at a time on the same port.
         * @type {boolean}
         */
        this.running = false;

        /**
         * Paths or files to watch.
         * @type {Array}
         */
        this.watchDirs = [];

        /**
         * Livereload server options.
         * @type {{originalPath: (*), exts: [*]}}
         */
        this.options = {
            originalPath: url.get(),
            exts: ['htm','html','ejs','hbs','png','gif','jpg','css']
        };

        app.service('livereload', this);
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
            this.watchDirs.push(path);
        });

        return this;
    }

    /**
     * Enable the livereload server.
     * Doesn't actually return any middleware.
     * @injectable
     * @param extension {Extension}
     * @param app {Application}
     * @param log {Winston}
     * @param debug {Function}
     * @returns void
     */
    dispatch(extension,app,log,debug)
    {
        if (app.env !== ENV_LOCAL || this.running || app.context !== CXT_WEB) return;

        // We don't want this to fire if we're in a CLI session.
        // But, we do want to see the middleware.
        try {
            let server = livereload.createServer(this.options);
            server.watch(this.watchDirs);
        } catch (err) {
            log.error(err.message);
            return;
        }

        this.watchDirs.forEach(dir => {
            debug('Livereload watching path %s', dir);
        });

        log.info('Livereload server running at http://localhost:35729');

        // When each view renders, add the livereload runtime script.
        app.on('view.render', function(view) {
            view.script('livereload', 'http://localhost:35729/livereload.js');
        });

        this.running = true;
    }
}

module.exports = Livereload;