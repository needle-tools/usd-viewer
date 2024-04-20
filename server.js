const fastify = require('fastify')()
const path = require('path') 

// Headers are required for SharedArrayBuffers and WebAssembly
// Otherwise we wouldn't need a server at all.
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'public'),
  prefix: '/',
  setHeaders: function(res, path, stat) {

    const needsHeaders = path.replaceAll("\\", '/').includes('/emHd') || path.endsWith('index.html');
    if (!needsHeaders) return;
    
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  },
})

fastify.listen({port: process.env.PORT || 3003}, function(err, address) {
  if (err) {
    fastify.log.error(err);
    console.error("Error starting server on port 3003", err);
    process.exit(1);
  }
  console.log(`Your app is listening on ${address}`);
  fastify.log.info(`server listening on ${address}`);
});
