var Provider = require('expressway').Provider;

class WebpackProvider extends Provider
{
    constructor(app)
    {
        super(app);

        this.order = 0;

        app.use([
            require('../middlewares/Livereload'),
            require('../middlewares/Webpack'),
        ]);
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