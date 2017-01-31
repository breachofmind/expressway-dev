"use strict";

var _ = require('lodash');
var path = require('path');
var webpack = require('webpack');
var ExtractTextPlugin = require("extract-text-webpack-plugin");

module.exports = function(app,paths,url,utils)
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
    return class WebpackService
    {
        constructor(extension)
        {
            this.config        = {};
            this.resolve       = {alias: {}};
            this.rules         = {};
            this.plugins       = [];
            this.entries       = {vendor: []};
            this.showErrors    = false;
            this.devMode       = app.env === ENV_LOCAL;
            this.devPublicPath = "http://localhost:4000/";
            this.resourcePath  = paths.resources();
            this.path          = extension.routes.statics[0].path;
            this.publicPath    = extension.routes.statics[0].uri;
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
            return this.devMode ? this.devPublicPath : this.publicPath;
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
                entry: getEntries(this),
                output: this.output,
                devtool: this.devtool,
                resolve: this.resolve,
                module: getRules(this),
                plugins: getPlugins(this)
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
                        return reject(err);
                    }
                    return resolve(stats);
                })
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
    function getRules(service)
    {
        return {
            rules: _.map(service.rules, (value,key) => {
                return value;
            })
        }
    }

    /**
     * Get the entry objects.
     * @returns {{}}
     * @private
     */
    function getEntries(service)
    {
        let out = {};
        _.each(service.entries, (arr,name) => {
            let middleware = [];
            if (name !== 'vendor') {
                if (service.devMode) middleware.push(`webpack-dev-server/client?${service.devPublicPath}`);
                if (service.hmr) middleware.push("webpack/hot/dev-server");
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
    function getPlugins(service)
    {
        let plugins = [];

        if (app.env == ENV_PROD) {
            plugins.push(new webpack.DefinePlugin({
                'process.env': {NODE_ENV: '"production"'}
            }));
        }
        if (! service.showErrors) {
            plugins.push(new webpack.NoEmitOnErrorsPlugin());
        }
        if (service.entries.vendor.length) {
            plugins.push(new webpack.optimize.CommonsChunkPlugin({
                name: "vendor",
                filename: "vendor.js"
            }));
        }
        if (service.hmr) {
            plugins.push(new webpack.HotModuleReplacementPlugin());
        }
        if (service.uglify) {
            plugins.push(new webpack.optimize.UglifyJsPlugin(typeof service.uglify == 'object' ? service.uglify : {}));
        }
        if (service.extractCSS) {
            plugins.push(new ExtractTextPlugin({
                filename:service.cssFilename
            }));
        }

        return service.plugins.concat(plugins);
    }
};