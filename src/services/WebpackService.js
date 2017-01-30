"use strict";

var _ = require('lodash');
var path = require('path');
var webpack = require('webpack');
var ExtractTextPlugin = require("extract-text-webpack-plugin");

const PACKAGE_ACTIONS = {
    "vue" : function(npm)
    {
        let config = {
            loaders: {js:'babel-loader'}
        };
        this.resolve.alias['vue$'] = 'vue/dist/vue.common.js';
        this.loader('vue', {loaders: ['vue-loader']}, {vue: config})
    },

    "babel-loader" : function(npm)
    {
        this.loader('js', {
            loader: "babel-loader",
            exclude: /(node_modules|bower_components)/,
            query: {
                cacheDirectory:true,
                presets: ['es2015']
            }
        });
    },

    "sass-loader" : function(npm)
    {
        let hasPostCss = npm('dependencies.postcss-loader') || npm('devDependencies.postccss-loader');
        let config = {outputStyle: app.env == ENV_LOCAL ? "expanded" : "compressed"};
        let loaders = hasPostCss ? ['postcss-loader', 'sass-loader'] : ['sass-loader'];
        let opts = this.extractCSS
            ? {loader: ExtractTextPlugin.extract("style-loader", ['css-loader'].concat(loaders))}
            : {loaders: ['style-loader','css-loader'].concat(loaders)};

        this.loader('scss', opts, {sassLoader:config});
    }
};

module.exports = function(app,paths,url,utils)
{
    return class WebpackService
    {
        constructor(extension)
        {
            this.resourcePath  = paths.resources();
            this.config        = {};
            this.entries       = {vendor: []};
            this.path          = extension.routes.statics[0].path;
            this.publicPath    = extension.routes.statics[0].uri;
            this.filename      = "[name].js";
            this.chunkFilename = "chunk.[id].js";
            this.resolve       = {alias: {}};
            this.devtool       = "cheap-module-sourcemap";
            this.loaders       = {};
            this.plugins       = [];
            this.hmr           = app.env === ENV_PROD ? false : this.publicPath;
            this.uglify        = app.env === ENV_PROD;
            this.extractCSS    = "[name].css";
            this.showErrors    = false;
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
        readPackage(npmPackage)
        {
            if (! npmPackage) return;

            var npm = utils.objectAccessor(npmPackage);

            _.each(PACKAGE_ACTIONS, (fn,name) => {
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
            let file = `${this.resourcePath}/js/${filename}`;
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
         * Add a loader
         * @param ext string
         * @param opts object
         * @param config object
         * @returns {WebpackService}
         */
        loader(ext,opts={},config={})
        {
            let loader = {
                test: new RegExp(`\.${ext}$`)
            };
            this.loaders[ext] = _.assign(loader,opts);
            _.assign(this.config, config);

            return this;
        }

        /**
         * Load files into the view object.
         * @param view View
         */
        loadBundles(view)
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
                js: _.map(this.entries, (value,name) => {
                    return this.publicPath + rename(this.filename, name);
                }),
                css: _.compact(_.map(this.entries, (value,name) => {
                    if (! this.extractCSS || name === 'vendor') return;
                    return this.publicPath + rename(this.extractCSS, name);
                }))
            };
        }

        /**
         * Convert the object into a webpack config.
         * @returns {Object}
         */
        toJSON()
        {
            return _.assign({}, this.config, {
                entry: getEntries(this),
                output: this.output,
                devtool: this.devtool,
                resolve: this.resolve,
                module: getLoaders(this),
                plugins: getPlugins(this)
            })
        }

        /**
         * Alias of toJSON
         * @returns {Object}
         */
        get configuration()
        {
            return this.toJSON();
        }

        /**
         * Get the output configuration.
         * @returns {{path: *, publicPath: (string|*), filename: string, chunkFilename: string}}
         */
        get output()
        {
            return {
                path: this.path,
                publicPath: this.publicPath,
                filename: this.filename,
                chunkFilename: this.chunkFilename
            }
        }
    }
};

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
function getLoaders(service)
{
    return {
        loaders: _.map(service.loaders, (value,key) => {
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
        let middleware = arr;
        if (service.hmr && name !== 'vendor') {
            middleware = [
                'webpack/hot/dev-server',
                `webpack-hot-middleware/client?name=${name}&path=${service.hmr}__webpack_hmr`,
            ].concat(arr);
        }
        out[name] = middleware;
    });
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
        plugins.push(new webpack.NoErrorsPlugin());
    }
    if (service.entries.vendor.length) {
        plugins.push(new webpack.optimize.CommonsChunkPlugin({
            name: "vendor",
            filename: "vendor.js"
        }));
    }
    if (service.hmr) {
        plugins.push(new webpack.optimize.OccurenceOrderPlugin());
        plugins.push(new webpack.HotModuleReplacementPlugin());
    }
    if (service.uglify) {
        plugins.push(new webpack.optimize.UglifyJsPlugin(typeof service.uglify == 'object' ? service.uglify : {}));
    }
    if (service.extractCSS) {
        plugins.push(new ExtractTextPlugin(service.extractCSS));
    }

    return service.plugins.concat(plugins);
}