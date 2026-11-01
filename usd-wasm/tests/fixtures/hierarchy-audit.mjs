// Shared native-binding/browser fixture: classes are sources, their instances
// compose children at /World/A and /World/B. Other rows exercise stage states.
export const hierarchyFiles={
 'hierarchy-audit.usda':`#usda 1.0
(
 startTimeCode = 1
 endTimeCode = 10
)
class Xform "Shape" {
 def Sphere "Ball" {
  double radius = 0.5
 }
}
class Xform "Template" {
 def Cube "Animated" {
  double size.timeSamples = {1: 1, 10: 2}
 }
 def Xform "Nested" (instanceable = true; prepend references = </Shape>) {}
}
def Xform "World" {
 def Xform "A" (instanceable = true; prepend references = </Template>) {
  double3 xformOp:translate = (-3,0,0)
  uniform token[] xformOpOrder = ["xformOp:translate"]
 }
 def Xform "B" (instanceable = true; prepend references = </Template>) {
  double3 xformOp:translate = (3,0,0)
  uniform token[] xformOpOrder = ["xformOp:translate"]
 }
 def Xform "FlagOnly" (instanceable = true) {}
 over "Undefined" {
  over "Deeper" {}
 }
 def Xform "Inactive" (active = false) {
  def Cube "AuthoredChild" {}
 }
 def Xform "HiddenParent" {
  token visibility.timeSamples = {1: "invisible", 10: "inherited"}
  def Cube "HiddenChild" {}
  def Cube "AlwaysHidden" {
   token visibility = "invisible"
  }
 }
 def Scope "Shapes" {
  def Cube "Red" {}
  def Sphere "Blue" {}
 }
 def PointInstancer "Scatter" {
  rel prototypes = [</World/Shapes/Red>, </World/Shapes/Blue>]
  int[] protoIndices = [0,1,0]
  point3f[] positions = [(-2,0,3), (0,0,3), (2,0,3)]
  int64[] ids = [10,20,30]
 }
 def Xform "Product" (
  prepend variantSets = "look"
  variants = {string look = "warm"}
 ) {
  variantSet "look" = {
   "warm" {
    def Cube "Warm" {}
   }
   "cool" {
    def Sphere "Cool" {}
   }
  }
 }
 def Xform "WithPayload" (
  prepend references = @referenced.usda@</Part>
  prepend payload = @payload.usda@</Part>
 ) {}
}`,
 'referenced.usda':`#usda 1.0
def Xform "Part" {
 def Cube "Referenced" {}
}`,
 'payload.usda':`#usda 1.0
def Xform "Part" {
 def Sphere "PayloadOnly" {}
}`,
};
