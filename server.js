const fastify = require('fastify')()
const path = require('path') 

fastify.register(require('fastify-static'), {
  root: path.join(__dirname, 'public'),
  prefix: '/',
  setHeaders: function(res, path, stat) {
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  },
})

fastify.listen(process.env.PORT, '0.0.0.0', function(err, address) {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  console.log(`Your app is listening on ${address}`);
  fastify.log.info(`server listening on ${address}`);
});
