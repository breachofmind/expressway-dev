"use strict";

var _ = require('lodash');
var path = require('path');
var webpack = require('webpack');
var WebpackDevServer = require('webpack-dev-server');
var ExtractTextPlugin = require("extract-text-webpack-plugin");

module.exports = function(app,paths,url,utils,log)
{

    const PACKAGE_RULES = {
        "vue-loader" : function(npm)
        {
            let config = {
                loaders: {js:'babel-loader'}
            };
            this.resolve.alias['vue$'] = 'vue/dist/vue.common.js';
            this.rule('vue', {loaders: ['vue-loader']}, {vue: config})
        },

        "babel-loader" : function(npm)
        {
            this.rule('js', {
                loader: "babel-loader",
                options: {
                    ignore: /(node_modules|bower_components)/,
                    cacheDirectory: true,
                    presets: [
                        ['es2015', {modules:false}]
                    ]
                },
            });
        },

        "sass-loader" : function(npm)
        {
            let use;
            let hasPostcss = npm('dependencies.postcss-loader') || npm('devDependencies.postcss-loader');
            let postcssLoader = {
                loader:"postcss-loader",
                options: {
                    plugins: [require('autoprefixer')]
                }
            };
            let sassLoader = {
                loader:"sass-loader",
                options: {
                    outputStyle: app.env == ENV_LOCAL ? "expanded" : "compressed"
                }
            };

            if (this.extractCSS) {
                use = ExtractTextPlugin.extract({
                    fallbackLoader: "style-loader",
                    loader: hasPostcss ? ['css-loader',postcssLoader,sassLoader] : ['style-loader','css-loader',sassLoader]
                });

            } else {
                use = hasPostcss ? ['style-loader','css-loader',postcssLoader,sassLoader] : ['style-loader','css-loader',sassLoader];
            }

            this.rule('scss', {use: use});
        }
    };


    /**
     * The webpack service object.
     * @constructor
     */
    class WebpackService
    {
        constructor(extension)
        {
            WebpackService.instances ++;

            this.config        = {};
            this.resolve       = {alias: {}};
            this.rules         = {};
            this.plugins       = [];
            this.entries       = {vendor: []};
            this.showErrors    = false;
            this.devMode       = app.env === ENV_LOCAL;
            this.devServerPort = app.config.port + WebpackService.instances;
            this.resourcePath  = paths.resources();
            this.path          = extension.routes.statics.length ? extension.routes.statics[0].path : paths.public();
            this.publicPath    = extension.routes.statics.length ? extension.routes.statics[0].uri : url.get();
            this.filename      = app.env === ENV_LOCAL ? "[name].js" : "[name].min.js";
            this.chunkFilename = app.env === ENV_LOCAL ? "chunk.[id].js" : "chunk.[id].min.js";
            this.devtool       = app.env === ENV_LOCAL ? "cheap-module-source-map" : "source-map";
            this.cssFilename   = app.env === ENV_LOCAL ? "[name].css" : "[name].min.css";
            this.hmr           = app.env === ENV_LOCAL;
            this.uglify        = app.env === ENV_PROD;
            this.extractCSS    = app.env === ENV_PROD;
        }

        /**
         * Get the source path of the file, depending on if the dev server is running.
         * @returns {String}
         */
        get sourcePath()
        {
            return this.devMode ? `http://localhost:${this.devServerPort}/` : this.publicPath;
        }

        /**
         * Add a plugin object.
         * @param object
         * @returns {WebpackService}
         */
        plugin(object)
        {
            this.plugins.push(object);

            return this;
        }

        /**
         * Given an NPM package, add loaders based on the configuration.
         * @param npmPackage
         * @returns {WebpackService}
         */
        read(npmPackage)
        {
            if (! npmPackage) return;

            let npm = utils.objectAccessor(npmPackage);

            _.each(PACKAGE_RULES, (fn,name) => {
                if (npm('dependencies.'+name) || npm('devDependencies.'+name)) {
                    fn.call(this, npm);
                }
            });

            return this;
        }

        /**
         * Create an entry file.
         * @param filename string
         * @param opts {Array}
         * @returns {WebpackService}
         */
        entry(filename,opts=[])
        {
            let file = `${this.resourcePath}js/${filename}`;
            let name = path.basename(filename,'.js');
            this.entries[name] = opts.concat(file);

            return this;
        }

        /**
         * Add common packages to the vendor bundle.
         * @param packages string|array
         * @returns {WebpackService}
         */
        common(packages)
        {
            this.entries["vendor"] = this.entries["vendor"].concat(packages);

            return this;
        }

        /**
         * Add a loader rule.
         * @param ext string
         * @param opts object
         * @returns {WebpackService}
         */
        rule(ext,opts={})
        {
            let rule = {
                test: new RegExp(`\.${ext}$`)
            };
            this.rules[ext] = _.assign(rule,opts);

            return this;
        }

        /**
         * Load files into the view object.
         * @param view View
         */
        attach(view)
        {
            let files = this.files;
            files.js.forEach((file,index) => { view.script("jsBundle_"+index, file) });
            files.css.forEach((file,index) => { view.style("cssBundle_"+index, file) });
        }

        /**
         * Get the file output bundles.
         * @returns {{}}
         */
        get files()
        {
            return {
                js: _.compact(_.map(this.entries, (value,name) => {
                    if (value.length) return this.sourcePath + rename(this.filename, name);
                })),
                css: _.compact(_.map(this.entries, (value,name) => {
                    if (! this.extractCSS || name === 'vendor') return;
                    return this.sourcePath + rename(this.cssFilename, name);
                }))
            };
        }

        /**
         * Return the configuration object.
         * @returns {Object}
         */
        get configuration()
        {
            return _.assign({}, this.config, {
                entry: getEntries.call(this),
                output: this.output,
                devtool: this.devtool,
                resolve: this.resolve,
                module: getRules.call(this),
                plugins: getPlugins.call(this)
            })
        }

        /**
         * Run the webpack configuration.
         * @returns {Promise}
         */
        run()
        {
            return new Promise((resolve,reject) =>
            {
                webpack(this.configuration, (err,stats) => {
                    if (err || stats.hasErrors()) {
                        return reject({error:err, stats:stats});
                    }
                    return resolve(stats);
                })
            });
        }

        /**
         * Start the webpack dev server (LOCAL ONLY)
         * @returns {Promise}
         */
        server()
        {
            // This should only work in a development web environment.
            if (app.env !== ENV_LOCAL || app.context !== CXT_WEB) return Promise.resolve();

            let opts = {
                hot: this.hmr,
                publicPath: this.sourcePath,
                stats: "minimal",
                proxy: {
                    "*" : url.get()
                }
            };

            //console.log(this.configuration);
            let compiler = webpack(this.configuration);
            let server = new WebpackDevServer(compiler, opts);

            return new Promise((resolve,reject) =>
            {
                server.listen(this.devServerPort, 'localhost', (err,result) => {
                    if (err) {
                        log.error(err.message);
                        return reject(err);
                    }
                    log.info('starting webpack dev server at http://localhost:%s/', this.devServerPort);
                    return resolve(result);
                });
            });
        }

        /**
         * Get the output configuration.
         * @returns {{path: *, publicPath: (string|*), filename: string, chunkFilename: string}}
         */
        get output()
        {
            return {
                path: this.path,
                publicPath: this.sourcePath,
                filename: this.filename,
                chunkFilename: this.chunkFilename,
                // hotUpdateChunkFilename: 'hot/hot-update.js',
                // hotUpdateMainFilename: 'hot/hot-update.json'
            }
        }
    }

    WebpackService.instances = 0;

    /**
     * For renaming the input file
     * @param input
     * @param name
     * @returns {string}
     */
    function rename(input,name)
    {
        return input.replace("[name]",name);
    }

    /**
     * Get the loaders configuration.
     * @param service
     * @returns {{loaders: *}}
     */
    function getRules()
    {
        return {
            rules: _.map(this.rules, (value,key) => {
                return value;
            })
        }
    }

    /**
     * Get the entry objects.
     * @returns {{}}
     * @private
     */
    function getEntries()
    {
        let out = {};
        _.each(this.entries, (arr,name) => {
            let middleware = [];
            if (name !== 'vendor') {
                if (this.devMode) middleware.push(`webpack-dev-server/client?${this.sourcePath}`);
                if (this.hmr) middleware.push("webpack/hot/dev-server");
            }
            middleware = middleware.concat(arr);
            out[name] = middleware;
        });
        if (out.vendor && ! out.vendor.length) {
            delete out.vendor;
        }
        return out;
    }

    /**
     * Get the plugins based on the configuration settings.
     * @returns {Array}
     * @private
     */
    function getPlugins()
    {
        let plugins = [];

        if (app.env == ENV_PROD) {
            plugins.push(new webpack.DefinePlugin({
                'process.env': {NODE_ENV: '"production"'}
            }));
        }
        if (! this.showErrors) {
            plugins.push(new webpack.NoEmitOnErrorsPlugin());
        }
        if (this.entries.vendor.length) {
            plugins.push(new webpack.optimize.CommonsChunkPlugin({
                name: "vendor",
                filename: "vendor.js"
            }));
        }
        if (this.hmr) {
            plugins.push(new webpack.HotModuleReplacementPlugin());
        }
        if (this.uglify) {
            //plugins.push(new webpack.optimize.UglifyJsPlugin(typeof this.uglify == 'object' ? this.uglify : {}));
        }
        if (this.extractCSS) {
            plugins.push(new ExtractTextPlugin({
                filename:this.cssFilename
            }));
        }

        return this.plugins.concat(plugins);
    }

    return WebpackService;
};