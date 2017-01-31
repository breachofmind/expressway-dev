"use strict";

var Middleware = require('expressway').Middleware;
var webpack = require('webpack');
var WebpackDevServer = require('webpack-dev-server');
var URL = require('url');
//var webpackMiddleware = require('webpack-dev-middleware');
//var webpackHotMiddleware = require('webpack-hot-middleware');

class Webpack extends Middleware
{
    get description() {
        return "Adds webpack HMR and dev server middleware";
    }

    constructor(app)
    {
        super(app);

        this.running = false;
    }

    /**
     * Dispatch middleware functions to express.
     * @injectable
     * @param extension Extension
     * @param log Winston
     * @param url URLService
     * @returns {(*|*)[]}
     */
    dispatch(extension,log,url)
    {
        if (this.app.env !== ENV_LOCAL || this.running) return;

        let conf = extension.webpack;
        let devServerUrl = URL.parse(extension.webpack.devPublicPath);
        let opts = {
            hot: conf.hmr,
            publicPath: conf.sourcePath,
            stats: "minimal",
            proxy: {
                "*" : url.get()
            }
        };
        //console.log(conf.configuration);
        let compiler = webpack(conf.configuration);
        let server = new WebpackDevServer(compiler, opts);

        server.listen(devServerUrl.port, devServerUrl.hostname, (err,result) => {
            if (err) {
                return log.error(err.message);
            }
            log.info('starting webpack dev server at %s', conf.devPublicPath);

            this.running = true;
        });
    }
}

module.exports = Webpack;