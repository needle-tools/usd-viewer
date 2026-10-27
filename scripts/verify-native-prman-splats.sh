#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OPENUSD_PREFIX="${OPENUSD_PREFIX:-/Users/herbst/OpenUSD-26.05-native-x86_64}"
RMANTREE="${RMANTREE:-/Applications/Pixar/RenderManProServer-27.2}"
PYTHON_BIN="${PYTHON_BIN:-/usr/local/bin/python3}"
FIXTURE="${FIXTURE:-${ROOT_DIR}/usd-wasm/tests/data/gaussian-splats/chamaeleon.usdc}"
OUTPUT="${1:-/tmp/openusd-prman-chamaeleon.png}"

if [[ "${OUTPUT}" != /* ]]; then
  OUTPUT="${PWD}/${OUTPUT}"
fi
mkdir -p "$(dirname "${OUTPUT}")"

test -x "${RMANTREE}/bin/prman"
test -x "${OPENUSD_PREFIX}/bin/usdrecord"
test -f "${FIXTURE}"

export RMANTREE
export PATH="${RMANTREE}/bin:${OPENUSD_PREFIX}/bin:${PATH}"
export PYTHONPATH="${OPENUSD_PREFIX}/lib/python${PYTHONPATH:+:${PYTHONPATH}}"
export DYLD_LIBRARY_PATH="${OPENUSD_PREFIX}/lib:${RMANTREE}/lib${DYLD_LIBRARY_PATH:+:${DYLD_LIBRARY_PATH}}"
export RMAN_SHADERPATH="${RMANTREE}/lib/shaders:${OPENUSD_PREFIX}/plugin/usd/resources/shaders"
export RMAN_RIXPLUGINPATH="${RMANTREE}/lib/plugins"
export RMAN_TEXTUREPATH="${RMANTREE}/lib/textures:${RMANTREE}/lib/plugins:${OPENUSD_PREFIX}/plugin/usd"
export RMAN_DISPLAYPATH="${RMANTREE}/lib/plugins"
export RMAN_PROCEDURALPATH="${RMANTREE}/lib/plugins"
unset PXR_PLUGINPATH_NAME

arch -x86_64 "${PYTHON_BIN}" - <<'PY'
from pxr import Plug

plugins = {plugin.name for plugin in Plug.Registry().GetAllPlugins()}
assert "hdPrmanLoader" in plugins
assert "hdEmbree" in plugins
PY

arch -x86_64 "${OPENUSD_PREFIX}/bin/usdchecker" "${FIXTURE}"
render_log="$(mktemp -t openusd-prman-splats.XXXXXX)"
trap 'rm -f "${render_log}"' EXIT
arch -x86_64 "${PYTHON_BIN}" "${OPENUSD_PREFIX}/bin/usdrecord" \
  --renderer "RenderMan RIS" \
  --imageWidth 512 \
  "${FIXTURE}" \
  "${OUTPUT}" 2>&1 | tee "${render_log}"

grep -q "Renderer plugin: HdPrmanLoaderRendererPlugin" "${render_log}"
if grep -Eiq '(^|[[:space:]])(warning|error|fatal):' "${render_log}"; then
  echo "RenderMan emitted diagnostics while rendering the splat fixture." >&2
  exit 1
fi

test -s "${OUTPUT}"
read -r variation alpha_mean colors <<< "$(magick "${OUTPUT}" \
  -colorspace sRGB -format '%[fx:standard_deviation] %[fx:mean.a] %k' info:)"
read -r trim_width trim_height <<< "$(magick "${OUTPUT}" -alpha extract \
  -threshold 1% -trim -format '%w %h' info:)"

awk -v value="${variation}" 'BEGIN { exit !(value > 0.15) }'
awk -v value="${alpha_mean}" 'BEGIN { exit !(value > 0.05 && value < 0.5) }'
awk -v value="${colors}" 'BEGIN { exit !(value > 1000) }'
awk -v width="${trim_width}" -v height="${trim_height}" \
  'BEGIN { exit !(width > 150 && width < 450 && height > 200 && height < 370) }'

echo "Prman Gaussian splat render: ${OUTPUT}"
echo "  variation=${variation} alpha=${alpha_mean} colors=${colors} trim=${trim_width}x${trim_height}"
