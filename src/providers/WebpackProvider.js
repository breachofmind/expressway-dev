var Provider = require('expressway').Provider;

class WebpackProvider extends Provider
{
    constructor(app)
    {
        super(app);

        this.order = 1;

        app.use([
            require('../middlewares/Livereload'),
            require('../middlewares/Webpack'),
        ]);

        app.call(this,'buildCommand');
    }

    /**
     * Add the build command.
     * @param app {Application}
     * @param cli {CLI}
     */
    buildCommand(app,cli)
    {
        cli.command('build', "Run webpack").action((env,opts) => {
            app.boot().then(done => {
                //console.log(app.root.webpack.configuration);
                app.root.webpack.run().then(done => {
                    cli.output(["Built!"],true);
                })
            })

        });
    }

    /**
     * Attach the webpack instance to each extension.
     * @param next
     * @param app
     */
    boot(next,app)
    {
        var WebpackService = app.load(require('../services/WebpackService'));

        app.extensions.each(extension => {
            extension.webpack = new WebpackService(extension);
        });

        super.boot(next);
    }
}

module.exports = WebpackProvider;