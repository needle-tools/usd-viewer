static char const* NeedleSurfaceShader = R"METAL(
#include <metal_stdlib>
using namespace metal;
uint unpack(float4 packed) {
    const uint3 values=uint3(round(packed.rgb*256.0f))&255u;
    return values.x|(values.y<<8)|(values.z<<16);
}
uint metadataWord(texture2d<float,access::read> input,uint index) {
    const uint y=input.get_height()-2;
    return unpack(input.read(uint2(index*2,y)))|(unpack(input.read(uint2(index*2+1,y)))<<24);
}
struct V { float4 position [[position]]; };
vertex V vertexMain(uint i [[vertex_id]]) {
    float2 p=float2((i<<1)&2,i&2);return V{float4(p*2.0-1.0,0,1)};
}
struct O {
    float4 color [[color(0)]];
    int prim [[color(1)]];
    int instance [[color(2)]];
    int element [[color(3)]];
    float depth [[depth(any)]];
};
fragment O fragmentMain(V v [[stage_in]],texture2d<float,access::read> input [[texture(0)]]) {
    uint width=input.get_width()/4,height=(input.get_height()-2)/2;
    uint2 p=uint2(v.position.xy);p.y=height-1-p.y;
    if(metadataWord(input,3)!=0x4e484447u)discard_fragment();
    const uint high=unpack(input.read(uint2(p.x+width,p.y+height)));
    const uint elementHigh=unpack(input.read(uint2(p.x+width*2,p.y+height)));
    const uint d=unpack(input.read(uint2(p.x+width,p.y)))|((high&255u)<<24);
    const int prim=as_type<int>(unpack(input.read(uint2(p.x+width*2,p.y)))|(((high>>8)&255u)<<24));
    const int instance=as_type<int>(unpack(input.read(uint2(p.x+width*3,p.y)))|(((high>>16)&255u)<<24));
    const int element=as_type<int>(unpack(input.read(uint2(p.x,p.y+height)))|((elementHigh&255u)<<24));
    return O{input.read(p),prim,prim<0?-1:instance,prim<0?-1:element,as_type<float>(d)};
}
fragment float linearDepthMain(V v [[stage_in]],texture2d<float,access::read> input [[texture(0)]]) {
    const uint width=input.get_width()/4,height=(input.get_height()-2)/2;
    uint2 p=uint2(v.position.xy);p.y=height-1-p.y;
    if(metadataWord(input,3)!=0x4e484447u)discard_fragment();
    const uint high=unpack(input.read(uint2(p.x+width*2,p.y+height)));
    return as_type<float>(unpack(input.read(uint2(p.x+width*3,p.y+height)))|(((high>>8)&255u)<<24));
}
struct Metadata { uint4 info;atomic_uint errors;atomic_uint tests;uint badIndex;uint badValue; };
kernel void metadataMain(texture2d<float,access::read> input [[texture(0)]],
                         device Metadata* output [[buffer(0)]],constant uint& validate [[buffer(1)]],
                         uint index [[thread_position_in_grid]]) {
    if(index==0){output->info=uint4(metadataWord(input,0),metadataWord(input,1),metadataWord(input,2),metadataWord(input,3));return;}
    if(validate==0)return;
    const uint location=index-1+8;
    if(location>=input.get_width()*2)return;
    const uint2 p=uint2(location%input.get_width(),input.get_height()-2+location/input.get_width());
    const uint n=index-1,v=n&255u;
    const uint expected=v|((v^170u^((n>>8)*37u))<<8)|(((n*73u)&255u)<<16);
    const uint actual=unpack(input.read(p));
    if(actual!=expected){
        if(atomic_fetch_add_explicit(&output->errors,1,memory_order_relaxed)==0){output->badIndex=n;output->badValue=actual;}
    }
    atomic_fetch_add_explicit(&output->tests,1,memory_order_relaxed);
}
)METAL";
