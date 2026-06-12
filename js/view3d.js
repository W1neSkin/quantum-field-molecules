// WebGL2 volume raymarcher: the molecule as a glowing cloud of field density.
// Emission-absorption compositing, front-to-back; signed fields are two-colored
// by the sign of psi. Orbit camera: drag to rotate, wheel to zoom.
(function (App) {
  "use strict";

  var VS = "#version 300 es\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2))*2.0-1.0;gl_Position=vec4(p,0.,1.);}";

  var FS = "#version 300 es\nprecision highp float;precision highp sampler3D;\n" +
    "uniform sampler3D uVol;uniform vec3 uCam,uRight,uUp,uFwd,uBMin,uBMax;\n" +
    "uniform vec2 uView;uniform float uTanF;uniform int uSigned;out vec4 oC;\n" +
    "void main(){\n" +
    " vec2 ndc=(gl_FragCoord.xy/uView)*2.0-1.0;\n" +
    " vec3 dir=normalize(uFwd+uRight*ndc.x*uTanF*(uView.x/uView.y)+uUp*ndc.y*uTanF);\n" +
    " vec3 inv=1.0/dir;vec3 ta=(uBMin-uCam)*inv,tb=(uBMax-uCam)*inv;\n" +
    " vec3 tmn=min(ta,tb),tmx=max(ta,tb);\n" +
    " float t0=max(max(tmn.x,tmn.y),tmn.z),t1=min(min(tmx.x,tmx.y),tmx.z);\n" +
    " t0=max(t0,0.0);if(t1<=t0){oC=vec4(0.);return;}\n" +
    " const int NS=128;float dt=(t1-t0)/float(NS);\n" +
    " vec3 col=vec3(0.);float acc=0.;\n" +
    " vec3 cOr=vec3(0.86,0.55,0.34),cBl=vec3(0.42,0.65,0.95),cHi=vec3(0.97,0.85,0.55);\n" +
    " for(int s=0;s<NS;s++){\n" +
    "  vec3 p=uCam+dir*(t0+(float(s)+0.5)*dt);\n" +
    "  vec3 uvw=(p-uBMin)/(uBMax-uBMin);\n" +
    "  float r=texture(uVol,uvw).r;\n" +
    "  float val;vec3 c;\n" +
    "  if(uSigned==1){float q=r*2.0-1.0;val=abs(q*q);c=q>0.0?cOr:cBl;}\n" +
    "  else{val=r*r;c=mix(cBl,cHi,smoothstep(0.03,0.55,val));}\n" +
    "  float a=1.0-exp(-2.6*pow(val,0.85)*dt);\n" +
    "  col+=(1.0-acc)*a*c;acc+=(1.0-acc)*a;\n" +
    "  if(acc>0.985)break;\n" +
    " }\n" +
    " oC=vec4(col,acc);\n" +
    "}";

  var VS_PTS = "#version 300 es\nlayout(location=0) in vec3 aPos;\n" +
    "uniform vec3 uCam,uRight,uUp,uFwd;uniform float uTanF,uAspect,uDist;\n" +
    "void main(){vec3 rel=aPos-uCam;float z=dot(rel,uFwd);\n" +
    " gl_Position=vec4(dot(rel,uRight)/(uTanF*uAspect),dot(rel,uUp)/uTanF,0.5*z,z);\n" +
    " gl_PointSize=clamp(9.0*uDist/max(z,0.01),3.0,16.0);}";

  var FS_PTS = "#version 300 es\nprecision highp float;out vec4 oC;\n" +
    "void main(){float d=length(gl_PointCoord-0.5);\n" +
    " float a=smoothstep(0.5,0.40,d)*smoothstep(0.20,0.30,d);\n" +
    " oC=vec4(vec3(0.83)*a*0.9,a*0.9);}";

  var VS_LINE = "#version 300 es\nlayout(location=0) in vec3 aPos;\n" +
    "uniform vec3 uCam,uRight,uUp,uFwd;uniform float uTanF,uAspect;\n" +
    "void main(){vec3 rel=aPos-uCam;float z=dot(rel,uFwd);\n" +
    " gl_Position=vec4(dot(rel,uRight)/(uTanF*uAspect),dot(rel,uUp)/uTanF,0.5*z,z);}";

  var FS_LINE = "#version 300 es\nprecision highp float;uniform vec4 uColor;out vec4 oC;\n" +
    "void main(){oC=vec4(uColor.rgb*uColor.a,uColor.a);}";

  // covalent radii (Cordero 2008), angstrom; bond if d < 1.25*(r1+r2)
  var COV_R = [0, 0.31, 0.28, 1.28, 0.96, 0.84, 0.76, 0.71, 0.66, 0.57, 0.58];
  var BOHR = 1.8897259886;

  var gl, canvas, labelsEl, progVol, progPts, progLine, tex;
  var ptsBuf, bondBuf, boxBuf, nAtoms = 0, nBondVerts = 0;
  var atomsCache = [];
  var cam = { yaw: 0.7, pitch: 0.3, dist: 2.4 };
  var box = null;

  function compile(vsSrc, fsSrc) {
    function sh(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  function supported() {
    if (gl) return true;
    var c = document.createElement("canvas");
    return !!c.getContext("webgl2");
  }

  function init(canvasEl, labelsContainer) {
    canvas = canvasEl;
    labelsEl = labelsContainer || null;
    // preserveDrawingBuffer keeps the frame readable for PNG export
    gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true });
    if (!gl) return false;
    progVol = compile(VS, FS);
    progPts = compile(VS_PTS, FS_PTS);
    progLine = compile(VS_LINE, FS_LINE);
    tex = gl.createTexture();
    ptsBuf = gl.createBuffer();
    bondBuf = gl.createBuffer();
    boxBuf = gl.createBuffer();
    gl.createVertexArray && gl.bindVertexArray(gl.createVertexArray());

    var dragging = false, lx = 0, ly = 0;
    canvas.addEventListener("pointerdown", function (e) {
      dragging = true; lx = e.clientX; ly = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      cam.yaw += (e.clientX - lx) * 0.008;
      cam.pitch = Math.max(-1.45, Math.min(1.45, cam.pitch + (e.clientY - ly) * 0.008));
      lx = e.clientX; ly = e.clientY;
      render();
    });
    canvas.addEventListener("pointerup", function () { dragging = false; });
    canvas.addEventListener("wheel", function (e) {
      e.preventDefault();
      cam.dist = Math.max(1.4, Math.min(7, cam.dist * Math.exp(e.deltaY * 0.0012)));
      render();
    }, { passive: false });
    return true;
  }

  // volume: {data: Uint8Array(N^3), signed}; prep3d provides bounds; atoms for markers
  function setVolume(prep3d, volume, atoms) {
    var N = App.grid3d.N;
    box = prep3d.bounds;
    gl.bindTexture(gl.TEXTURE_3D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, N, N, N, 0, gl.RED, gl.UNSIGNED_BYTE, volume.data);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    tex.signed = volume.signed ? 1 : 0;

    var pts = new Float32Array(atoms.length * 3);
    atoms.forEach(function (a, i) { pts.set(a.xyz, i * 3); });
    nAtoms = atoms.length;
    atomsCache = atoms;
    gl.bindBuffer(gl.ARRAY_BUFFER, ptsBuf);
    gl.bufferData(gl.ARRAY_BUFFER, pts, gl.STATIC_DRAW);

    // bond sticks by covalent radii
    var bonds = [];
    for (var i = 0; i < atoms.length; i++) {
      for (var j = i + 1; j < atoms.length; j++) {
        var dx = atoms[i].xyz[0] - atoms[j].xyz[0];
        var dy = atoms[i].xyz[1] - atoms[j].xyz[1];
        var dz = atoms[i].xyz[2] - atoms[j].xyz[2];
        var lim = 1.25 * (COV_R[atoms[i].Z] + COV_R[atoms[j].Z]) * BOHR;
        if (Math.sqrt(dx * dx + dy * dy + dz * dz) < lim) {
          bonds.push(atoms[i].xyz[0], atoms[i].xyz[1], atoms[i].xyz[2],
                     atoms[j].xyz[0], atoms[j].xyz[1], atoms[j].xyz[2]);
        }
      }
    }
    nBondVerts = bonds.length / 3;
    gl.bindBuffer(gl.ARRAY_BUFFER, bondBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(bonds), gl.STATIC_DRAW);

    // wireframe of the compute volume
    var c = box.center, h = box.half, corners = [];
    for (i = 0; i < 8; i++) {
      corners.push([c[0] + ((i & 1) ? h : -h), c[1] + ((i & 2) ? h : -h), c[2] + ((i & 4) ? h : -h)]);
    }
    var E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    var be = [];
    E.forEach(function (e) { be = be.concat(corners[e[0]], corners[e[1]]); });
    gl.bindBuffer(gl.ARRAY_BUFFER, boxBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(be), gl.STATIC_DRAW);

    if (labelsEl) {
      labelsEl.innerHTML = atoms.map(function (a) {
        return "<span>" + App.SYMBOLS[a.Z] + "</span>";
      }).join("");
    }
    render();
  }

  function render() {
    if (!box) return;
    var w = canvas.width, h = canvas.height;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    var R = cam.dist * box.half;
    var cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    var cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    var camPos = [
      box.center[0] + R * cp * sy,
      box.center[1] + R * sp,
      box.center[2] + R * cp * cy
    ];
    var fwd = norm([box.center[0] - camPos[0], box.center[1] - camPos[1], box.center[2] - camPos[2]]);
    var right = norm(cross(fwd, [0, 1, 0]));
    var up = cross(right, fwd);
    var tanF = Math.tan(20 * Math.PI / 180);

    // orientation anchors under the cloud: volume frame, then bond sticks
    gl.useProgram(progLine);
    u3(progLine, "uCam", camPos); u3(progLine, "uRight", right); u3(progLine, "uUp", up); u3(progLine, "uFwd", fwd);
    gl.uniform1f(gl.getUniformLocation(progLine, "uTanF"), tanF);
    gl.uniform1f(gl.getUniformLocation(progLine, "uAspect"), w / h);
    gl.enableVertexAttribArray(0);
    gl.bindBuffer(gl.ARRAY_BUFFER, boxBuf);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.uniform4f(gl.getUniformLocation(progLine, "uColor"), 0.83, 0.83, 0.83, 0.10);
    gl.drawArrays(gl.LINES, 0, 24);
    gl.bindBuffer(gl.ARRAY_BUFFER, bondBuf);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.uniform4f(gl.getUniformLocation(progLine, "uColor"), 0.83, 0.83, 0.83, 0.30);
    gl.drawArrays(gl.LINES, 0, nBondVerts);

    gl.useProgram(progVol);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, tex);
    u3(progVol, "uCam", camPos); u3(progVol, "uRight", right); u3(progVol, "uUp", up); u3(progVol, "uFwd", fwd);
    u3(progVol, "uBMin", [box.center[0] - box.half, box.center[1] - box.half, box.center[2] - box.half]);
    u3(progVol, "uBMax", [box.center[0] + box.half, box.center[1] + box.half, box.center[2] + box.half]);
    gl.uniform2f(gl.getUniformLocation(progVol, "uView"), w, h);
    gl.uniform1f(gl.getUniformLocation(progVol, "uTanF"), tanF);
    gl.uniform1i(gl.getUniformLocation(progVol, "uSigned"), tex.signed);
    gl.uniform1i(gl.getUniformLocation(progVol, "uVol"), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.useProgram(progPts);
    gl.bindBuffer(gl.ARRAY_BUFFER, ptsBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    u3(progPts, "uCam", camPos); u3(progPts, "uRight", right); u3(progPts, "uUp", up); u3(progPts, "uFwd", fwd);
    gl.uniform1f(gl.getUniformLocation(progPts, "uTanF"), tanF);
    gl.uniform1f(gl.getUniformLocation(progPts, "uAspect"), w / h);
    gl.uniform1f(gl.getUniformLocation(progPts, "uDist"), R);
    gl.drawArrays(gl.POINTS, 0, nAtoms);

    updateLabels(camPos, right, up, fwd, tanF, w / h);
  }

  // HTML labels follow the projected nuclei positions
  function updateLabels(camPos, right, up, fwd, tanF, aspect) {
    if (!labelsEl) return;
    var spans = labelsEl.children;
    var cw = canvas.clientWidth || canvas.width, ch = canvas.clientHeight || canvas.height;
    for (var i = 0; i < atomsCache.length && i < spans.length; i++) {
      var p = atomsCache[i].xyz;
      var rel = [p[0] - camPos[0], p[1] - camPos[1], p[2] - camPos[2]];
      var z = rel[0] * fwd[0] + rel[1] * fwd[1] + rel[2] * fwd[2];
      if (z <= 0.01) { spans[i].style.display = "none"; continue; }
      var x = (rel[0] * right[0] + rel[1] * right[1] + rel[2] * right[2]) / (z * tanF * aspect);
      var y = (rel[0] * up[0] + rel[1] * up[1] + rel[2] * up[2]) / (z * tanF);
      spans[i].style.display = "";
      spans[i].style.left = ((x + 1) / 2 * cw + 7) + "px";
      spans[i].style.top = ((1 - (y + 1) / 2) * ch - 12) + "px";
    }
  }

  function u3(p, name, v) { gl.uniform3f(gl.getUniformLocation(p, name), v[0], v[1], v[2]); }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; }

  App.view3d = { supported: supported, init: init, setVolume: setVolume, render: render };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
