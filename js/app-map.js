// Map controller extracted from app.js:
// density canvas rendering, lazy field preparation, and overlay arrows.
(function (App) {
  "use strict";

  function create(ctx) {
    var state = ctx.state;
    var t = ctx.t;
    var $ = ctx.$;
    var setStatus = ctx.setStatus;

    // displacement arrows of the picked vibrational mode, on top of the 2D map
    function drawVibArrows(canvas, prep) {
      if (state.vibPick < 0 || !state.vib || prep !== state.prepMain) return;
      var vec = state.vib.modes[state.vibPick].vec;
      var c = canvas;
      var cctx = c.getContext("2d");
      var W = c.width, H = c.height, S = W / App.heatmap.W;
      var ppbU = W / (2 * prep.halfU), ppbV = H / (2 * prep.halfV);
      var plane = prep.plane;
      // project displacements onto the slice plane, common scale to ~26 px
      var arrows = prep.result.atoms.map(function (a, ai) {
        var d = [vec[ai * 3], vec[ai * 3 + 1], vec[ai * 3 + 2]];
        var du = d[0] * plane.u[0] + d[1] * plane.u[1] + d[2] * plane.u[2];
        var dv = d[0] * plane.v[0] + d[1] * plane.v[1] + d[2] * plane.v[2];
        return { x: W / 2 + prep.proj[ai][0] * ppbU, y: H / 2 - prep.proj[ai][1] * ppbV,
                 dx: du * ppbU, dy: -dv * ppbV };
      });
      var mx = arrows.reduce(function (s, a) { return Math.max(s, Math.hypot(a.dx, a.dy)); }, 1e-9);
      var k = 26 * S / mx;
      var arrowColor = App.theme.color("vib-arrow");
      cctx.strokeStyle = arrowColor;
      cctx.fillStyle = arrowColor;
      cctx.lineWidth = 1.6 * S;
      arrows.forEach(function (a) {
        var dx = a.dx * k, dy = a.dy * k, len = Math.hypot(dx, dy);
        if (len < 3 * S) return; // atom barely moves in this plane
        var x2 = a.x + dx, y2 = a.y + dy;
        cctx.beginPath();
        cctx.moveTo(a.x, a.y); cctx.lineTo(x2, y2);
        cctx.stroke();
        var ang = Math.atan2(dy, dx);
        cctx.beginPath();
        cctx.moveTo(x2, y2);
        cctx.lineTo(x2 - 6 * S * Math.cos(ang - 0.45), y2 - 6 * S * Math.sin(ang - 0.45));
        cctx.lineTo(x2 - 6 * S * Math.cos(ang + 0.45), y2 - 6 * S * Math.sin(ang + 0.45));
        cctx.closePath();
        cctx.fill();
      });
    }

    // arrows of the static electric field E = -grad(phi) over the ESP map
    function drawEfield(canvas, prep) {
      if (!state.efield || state.mode.kind !== "esp" || !prep.espValues) return;
      var phi = prep.espValues;
      var FW = App.heatmap.W, FH = App.heatmap.H;
      var S = canvas.width / FW;
      var du = 2 * prep.halfU / FW, dv = 2 * prep.halfV / FH; // bohr per field px
      var pxPerBohrU = FW / (2 * prep.halfU), pxPerBohrV = FH / (2 * prep.halfV);
      var step = 32, h = 4;
      var arrows = [], emax = 1e-12;
      for (var py = step / 2; py < FH - h; py += step) {
        for (var px = step / 2; px < FW - h; px += step) {
          if (px < h || py < h) continue;
          // the singular 1/r region around each nucleus dwarfs the far field
          var near = false;
          for (var a = 0; a < prep.proj.length; a++) {
            var nx = FW / 2 + prep.proj[a][0] * pxPerBohrU, ny = FH / 2 - prep.proj[a][1] * pxPerBohrV;
            var ddx = (px - nx) / pxPerBohrU, ddy = (py - ny) / pxPerBohrV;
            if (ddx * ddx + ddy * ddy < 1) { near = true; break; }
          }
          if (near) continue;
          var Eu = -(phi[py * FW + px + h] - phi[py * FW + px - h]) / (2 * h * du);
          var Ev = (phi[(py + h) * FW + px] - phi[(py - h) * FW + px]) / (2 * h * dv);
          var m = Math.hypot(Eu, Ev);
          if (m > emax) emax = m;
          // screen y grows downward while the v axis points up
          arrows.push({ x: px, y: py, ux: Eu / (m || 1), uy: -Ev / (m || 1), m: m });
        }
      }
      var cctx = canvas.getContext("2d");
      var fg = App.theme.color("chart-fg");
      cctx.strokeStyle = fg; cctx.fillStyle = fg;
      cctx.lineWidth = 1.1 * S;
      cctx.globalAlpha = 0.65;
      arrows.forEach(function (ar) {
        var len = Math.sqrt(Math.min(ar.m / emax, 1)) * 13; // sqrt compresses the range
        if (len < 3) return;
        var x1 = (ar.x - ar.ux * len / 2) * S, y1 = (ar.y - ar.uy * len / 2) * S;
        var x2 = (ar.x + ar.ux * len / 2) * S, y2 = (ar.y + ar.uy * len / 2) * S;
        cctx.beginPath(); cctx.moveTo(x1, y1); cctx.lineTo(x2, y2); cctx.stroke();
        var hp = 3.4 * S, ang = Math.atan2(y2 - y1, x2 - x1);
        cctx.beginPath();
        cctx.moveTo(x2, y2);
        cctx.lineTo(x2 - hp * Math.cos(ang - 0.5), y2 - hp * Math.sin(ang - 0.5));
        cctx.lineTo(x2 - hp * Math.cos(ang + 0.5), y2 - hp * Math.sin(ang + 0.5));
        cctx.closePath(); cctx.fill();
      });
      cctx.globalAlpha = 1;
    }

    // slice-only fields (ESP, ELF, lap) are built lazily per geometry
    function ensureLazy(prep, ensureFn, statusKey) {
      ensureFn(prep, function (f) {
        setStatus(t(statusKey, { p: Math.round(f * 100) }), "busy");
      }, function () {
        setStatus(state.okStatus, "ok");
        if (state.prep === prep) drawMap();
      });
    }

    function drawMap() {
      var prep = state.prep, mode = state.mode;
      if (mode.kind === "esp" && !prep.espValues) {
        ensureLazy(prep, App.esp.ensure, "status.esp");
        return;
      }
      if ((mode.kind === "elf" || mode.kind === "lap") && !prep.elfValues) {
        ensureLazy(prep, App.fields2d.ensure, "status.fields");
        return;
      }
      App.heatmap.draw($("density"), prep, mode);
      drawVibArrows($("density"), prep);
      drawEfield($("density"), prep);
    }

    return { drawMap: drawMap };
  }

  App.appMap = { create: create };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
