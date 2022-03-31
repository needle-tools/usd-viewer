const fastify = require('fastify')()
const path = require('path') 

fastify.register(require('fastify-static'), {
  root: path.join(__dirname, ''),
  prefix: '/', // optional: default '/',
  setHeaders: function(res, path, stat) {
    res.header(name, value)
  },
})

// Run the server and report out to the logs
fastify.listen(process.env.PORT, '0.0.0.0', function(err, address) {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  console.log(`Your app is listening on ${address}`);
  fastify.log.info(`server listening on ${address}`);
});
