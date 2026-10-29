// Shared controls: Material Symbols Rounded (outlined), Google, Apache-2.0.
// USD schema silhouettes: Needle, matched optical weight. See icons-LICENSE.txt.
// Source: google/material-design-icons; added symbols pinned to 10ecc14790612ca8fd164e3f4ffe9c16fc50d5b7.
// Viewer icon spec: 16px optical size; source 960-unit grid scaled uniformly.
// Filled currentColor silhouettes encode the outlined rounded family (~1.3px ink).
// USD-specific glyphs use 1.3px rounded strokes on the 16 grid, ≥0.5px edge
// margins and ≥1.25px separate-mark clearance. No secondary opacity or baked colors. Keep the source's rounded
// terminals and optical margins. Eye/slashed eye = visibility; power/block =
// activation. Schema silhouettes distinguish geometry/lights; stacked layers =
// class, pencil = over, schema = def. Menus reuse object/action metaphors.
// Save uses a simplified connected floppy outline at 16px.
// 16px adaptations: reduced camera iris; simplified bulb base; mesh cube without framing corners.
// Labels, title and aria-pressed live on controls, never inside decorative SVGs.
const paths = {
  "first_page": [
    "M280-240q-17 0-28.5-11.5T240-280v-400q0-17 11.5-28.5T280-720q17 0 28.5 11.5T320-680v400q0 17-11.5 28.5T280-240Zm272-240 156 156q11 11 11 28t-11 28q-11 11-28 11t-28-11L468-452q-6-6-8.5-13t-2.5-15q0-8 2.5-15t8.5-13l184-184q11-11 28-11t28 11q11 11 11 28t-11 28L552-480Z"
  ],
  "chevron_left": [
    "m432-480 156 156q11 11 11 28t-11 28q-11 11-28 11t-28-11L348-452q-6-6-8.5-13t-2.5-15q0-8 2.5-15t8.5-13l184-184q11-11 28-11t28 11q11 11 11 28t-11 28L432-480Z"
  ],
  "play_arrow": [
    "M320-273v-414q0-17 12-28.5t28-11.5q5 0 10.5 1.5T381-721l326 207q9 6 13.5 15t4.5 19q0 10-4.5 19T707-446L381-239q-5 3-10.5 4.5T360-233q-16 0-28-11.5T320-273Zm80-207Zm0 134 210-134-210-134v268Z"
  ],
  "pause": [
    "M600-200q-33 0-56.5-23.5T520-280v-400q0-33 23.5-56.5T600-760h80q33 0 56.5 23.5T760-680v400q0 33-23.5 56.5T680-200h-80Zm-320 0q-33 0-56.5-23.5T200-280v-400q0-33 23.5-56.5T280-760h80q33 0 56.5 23.5T440-680v400q0 33-23.5 56.5T360-200h-80Zm320-80h80v-400h-80v400Zm-320 0h80v-400h-80v400Zm0-400v400-400Zm320 0v400-400Z"
  ],
  "chevron_right": [
    "M504-480 348-636q-11-11-11-28t11-28q11-11 28-11t28 11l184 184q6 6 8.5 13t2.5 15q0 8-2.5 15t-8.5 13L404-268q-11 11-28 11t-28-11q-11-11-11-28t11-28l156-156Z"
  ],
  "last_page": [
    "M408-480 252-636q-11-11-11-28t11-28q11-11 28-11t28 11l184 184q6 6 8.5 13t2.5 15q0 8-2.5 15t-8.5 13L308-268q-11 11-28 11t-28-11q-11-11-11-28t11-28l156-156Zm272-240q17 0 28.5 11.5T720-680v400q0 17-11.5 28.5T680-240q-17 0-28.5-11.5T640-280v-400q0-17 11.5-28.5T680-720Z"
  ],
  "visibility": [
    "M480-320q75 0 127.5-52.5T660-500q0-75-52.5-127.5T480-680q-75 0-127.5 52.5T300-500q0 75 52.5 127.5T480-320Zm0-72q-45 0-76.5-31.5T372-500q0-45 31.5-76.5T480-608q45 0 76.5 31.5T588-500q0 45-31.5 76.5T480-392Zm0 192q-134 0-244.5-72T61-462q-5-9-7.5-18.5T51-500q0-10 2.5-19.5T61-538q64-118 174.5-190T480-800q134 0 244.5 72T899-538q5 9 7.5 18.5T909-500q0 10-2.5 19.5T899-462q-64 118-174.5 190T480-200Zm0-300Zm0 220q113 0 207.5-59.5T832-500q-50-101-144.5-160.5T480-720q-113 0-207.5 59.5T128-500q50 101 144.5 160.5T480-280Z"
  ],
  "visibility_off": [
    "M607-627q29 29 42.5 66t9.5 76q0 15-11 25.5T622-449q-15 0-25.5-10.5T586-485q5-26-3-50t-25-41q-17-17-41-26t-51-4q-15 0-25.5-11T430-643q0-15 10.5-25.5T466-679q38-4 75 9.5t66 42.5Zm-127-93q-19 0-37 1.5t-36 5.5q-17 3-30.5-5T358-742q-5-16 3.5-31t24.5-18q23-5 46.5-7t47.5-2q137 0 250.5 72T904-534q4 8 6 16.5t2 17.5q0 9-1.5 17.5T905-466q-18 40-44.5 75T802-327q-12 11-28 9t-26-16q-10-14-8.5-30.5T753-392q24-23 44-50t35-58q-50-101-144.5-160.5T480-720Zm0 520q-134 0-245-72.5T60-463q-5-8-7.5-17.5T50-500q0-10 2-19t7-18q20-40 46.5-76.5T166-680l-83-84q-11-12-10.5-28.5T84-820q11-11 28-11t28 11l680 680q11 11 11.5 27.5T820-84q-11 11-28 11t-28-11L624-222q-35 11-71 16.5t-73 5.5ZM222-624q-29 26-53 57t-41 67q50 101 144.5 160.5T480-280q20 0 39-2.5t39-5.5l-36-38q-11 3-21 4.5t-21 1.5q-75 0-127.5-52.5T300-500q0-11 1.5-21t4.5-21l-84-82Zm319 93Zm-151 75Z"
  ],
  "power_settings_new": [
    "M440-480v-320q0-17 11.5-28.5T480-840q17 0 28.5 11.5T520-800v320q0 17-11.5 28.5T480-440q-17 0-28.5-11.5T440-480Zm40 360q-74 0-139.5-28.5T226-226q-49-49-77.5-114.5T120-480q0-69 25.5-132.5T217-726q11-12 28-12t29 12q11 11 10 27.5T272-669q-34 38-53 86.5T200-480q0 116 82 198t198 82q117 0 198.5-82T760-480q0-54-19-103.5T687-671q-11-12-11.5-28t10.5-27q12-12 29-12t28 12q47 50 72 113.5T840-480q0 74-28.5 139.5t-77 114.5q-48.5 49-114 77.5T480-120Z"
  ],
  "block": [
    "M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q54 0 104-17.5t92-50.5L228-676q-33 42-50.5 92T160-480q0 134 93 227t227 93Zm252-124q33-42 50.5-92T800-480q0-134-93-227t-227-93q-54 0-104 17.5T284-732l448 448Z"
  ],
  "expand_more": [
    "M480-362q-8 0-15-2.5t-13-8.5L268-557q-11-11-11-28t11-28q11-11 28-11t28 11l156 156 156-156q11-11 28-11t28 11q11 11 11 28t-11 28L508-373q-6 6-13 8.5t-15 2.5Z"
  ],
  "close": [
    "M480-424 284-228q-11 11-28 11t-28-11q-11-11-11-28t11-28l196-196-196-196q-11-11-11-28t11-28q11-11 28-11t28 11l196 196 196-196q11-11 28-11t28 11q11 11 11 28t-11 28L536-480l196 196q11 11 11 28t-11 28q-11 11-28 11t-28-11L480-424Z"
  ],
  "arrow_back": [
    "m313-440 196 196q12 12 11.5 28T508-188q-12 11-28 11.5T452-188L188-452q-6-6-8.5-13t-2.5-15q0-8 2.5-15t8.5-13l264-264q11-11 27.5-11t28.5 11q12 12 12 28.5T508-715L313-520h447q17 0 28.5 11.5T800-480q0 17-11.5 28.5T760-440H313Z"
  ],
  "photo_camera": [
    "M480-284a156 156 0 1 0 0-312a156 156 0 1 0 0 312ZM480-364a76 76 0 1 1 0-152a76 76 0 1 1 0 152ZM160-120q-33 0-56.5-23.5T80-200v-480q0-33 23.5-56.5T160-760h126l50-54q11-12 26.5-19t32.5-7h170q17 0 32.5 7t26.5 19l50 54h126q33 0 56.5 23.5T880-680v480q0 33-23.5 56.5T800-120H160Zm0-80h640v-480H638l-73-80H395l-73 80H160v480Zm320-240Z"
  ],
  "lightbulb": [
    "M360-120q-17 0-28.5-11.5T320-160q0-17 11.5-28.5T360-200h240q17 0 28.5 11.5T640-160q0 17-11.5 28.5T600-120H360ZM330-320q-69-41-109.5-110T180-580q0-125 87.5-212.5T480-880q125 0 212.5 87.5T780-580q0 81-40.5 150T630-320H330Zm24-80h252q45-32 69.5-79T700-580q0-92-64-156t-156-64q-92 0-156 64t-64 156q0 54 24.5 101t69.5 79Zm126 0Z"
  ],
  "view_in_ar": [
    "M440-181 240-296q-19-11-29.5-29T200-365v-230q0-22 10.5-40t29.5-29l200-115q19-11 40-11t40 11l200 115q19 11 29.5 29t10.5 40v230q0 22-10.5 40T720-296L520-181q-19 11-40 11t-40-11Zm0-92v-184l-160-93v185l160 92Zm80 0 160-92v-185l-160 93v184ZM480-526l158-93-158-91-158 91 158 93Zm0 45Zm0-45Zm40 69Zm-80 0Z"
  ],
  "palette": [
    "M480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 32.5-156t88-127Q256-817 330-848.5T488-880q80 0 151 27.5t124.5 76q53.5 48.5 85 115T880-518q0 115-70 176.5T640-280h-74q-9 0-12.5 5t-3.5 11q0 12 15 34.5t15 51.5q0 50-27.5 74T480-80Zm0-400Zm-220 40q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43q0 26 17 43t43 17Zm120-160q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43q0 26 17 43t43 17Zm200 0q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43q0 26 17 43t43 17Zm120 160q26 0 43-17t17-43q0-26-17-43t-43-17q-26 0-43 17t-17 43q0 26 17 43t43 17ZM480-160q9 0 14.5-5t5.5-13q0-14-15-33t-15-57q0-42 29-67t71-25h70q66 0 113-38.5T800-518q0-121-92.5-201.5T488-800q-136 0-232 93t-96 227q0 133 93.5 226.5T480-160Z"
  ],
  "folder_open": [
    "M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h207q16 0 30.5 6t25.5 17l57 57h360q17 0 28.5 11.5T880-680q0 17-11.5 28.5T840-640H447l-80-80H160v480l79-263q8-26 29.5-41.5T316-560h516q41 0 64.5 32.5T909-457l-72 240q-8 26-29.5 41.5T760-160H160Zm84-80h516l72-240H316l-72 240Zm-84-262v-218 218Zm84 262 72-240-72 240Z"
  ],
  "scatter_plot": [
    "M680-120q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47Zm0-80q33 0 56.5-23.5T760-280q0-33-23.5-56.5T680-360q-33 0-56.5 23.5T600-280q0 33 23.5 56.5T680-200Zm-400-40q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47Zm0-80q33 0 56.5-23.5T360-400q0-33-23.5-56.5T280-480q-33 0-56.5 23.5T200-400q0 33 23.5 56.5T280-320Zm160-240q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47Zm0-80q33 0 56.5-23.5T520-720q0-33-23.5-56.5T440-800q-33 0-56.5 23.5T360-720q0 33 23.5 56.5T440-640Zm240 360ZM280-400Zm160-320Z"
  ],
  "timeline": [
    "M120-240q-33 0-56.5-23.5T40-320q0-33 23.5-56.5T120-400h10.5q4.5 0 9.5 2l182-182q-2-5-2-9.5V-600q0-33 23.5-56.5T400-680q33 0 56.5 23.5T480-600q0 2-2 20l102 102q5-2 9.5-2h21q4.5 0 9.5 2l142-142q-2-5-2-9.5V-640q0-33 23.5-56.5T840-720q33 0 56.5 23.5T920-640q0 33-23.5 56.5T840-560h-10.5q-4.5 0-9.5-2L678-420q2 5 2 9.5v10.5q0 33-23.5 56.5T600-320q-33 0-56.5-23.5T520-400v-10.5q0-4.5 2-9.5L420-522q-5 2-9.5 2H400q-2 0-20-2L198-340q2 5 2 9.5v10.5q0 33-23.5 56.5T120-240Z"
  ],
  "waves": [
    "M280-202q-49 0-78 22t-81 31q-17 3-29-8t-12-28q0-17 11.5-28.5T120-230q36-11 68-30.5t92-19.5q38 0 62.5 8.5t45.5 19q21 10.5 42 19.5t50 9q29 0 50-9t42-19.5q21-10.5 46-19t62-8.5q60 0 92 19.5t68 30.5q17 5 28.5 16.5T880-185q0 17-12 28t-29 8q-52-9-81-31t-78-22q-28 0-48.5 8.5t-41 19Q570-164 544.5-155t-64.5 9q-39 0-64.5-9t-46-19.5Q349-185 329-193.5t-49-8.5Zm0-178q-49 0-78 22t-81 31q-17 3-29-8t-12-28q0-17 11.5-28.5T120-408q36-11 68-30.5t92-19.5q38 0 62.5 8.5t45.5 19q21 10.5 42 19.5t50 9q29 0 50-9t42-19.5q21-10.5 46-19t62-8.5q60 0 92 19.5t68 30.5q17 5 28.5 16.5T880-363q0 17-12 28t-29 8q-52-9-81-31t-78-22q-29 0-49.5 8.5t-41 19Q569-342 544-333t-64 9q-39 0-64.5-9t-46-19.5Q349-363 329-371.5t-49-8.5Zm0-178q-49 0-78 22t-81 31q-17 3-29-8t-12-28q0-17 11.5-28.5T120-586q36-11 68-30.5t92-19.5q38 0 62.5 8.5t45.5 19q21 10.5 42 19.5t50 9q29 0 50-9t42-19.5q21-10.5 46-19t62-8.5q60 0 92 19.5t68 30.5q17 5 28.5 16.5T880-541q0 17-12 28t-29 8q-52-9-81-31t-78-22q-28 0-48.5 8.5t-41 19Q570-520 544.5-511t-64.5 9q-39 0-64.5-9t-46-19.5Q349-541 329-549.5t-49-8.5Zm0-178q-49 0-78 22t-81 31q-17 3-29-8t-12-28q0-17 11.5-28.5T120-764q36-11 68-30.5t92-19.5q38 0 62.5 8.5t45.5 19q21 10.5 42 19.5t50 9q29 0 50-9t42-19.5q21-10.5 46-19t62-8.5q60 0 92 19.5t68 30.5q17 5 28.5 16.5T880-719q0 17-12 28t-29 8q-52-9-81-31t-78-22q-28 0-48.5 8.5t-41 19Q570-698 544.5-689t-64.5 9q-39 0-64.5-9t-46-19.5Q349-719 329-727.5t-49-8.5Z"
  ]
};
const labels = {"visibility": "Visible", "visibility_off": "Hidden", "power_settings_new": "Active", "block": "Inactive", "expand_more": "Collapse branch", "chevron_right": "Expand branch or next frame", "close": "Close", "arrow_back": "Back", "photo_camera": "Camera", "lightbulb": "Light", "view_in_ar": "Cube", "palette": "Material", "folder_open": "Group", "scatter_plot": "Points", "timeline": "Curve", "waves": "Volume", "first_page": "First frame", "last_page": "Last frame", "chevron_left": "Previous frame", "play_arrow": "Play", "pause": "Pause"};
export const ICONS = Object.fromEntries(Object.entries(paths).map(([name, values]) => [name, {
  label: labels[name],
  group: ['visibility','visibility_off','power_settings_new','block'].includes(name) ? 'stage-actions' : ['photo_camera','lightbulb','view_in_ar','palette','folder_open','scatter_plot','timeline','waves'].includes(name) ? 'prim-types' : ['close','arrow_back'].includes(name) ? 'workspace' : 'transport',
  svg: values.map(d => `<path fill="currentColor" stroke="none" transform="translate(0 16) scale(0.016666666667)" d="${d}"/>`).join(''),
}]));
Object.assign(ICONS, {
  "share": {
    "label": "Share USD",
    "group": "menu",
    "svg": "<path fill=\"currentColor\" stroke=\"none\" transform=\"translate(0 16) scale(0.016666666667)\" d=\"M720-80q-50 0-85-35t-35-85q0-7 1-14.5t3-13.5L322-392q-17 15-38 23.5t-44 8.5q-50 0-85-35t-35-85q0-50 35-85t85-35q23 0 44 8.5t38 23.5l282-164q-2-6-3-13.5t-1-14.5q0-50 35-85t85-35q50 0 85 35t35 85q0 50-35 85t-85 35q-23 0-44-8.5T638-672L356-508q2 6 3 13.5t1 14.5q0 7-1 14.5t-3 13.5l282 164q17-15 38-23.5t44-8.5q50 0 85 35t35 85q0 50-35 85t-85 35Zm0-640q17 0 28.5-11.5T760-760q0-17-11.5-28.5T720-800q-17 0-28.5 11.5T680-760q0 17 11.5 28.5T720-720ZM240-440q17 0 28.5-11.5T280-480q0-17-11.5-28.5T240-520q-17 0-28.5 11.5T200-480q0 17 11.5 28.5T240-440Zm480 280q17 0 28.5-11.5T760-200q0-17-11.5-28.5T720-240q-17 0-28.5 11.5T680-200q0 17 11.5 28.5T720-160Zm0-600ZM240-480Zm480 280Z\"/>"
  },
  "filter_center_focus": {
    "label": "Frame selection",
    "group": "menu",
    "svg": "<path fill=\"currentColor\" stroke=\"none\" transform=\"translate(0 16) scale(0.016666666667)\" d=\"M200-120q-33 0-56.5-23.5T120-200v-120q0-17 11.5-28.5T160-360q17 0 28.5 11.5T200-320v120h120q17 0 28.5 11.5T360-160q0 17-11.5 28.5T320-120H200Zm560 0H640q-17 0-28.5-11.5T600-160q0-17 11.5-28.5T640-200h120v-120q0-17 11.5-28.5T800-360q17 0 28.5 11.5T840-320v120q0 33-23.5 56.5T760-120ZM120-640v-120q0-33 23.5-56.5T200-840h120q17 0 28.5 11.5T360-800q0 17-11.5 28.5T320-760H200v120q0 17-11.5 28.5T160-600q-17 0-28.5-11.5T120-640Zm640 0v-120H640q-17 0-28.5-11.5T600-800q0-17 11.5-28.5T640-840h120q33 0 56.5 23.5T840-760v120q0 17-11.5 28.5T800-600q-17 0-28.5-11.5T760-640ZM480-360q-50 0-85-35t-35-85q0-50 35-85t85-35q50 0 85 35t35 85q0 50-35 85t-85 35Zm0-80q17 0 28.5-11.5T520-480q0-17-11.5-28.5T480-520q-17 0-28.5 11.5T440-480q0 17 11.5 28.5T480-440Z\"/>"
  },
  "open_in_new": {
    "label": "Open in window",
    "group": "menu",
    "svg": "<path fill=\"currentColor\" stroke=\"none\" transform=\"translate(0 16) scale(0.016666666667)\" d=\"M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h240q17 0 28.5 11.5T480-800q0 17-11.5 28.5T440-760H200v560h560v-240q0-17 11.5-28.5T800-480q17 0 28.5 11.5T840-440v240q0 33-23.5 56.5T760-120H200Zm560-584L416-360q-11 11-28 11t-28-11q-11-11-11-28t11-28l344-344H600q-17 0-28.5-11.5T560-800q0-17 11.5-28.5T600-840h200q17 0 28.5 11.5T840-800v200q0 17-11.5 28.5T800-560q-17 0-28.5-11.5T760-600v-104Z\"/>"
  },
  "restart_alt": {
    "label": "Reset layout",
    "group": "menu",
    "svg": "<path fill=\"currentColor\" stroke=\"none\" transform=\"translate(0 16) scale(0.016666666667)\" d=\"M393-132q-103-29-168-113.5T160-440q0-57 19-108.5t54-94.5q11-12 27-12.5t29 12.5q11 11 11.5 27T290-586q-24 31-37 68t-13 78q0 81 47.5 144.5T410-209q13 4 21.5 15t8.5 24q0 20-14 31.5t-33 6.5Zm174 0q-19 5-33-7t-14-32q0-12 8.5-23t21.5-15q75-24 122.5-87T720-440q0-100-70-170t-170-70h-3l16 16q11 11 11 28t-11 28q-11 11-28 11t-28-11l-84-84q-6-6-8.5-13t-2.5-15q0-8 2.5-15t8.5-13l84-84q11-11 28-11t28 11q11 11 11 28t-11 28l-16 16h3q134 0 227 93t93 227q0 109-65 194T567-132Z\"/>"
  },
  "save": {
    "label": "Save layout", "group": "menu",
    "svg": "<path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M2 2H11L14 5V14H2ZM5 2V6H10V2M5 14V10H11V14\"/>"
  },
  "info": {
    "label": "About",
    "group": "menu",
    "svg": "<path fill=\"currentColor\" stroke=\"none\" transform=\"translate(0 16) scale(0.016666666667)\" d=\"M480-280q17 0 28.5-11.5T520-320v-160q0-17-11.5-28.5T480-520q-17 0-28.5 11.5T440-480v160q0 17 11.5 28.5T480-280Zm0-320q17 0 28.5-11.5T520-640q0-17-11.5-28.5T480-680q-17 0-28.5 11.5T440-640q0 17 11.5 28.5T480-600Zm0 520q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z\"/>"
  },
  "chat_bubble": {
    "label": "Feedback",
    "group": "menu",
    "svg": "<path fill=\"currentColor\" stroke=\"none\" transform=\"translate(0 16) scale(0.016666666667)\" d=\"m240-240-92 92q-19 19-43.5 8.5T80-177v-623q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H240Zm-34-80h594v-480H160v525l46-45Zm-46 0v-480 480Z\"/>"
  },
  "fullscreen": {
    "label": "Maximize or restore",
    "group": "menu",
    "svg": "<path fill=\"currentColor\" stroke=\"none\" transform=\"translate(0 16) scale(0.016666666667)\" d=\"M200-200h80q17 0 28.5 11.5T320-160q0 17-11.5 28.5T280-120H160q-17 0-28.5-11.5T120-160v-120q0-17 11.5-28.5T160-320q17 0 28.5 11.5T200-280v80Zm560 0v-80q0-17 11.5-28.5T800-320q17 0 28.5 11.5T840-280v120q0 17-11.5 28.5T800-120H680q-17 0-28.5-11.5T640-160q0-17 11.5-28.5T680-200h80ZM200-760v80q0 17-11.5 28.5T160-640q-17 0-28.5-11.5T120-680v-120q0-17 11.5-28.5T160-840h120q17 0 28.5 11.5T320-800q0 17-11.5 28.5T280-760h-80Zm560 0h-80q-17 0-28.5-11.5T640-800q0-17 11.5-28.5T680-840h120q17 0 28.5 11.5T840-800v120q0 17-11.5 28.5T800-640q-17 0-28.5-11.5T760-680v-80Z\"/>"
  },
  "web_asset": {
    "label": "Float panel",
    "group": "menu",
    "svg": "<path fill=\"currentColor\" stroke=\"none\" transform=\"translate(0 16) scale(0.016666666667)\" d=\"M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm0-80h640v-400H160v400Z\"/>"
  },
  "layers": {
    "label": "Class prim",
    "group": "prim-types",
    "svg": "<path fill=\"currentColor\" stroke=\"none\" transform=\"translate(0 16) scale(0.016666666667)\" d=\"M161-366q-16-12-15.5-31.5T162-429q11-8 24-8t24 8l270 209 270-209q11-8 24-8t24 8q16 12 16.5 31.5T799-366L529-156q-22 17-49 17t-49-17L161-366Zm270 8L201-537q-31-24-31-63t31-63l230-179q22-17 49-17t49 17l230 179q31 24 31 63t-31 63L529-358q-22 17-49 17t-49-17Zm49-64 230-178-230-178-230 178 230 178Zm0-178Z\"/>"
  },
  "account_tree": {
    "label": "Node graph",
    "group": "prim-types",
    "svg": "<path fill=\"currentColor\" stroke=\"none\" transform=\"translate(0 16) scale(0.016666666667)\" d=\"M600-200v-40h-80q-33 0-56.5-23.5T440-320v-320h-80v40q0 33-23.5 56.5T280-520H160q-33 0-56.5-23.5T80-600v-160q0-33 23.5-56.5T160-840h120q33 0 56.5 23.5T360-760v40h240v-40q0-33 23.5-56.5T680-840h120q33 0 56.5 23.5T880-760v160q0 33-23.5 56.5T800-520H680q-33 0-56.5-23.5T600-600v-40h-80v320h80v-40q0-33 23.5-56.5T680-440h120q33 0 56.5 23.5T880-360v160q0 33-23.5 56.5T800-120H680q-33 0-56.5-23.5T600-200ZM160-760v160-160Zm520 400v160-160Zm0-400v160-160Zm0 160h120v-160H680v160Zm0 400h120v-160H680v160ZM160-600h120v-160H160v160Z\"/>"
  },
  "animation": {
    "label": "Animation",
    "group": "prim-types",
    "svg": "<path fill=\"currentColor\" stroke=\"none\" transform=\"translate(0 16) scale(0.016666666667)\" d=\"M360-80q-58 0-109-22t-89-60q-38-38-60-89T80-360q0-81 42-148t110-102q20-39 49.5-68.5T350-728q33-68 101-110t149-42q58 0 109 22t89 60q38 38 60 89t22 109q0 85-42 150T728-350q-20 39-49.5 68.5T610-232q-35 68-102 110T360-80Zm0-80q33 0 63.5-10t56.5-30q-58 0-109-22t-89-60q-38-38-60-89t-22-109q-20 26-30 56.5T160-360q0 42 16 78t43 63q27 27 63 43t78 16Zm120-120q33 0 64.5-10t57.5-30q-59 0-110-22.5T403-403q-38-38-60.5-89T320-602q-20 26-30 57.5T280-480q0 42 15.5 78t43.5 63q27 28 63 43.5t78 15.5Zm120-120q18 0 34.5-3t33.5-9q22-60 6.5-115.5T621-621q-38-38-93.5-53.5T412-668q-6 17-9 33.5t-3 34.5q0 42 15.5 78t43.5 63q27 28 63 43.5t78 15.5Zm160-78q20-26 30-57.5t10-64.5q0-42-15.5-78T741-741q-27-28-63-43.5T600-800q-35 0-65.5 10T478-760q59 0 110 22.5t89 60.5q38 38 60.5 89T760-478Z\"/>"
  },
  "mesh": {
    "label": "Mesh",
    "group": "prim-types",
    "svg": "<path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M2 3H14L12 13H4ZM2 3 8 9 14 3M4 13 8 9 12 13\"/>"
  },
  "sphere": {
    "label": "Sphere",
    "group": "prim-types",
    "svg": "<path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M14 8A6 6 0 1 1 2 8A6 6 0 1 1 14 8ZM8 2C4.5 5 4.5 11 8 14C11.5 11 11.5 5 8 2\"/>"
  },
  "cylinder": {
    "label": "Cylinder",
    "group": "prim-types",
    "svg": "<path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M3 4C3 1.5 13 1.5 13 4C13 6.5 3 6.5 3 4ZM3 4V12C3 14.5 13 14.5 13 12V4\"/>"
  },
  "cone": {
    "label": "Cone",
    "group": "prim-types",
    "svg": "<path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M8 2 2.5 12C2.5 14.5 13.5 14.5 13.5 12L8 2Z\"/>"
  },
  "capsule": {
    "label": "Capsule",
    "group": "prim-types",
    "svg": "<path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M4 6A4 4 0 0 1 12 6V10A4 4 0 0 1 4 10Z\"/>"
  },
  "plane": {
    "label": "Plane",
    "group": "prim-types",
    "svg": "<path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M2 10 7 4 14 6 9 12Z\"/>"
  },
  "surface": {
    "label": "NURBS surface",
    "group": "prim-types",
    "svg": "<path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M2 4C6 1 10 7 14 4V12C10 15 6 9 2 12ZM8 4V12M2 8C6 5 10 11 14 8\"/>"
  },
  "transform": {
    "label": "Transform",
    "group": "prim-types",
    "svg": "<path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M8 2V12H14M8 12 2 7M6 4 8 2 10 4M12 10 14 12 12 14\"/>"
  },
  "scope": {
    "label": "Scope",
    "group": "prim-types",
    "svg": "<path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M5 2H2V14H5M11 2H14V14H11\"/>"
  },
  "shader": {
    "label": "Shader",
    "group": "prim-types",
    "svg": "<path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M3 3H13V13H3ZM1.25 5H3M1.25 11H3M13 5H14.75M13 11H14.75M6 6 10 10M10 6 6 10\"/>"
  },
  "skeleton": {
    "label": "Skeleton",
    "group": "prim-types",
    "svg": "<path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M7 2H9V4H7ZM8 7V11M3 7H13M4 14 8 11 12 14\"/>"
  },
  "override": {
    "label": "Override prim",
    "group": "prim-types",
    "svg": "<path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M3 10 10 3 13 6 6 13H3ZM9 4 12 7\"/>"
  },
  "light-distant": {
    "label": "Distant light",
    "group": "prim-types",
    "svg": "<path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M2 8 6 12M8 2 12 6M3 12H6V9M9 6H12V3\"/>"
  },
  "light-rect": {
    "label": "Rectangular light",
    "group": "prim-types",
    "svg": "<path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M2 3H14V10H2ZM4 13V14M8 13V14M12 13V14\"/>"
  },
  "light-disk": {
    "label": "Disk light",
    "group": "prim-types",
    "svg": "<path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M2 5C2 1.5 14 1.5 14 5C14 8.5 2 8.5 2 5ZM4 11 2 14M8 11V14M12 11 14 14\"/>"
  },
  "light-dome": {
    "label": "Dome light",
    "group": "prim-types",
    "svg": "<path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M2 10A6 6 0 0 1 14 10ZM5 13H11\"/>"
  },
  "light-geometry": {
    "label": "Geometry light",
    "group": "prim-types",
    "svg": "<path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M2 6 6 2 10 6 6 10ZM13 2V4M12 8H14M8 13H10M2 13H4\"/>"
  },
  "light-cylinder": {"label":"Cylinder light","group":"prim-types","svg":"<path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M4 3C1 3 1 9 4 9C7 9 7 3 4 3ZM4 3H12C15 3 15 9 12 9H4M4 12V14M9 12V14M14 12V14\"/>"},
  "nurbs-curve": {"label":"NURBS curve","group":"prim-types","svg":"<path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M2 12C2 1 14 15 14 4\"/>"}
,
  "tune": {
    "label": "Properties",
    "group": "workspace",
    "svg": "<path fill=\"currentColor\" stroke=\"none\" transform=\"translate(0 16) scale(0.016666666667)\" d=\"M480-120q-17 0-28.5-11.5T440-160v-160q0-17 11.5-28.5T480-360q17 0 28.5 11.5T520-320v40h280q17 0 28.5 11.5T840-240q0 17-11.5 28.5T800-200H520v40q0 17-11.5 28.5T480-120Zm-320-80q-17 0-28.5-11.5T120-240q0-17 11.5-28.5T160-280h160q17 0 28.5 11.5T360-240q0 17-11.5 28.5T320-200H160Zm160-160q-17 0-28.5-11.5T280-400v-40H160q-17 0-28.5-11.5T120-480q0-17 11.5-28.5T160-520h120v-40q0-17 11.5-28.5T320-600q17 0 28.5 11.5T360-560v160q0 17-11.5 28.5T320-360Zm160-80q-17 0-28.5-11.5T440-480q0-17 11.5-28.5T480-520h320q17 0 28.5 11.5T840-480q0 17-11.5 28.5T800-440H480Zm160-160q-17 0-28.5-11.5T600-640v-160q0-17 11.5-28.5T640-840q17 0 28.5 11.5T680-800v40h120q17 0 28.5 11.5T840-720q0 17-11.5 28.5T800-680H680v40q0 17-11.5 28.5T640-600Zm-480-80q-17 0-28.5-11.5T120-720q0-17 11.5-28.5T160-760h320q17 0 28.5 11.5T520-720q0 17-11.5 28.5T480-680H160Z\"/>"
  },
  "terminal": {
    "label": "Console",
    "group": "workspace",
    "svg": "<path fill=\"currentColor\" stroke=\"none\" transform=\"translate(0 16) scale(0.016666666667)\" d=\"M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm0-80h640v-400H160v400Zm187-200-76-76q-12-12-11.5-28t12.5-28q12-11 28-11.5t28 11.5l104 104q12 12 12 28t-12 28L328-308q-11 11-27.5 11.5T272-308q-11-11-11-28t11-28l75-76Zm173 160q-17 0-28.5-11.5T480-320q0-17 11.5-28.5T520-360h160q17 0 28.5 11.5T720-320q0 17-11.5 28.5T680-280H520Z\"/>"
  }
});

/** A composed class/over keeps its authoring identity; definitions use their schema. */
export function primIcon({ type, specifier }) {
  if (specifier === 'class') return 'layers';
  if (specifier === 'over') return 'override';
  const types = {
    Xform: 'transform', Scope: 'scope', Mesh: 'mesh', Cube: 'view_in_ar', Sphere: 'sphere',
    Cylinder: 'cylinder', Cone: 'cone', Capsule: 'capsule', Plane: 'plane',
    NurbsPatch: 'surface', BasisCurves: 'timeline', NurbsCurves: 'nurbs-curve',
    Camera: 'photo_camera', Material: 'palette', Shader: 'shader', NodeGraph: 'account_tree',
    Points: 'scatter_plot', PointInstancer: 'animation', GeomSubset: 'mesh',
    Skeleton: 'skeleton', SkelRoot: 'skeleton', SkelAnimation: 'animation',
    Volume: 'waves', OpenVDBAsset: 'waves', Field3DAsset: 'waves',
    DistantLight: 'light-distant', RectLight: 'light-rect', DiskLight: 'light-disk',
    DomeLight: 'light-dome', GeometryLight: 'light-geometry', CylinderLight: 'light-cylinder',
    SphereLight: 'lightbulb', PortalLight: 'light-rect',
  };
  return types[type] || (/Light$/.test(type) ? 'lightbulb' : 'folder_open');
}

export function viewerIcon(name) {
  const entry = ICONS[name];
  if (!entry) throw new Error(`Unknown viewer icon: ${name}`);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 16 16');svg.setAttribute('width','16');svg.setAttribute('height','16');
  svg.setAttribute('class','usd-icon');svg.dataset.icon=name;svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
  svg.innerHTML=entry.svg;return svg;
}
export const transportIcon = viewerIcon;
