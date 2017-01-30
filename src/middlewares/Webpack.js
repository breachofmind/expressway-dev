"use strict";

var Middleware = require('expressway').Middleware;
var webpack = require('webpack');
var webpackMiddleware = require('webpack-dev-middleware');
var webpackHotMiddleware = require('webpack-hot-middleware');

class Webpack extends Middleware
{
    get description() {
        return "Adds webpack HMR and dev server middleware";
    }

    /**
     * Dispatch middleware functions to express.
     * @injectable
     * @param extension Extension
     * @param log Winston
     * @returns {(*|*)[]}
     */
    dispatch(extension,log)
    {
        if (this.app.env !== ENV_LOCAL) return;

        if (! extension.webpack || typeof extension.webpack != 'object') {
            log.warn(`${extension.name}.webpack missing webpack config. Skipping...`);
            return;
        };

        var middleware,hotMiddleware;

        try {
            let compiler = webpack(extension.webpack.configuration);
            middleware = webpackMiddleware(compiler, {
                publicPath: extension.webpack.publicPath,
                noInfo: !extension.webpack.showErrors,
            });

            hotMiddleware = webpackHotMiddleware(compiler);

        } catch(err) {
            log.warn('Error loading webpack: %s', extension.name);
            return;
        }

        log.info('HMR watching %s', extension.webpack.publicPath);

        // Return the middleware functions.
        return [
            function webpackDevMiddleware() {
                return middleware(...arguments);
            },
            function webpackHotMiddleware() {
                return hotMiddleware(...arguments);
            }
        ];
    }
}

module.exports = Webpack;