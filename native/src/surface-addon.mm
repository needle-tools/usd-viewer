#include <node_api.h>
#include <IOSurface/IOSurface.h>
#include <servers/bootstrap.h>
#include <string>
#include "surface-message.h"
static napi_value Publish(napi_env env, napi_callback_info info) {
    size_t argc=6; napi_value argv[6]; napi_get_cb_info(env,info,&argc,argv,nullptr,nullptr);
    if(argc!=6) { napi_throw_type_error(env,nullptr,"publishSurface(service, IOSurfaceRef buffer, frame, width, height, sceneFrame)");return nullptr; }
    size_t size=0; napi_get_value_string_utf8(env,argv[0],nullptr,0,&size);
    std::string name(size,'\0'); napi_get_value_string_utf8(env,argv[0],name.data(),size+1,&size);
    void* ptr=nullptr; size_t bytes=0; bool isBuffer=false;
    napi_is_buffer(env,argv[1],&isBuffer);
    if(!isBuffer || napi_get_buffer_info(env,argv[1],&ptr,&bytes)!=napi_ok || bytes!=sizeof(IOSurfaceRef)) {
        napi_throw_type_error(env,nullptr,"Expected the native IOSurfaceRef buffer, never pixel data");return nullptr;
    }
    IOSurfaceRef surface=nullptr; memcpy(&surface,ptr,sizeof(surface));
    if(!surface) { napi_throw_error(env,nullptr,"Missing IOSurface");return nullptr; }
    mach_port_t destination=MACH_PORT_NULL;
    kern_return_t result=bootstrap_look_up(bootstrap_port,name.c_str(),&destination);
    if(result!=KERN_SUCCESS) { napi_throw_error(env,nullptr,mach_error_string(result));return nullptr; }
    NeedleSurfaceMessage message{};
    message.header.msgh_bits=MACH_MSGH_BITS(MACH_MSG_TYPE_COPY_SEND,0)|MACH_MSGH_BITS_COMPLEX;
    message.header.msgh_size=sizeof(message);message.header.msgh_remote_port=destination;
    message.header.msgh_id=0x4e484450;
    message.body.msgh_descriptor_count=1;
    message.surface.name=IOSurfaceCreateMachPort(surface);
    message.surface.disposition=MACH_MSG_TYPE_MOVE_SEND;
    message.surface.type=MACH_MSG_PORT_DESCRIPTOR;
    double serial; napi_get_value_double(env,argv[2],&serial);message.frame=uint64_t(serial);
    napi_get_value_double(env,argv[5],&serial);message.sceneFrame=uint64_t(serial);
    napi_get_value_uint32(env,argv[3],&message.width);napi_get_value_uint32(env,argv[4],&message.height);
    result=mach_msg(&message.header,MACH_SEND_MSG|MACH_SEND_TIMEOUT,sizeof(message),0,MACH_PORT_NULL,0,MACH_PORT_NULL);
    mach_port_deallocate(mach_task_self(),destination);
    if(result!=KERN_SUCCESS) { mach_msg_destroy(&message.header);napi_throw_error(env,nullptr,mach_error_string(result));return nullptr; }
    napi_value value;napi_get_undefined(env,&value);return value;
}
static napi_value Init(napi_env env,napi_value exports) {
    napi_value value;napi_create_function(env,"publishSurface",NAPI_AUTO_LENGTH,Publish,nullptr,&value);
    napi_set_named_property(env,exports,"publishSurface",value);return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME,Init)
