"use strict";

var Provider = require('expressway').Provider;
var node_ssh = require('node-ssh');

class DeveloperToolsProvider extends Provider
{
    constructor(app)
    {
        super(app);

        this.order = 1;

        app.service('livereload', app.load(require('../services/LivereloadService')));

        app.call(this,'buildCommand');
        app.call(this,'deployCommand');
    }

    /**
     * Add the build command.
     * @param app {Application}
     * @param cli {CLI}
     * @param log {Winston}
     */
    buildCommand(app,cli,log)
    {
        cli.command('build [options]', "Run webpack")
            .option('-p, --production', "Build for production")
            .option('-e, --extension [name]', "Specify the extension to build")
            .action((env,opts) =>
            {
                if (opts.production) {
                    app.env = ENV_PROD;
                    log.info('environment set to production mode');
                }
                let extensionName = typeof opts.extension == 'string' ? opts.extension : 'root';
                app.boot().then(done => {
                    let extension = app.extensions.get(extensionName);
                    log.info('building extension: %s', extension.name);
                    extension.webpack.run().then(done => {
                        cli.output(["build complete!"],true);
                    }).catch(results => {
                        console.error(results.error);
                        console.error(results.stats.compilation.errors.map(err => {
                            return err.message;
                        }));
                        process.exit(1);
                    });
                })
            });
    }

    /**
     * Add the deploy command.
     * @param app {Application}
     * @param cli {CLI}
     * @param log {Winston}
     * @param config {Function}
     */
    deployCommand(app,cli,log,config)
    {
        cli.command('deploy [options]', "Deploys the current branch to the configured deployment source")
            .action((env,opts) => {
                if (! config('deploy.host')) {
                    log.error("no deployment host configured");
                    process.exit();
                }
                let ssh = new node_ssh();
                let conn = ssh.connect({
                    host: config('deploy.host'),
                    username: config('deploy.username'),
                    privateKey: config('deploy.privateKey'),
                });

                conn.then(function() {
                    log.info('ssh connected to %s', config('deploy.host'))
                    ssh.execCommand('git status', {cwd: config('deploy.path')}).then(result => {
                        console.log(result.stdout);
                        process.exit();
                    });
                });

            });
    }

    /**
     * Attach the webpack instance to each extension and add livereload event listener.
     * @param next {Function}
     * @param app {Application}
     * @param livereload {LivereloadService}
     * @param utils {Object}
     */
    boot(next,app,livereload,utils,log)
    {
        let WebpackService = app.load(require('../services/WebpackService'));

        app.extensions.each(extension => {
            extension.webpack = new WebpackService(extension);
        });

        app.on('started', function() {
            livereload.run();

            // Log the external address
            let addresses = utils.getEthAddresses();
            if (app.context == CXT_WEB) {
                log.info("external address: http://%s:%s", addresses[0].address, app.config.port);
            }
        });

        super.boot(next);
    }
}

module.exports = DeveloperToolsProvider;