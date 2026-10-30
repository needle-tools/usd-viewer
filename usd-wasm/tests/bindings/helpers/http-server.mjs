import {createServer} from 'node:http';
let requests=0;
const server=createServer((_request,response)=>{
  requests++;response.setHeader('Connection','close');response.end(process.argv[2]);
});
server.listen(0,'127.0.0.1',()=>process.send({kind:'ready',port:server.address().port}));
process.on('message',message=>{if(message.kind==='count')process.send({kind:'count',id:message.id,count:requests});});
process.on('disconnect',()=>process.exit(0));
